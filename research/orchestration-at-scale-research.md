# Research: Production Multi-Agent Orchestration at Scale

**Date:** 2026-06-17
**Status:** complete
**Scope:** Production patterns for multi-agent failure recovery, concurrent coordination, quality gates, state persistence, scaling, and wave/plan execution — with distributed systems parallels.

---

## Executive Summary

Production multi-agent orchestration is a distributed systems problem wearing an AI hat. The patterns that work — supervision trees, reconciliation loops, durable execution, DAG scheduling — were solved decades ago in Erlang/OTP, Kubernetes, and Temporal. Our current architecture (planner→sprint-manager→coder with file-based results, pipeline FSM, and daemon-mediated communication) aligns with the proven "orchestration hub" topology that dominates 2026 production deployments. Key gaps: (1) no checkpoint-and-resume for mid-task agent crashes, (2) file-based state won't survive daemon restart, (3) quality gates lack the deterministic/LLM-judged split that scales, and (4) wave dispatch should evolve toward full DAG scheduling with dynamic re-planning.

---

## 1. Multi-Agent Failure Recovery

### 1.1 The Taxonomy of Agent Failures

Drawing from Temporal's failure classification (proven in production for 5+ years):

| Failure Type | Retry? | Agent Example | Correct Response |
|---|---|---|---|
| **Transient** | Yes, immediate | API rate limit, network blip | Exponential backoff |
| **Intermittent** | Yes, with delay | Model returns malformed JSON occasionally | Retry 2-3x with jitter |
| **Permanent** | No | Invalid file path, impossible task specification | Escalate to parent or re-plan |
| **Catastrophic** | No | Agent crashes mid-task, pane dies | Checkpoint recovery or re-spawn |

### 1.2 Erlang/OTP Supervisor Model — Direct Parallel

Erlang's supervision model maps precisely to agent orchestration:

| Erlang Concept | Agent Workstation Equivalent | Status |
|---|---|---|
| **Supervisor** | Sprint-manager / Planner | ✅ Implemented |
| **Worker process** | Coder agent in a pane | ✅ Implemented |
| **one_for_one** strategy | Re-spawn just the failed coder | ✅ Implemented (BLOCKED → re-spawn) |
| **one_for_all** strategy | Restart entire wave on shared-state corruption | ❌ Not implemented |
| **rest_for_one** strategy | Restart downstream agents in a dependency chain | ❌ Not implemented |
| **Max restart intensity** | "max 3 fix cycles" limit | ✅ Implemented |
| **Process isolation** | Zellij pane isolation (separate process, own heap) | ✅ Implemented |
| **Let it crash** philosophy | Result status FAIL → parent handles | ✅ Implemented |

**Vega runtime** (v0.7.0, Go, MIT) is the first production framework to literally port OTP supervision to AI agents:
- 7 error classifications: 4 retry (RateLimit, Overloaded, Timeout, Temporary) and 3 fail (Authentication, InvalidRequest, BudgetExceeded)
- Three restart strategies: OneForOne, OneForAll, RestForOne
- SQLite persistence for process state
- Every state change goes through one event bus

**Key insight from Vega:** The supervisor block is "the part most agent frameworks don't have." Our architecture has this implicitly in the sprint-manager, but it's not formally classified by error type.

### 1.3 Checkpoint-and-Resume vs Start-From-Scratch

**When to checkpoint-and-resume:**
- Long-running tasks (>5 minutes of work)
- Tasks that have completed expensive sub-steps (API calls, file generation)
- Tasks where prior progress is verifiable (files exist, tests pass for completed portions)

**When to start from scratch:**
- Short tasks where restart is cheaper than checkpoint management
- Tasks where partial state may be corrupted
- When the failure indicates a fundamental misunderstanding of the task

**Temporal's pattern (proven at scale):**
```
recoverableStep(activityName, fn):
  while true:
    try:
      result = await fn()
      return result
    catch (permanentFailure):
      updateStatus('PENDING_FIX', activityName)
      await condition(() => retryRequested)  // suspend, zero resources
      retry with corrected data
```

This "pause on permanent failure, resume from exact point" pattern is directly applicable. Our current "BLOCKED → re-spawn" loses all progress. The fix: write intermediate state to result files at each major step.

### 1.4 Circuit Breaker Pattern for Agents

When an agent keeps failing (e.g., the model is hallucinating, the file is genuinely unfixable):

```
Circuit States:
  CLOSED  → normal operation (attempts pass through)
  OPEN    → all attempts fail fast for recovery_timeout (30s)
  HALF-OPEN → allow one attempt; if passes → CLOSED, if fails → OPEN

Config:
  failure_threshold: 3 consecutive failures
  recovery_timeout: 30-60 seconds
  half_open_max: 1
```

**Our gap:** We have `max fix cycles` (default 3) but no backoff between attempts. After 3 failures we escalate, but we don't give the system time to recover (e.g., rate limits clearing).

### 1.5 Partial Progress Preservation

The "step 7 of 10" problem. Proven approaches:

1. **File-system as checkpoint** (our approach): Each committed file is a checkpoint. If an agent crashes after writing 7 files, those 7 files exist. Re-spawn the agent with "complete tasks 8-10 only."
2. **Saga compensation** (Temporal): Register compensating actions before each forward step. If step 7 fails, roll back steps 6→1 in reverse.
3. **Idempotent steps** (production pattern): Design each task to be safely re-run. Use hash checks to skip already-completed work.

**Recommendation:** Our file-claim system already provides implicit checkpointing. Enhance with explicit progress markers in result files (e.g., `## Progress: 7/10 tasks complete`).

---

## 2. Concurrent Agent Coordination

### 2.1 File Conflict Resolution

Beyond our current exclusive file-claim approach:

| Strategy | Mechanism | Use Case |
|---|---|---|
| **Exclusive lock** (ours) | Agent claims files at spawn time | Works for independent tasks |
| **Optimistic concurrency** | Agents work freely; merge at commit | Adjacent code, different concerns |
| **Semantic lock** | Lock by concern/module, not file | When multiple files form one unit |
| **Last-writer-wins + merge** | Git-based 3-way merge | Only for non-overlapping changes |

**The blackboard pattern** (from production): Agents read/write to a shared state layer (Redis, filesystem). No direct agent-to-agent communication. State changes trigger next steps. Our `/tmp/<id>-result.md` files are a blackboard.

### 2.2 Kubernetes Reconciliation Loop — The Model for Plan Execution

K8s controllers use the reconciliation pattern:
```
loop:
  desired_state = read(plan)
  actual_state = observe(system)
  diff = desired_state - actual_state
  for each gap in diff:
    take_action(gap)
  sleep(interval)
```

Applied to agent orchestration:
```
loop:
  plan = read(plan.md)  // desired: all tasks DONE
  results = read(/tmp/*-result.md)  // actual: which tasks completed
  pending = plan.tasks.filter(t => !results[t.id] && deps_met(t))
  for each task in pending (up to max_children):
    spawn_agent(task)
  wait_for_any_completion()
```

**This is essentially what our daemon auto-dispatch already does.** The key K8s insight we're missing: **level-triggered, not edge-triggered**. The reconciler doesn't react to events; it periodically compares desired vs actual state. This makes it naturally idempotent and crash-recoverable — if the daemon restarts, it just re-reconciles.

### 2.3 Resource Contention

Production data from multiple sources:

- **CPU/Memory:** DigitalOcean reports 50-90% of agentic workloads are CPU (orchestration, JSON parsing, tool coordination). Each agent at ~2GB memory is confirmed in our system.
- **API rate limits:** Anthropic's production guidance: multi-agent research burns ~15x tokens of single-agent chat. Our max 3 children is conservative but appropriate.
- **Concurrency sweet spot:** Google's 2026 scaling study found centralized coordination improved performance by 80.9% on parallelizable work. Beyond 3-5 parallel agents, coordination costs scale exponentially (MIT "Stalled Pilot" study: 95% of AI agent pilots hit this).

**Is "max 3 children per parent" right?** Yes, with nuance:
- For coding (file conflicts): 3 is ideal. Beyond 3 parallel coders, merge conflicts and context drift dominate.
- For research/exploration (independent): Could safely increase to 5-7 since outputs don't conflict.
- For testing (read-only verification): Could increase to 8-10 since no write contention.

### 2.4 "From Spark to Fire" Cascade Paper (2026)

Critical finding: In hub topologies (our architecture), a single bad output from the hub cascades to 100% of specialists. In leaf-injection, only 9.7-15.9% contamination. This validates our design choice of having the planner own routing — but means **the planner is a single point of failure for correctness**.

Mitigation: The reviewer agent (adversarial, different model family) acts as a governance layer. Their defense layer pushed success from 0.32 to 0.89.

---

## 3. Quality Gates at Scale

### 3.1 The Deterministic + LLM-Judged Split

Proven production pattern (Codacy, Codewatcher, SonarQube all converge here):

| Gate Type | Mechanism | Speed | Use For |
|---|---|---|---|
| **Deterministic** | Type check, lint, test pass/fail | <10s | Non-negotiable rules |
| **LLM-judged** | Semantic review, intent alignment | 30-60s | Contextual quality |
| **Machine-verifiable** | Coverage thresholds, complexity metrics | <5s | Measurable standards |
| **Human-in-the-loop** | Manual review for high-risk | Minutes-hours | Irreversible actions |

**Our current approach maps well:**
- `npm run typecheck` → Deterministic ✅
- `npm run test` → Deterministic ✅  
- Reviewer agent (adversarial model) → LLM-judged ✅
- Hidden test pattern → Machine-verifiable ✅

### 3.2 Gate Speed Requirements

From production benchmarks:
- **Per-task gates** (lint, type-check): Must complete in <30 seconds or they bottleneck wave advancement
- **Per-wave gates** (integration test): Must complete in <2 minutes
- **End-of-pipeline gates** (full review): Can take 5-10 minutes (runs in parallel with next planning cycle)

**Our gap:** Gate timing is not explicitly budgeted. If `npm run typecheck` takes 9 seconds (cold) and we run it between every wave, that's fine. But if the reviewer agent takes 5 minutes and blocks the pipeline, that's a bottleneck.

### 3.3 Gate Failure: Same Agent vs Fresh Agent

Research consensus (CrewAI, Temporal, production post-mortems):

| Failure Mode | Strategy | Rationale |
|---|---|---|
| First failure | Retry same agent with feedback | Agent has context, cheap to retry |
| Second failure (same issue) | Fresh agent, clean context | Prior agent may be stuck in a reasoning rut |
| Third failure | Escalate to parent with full history | Structural problem, needs re-planning |
| Test failure after code change | Always fresh agent | The prior agent's "fix" was wrong; fresh eyes avoid confirmation bias |

**The MIT finding applies here:** Added stages only help when they add new exogenous signals. A fresh agent is valuable because it brings genuinely different reasoning, not just a re-prompt of the same one.

### 3.4 Hidden Test Pattern Validation

Our approach of withholding some tests from the implementing agent and running them as acceptance criteria is validated by:
- **Codacy (2026):** "Independent verification as an independent enforcement system" — the verifier must be different from the generator
- **CodeRabbit analysis:** AI-created PRs had 75% more logic/correctness errors than human code; hidden quality gates catch what self-review misses
- **Anthropic guidance:** Use a different model family for review than generation to avoid shared blind spots

---

## 4. State Persistence & Recovery

### 4.1 What State Must Survive Daemon Restart

| State Type | Current Storage | Survives Restart? | Fix |
|---|---|---|---|
| Plan (task definitions) | Markdown file | ✅ Yes | Already durable |
| Task status (PASS/FAIL) | /tmp/ result files | ⚠️ tmpfs clears on reboot | Move to project dir |
| Agent lifecycle (spawned, running) | Daemon memory | ❌ No | Persist to SQLite/JSON |
| File claims (which agent owns which file) | Daemon memory | ❌ No | Persist to state file |
| Pipeline stage (plan→sprint→review) | Daemon memory | ❌ No | Persist FSM state |
| Spawn history (retry counts, parent-child) | Daemon memory | ❌ No | Persist to state file |

### 4.2 Database vs Filesystem for Orchestration State

| Approach | Pros | Cons | When |
|---|---|---|---|
| **Filesystem (JSON/MD)** | Simple, human-readable, git-friendly | No transactions, race-prone | <10 concurrent agents |
| **SQLite** | ACID, fast reads, single-file, zero config | Single-writer bottleneck | 10-50 agents per project |
| **Redis** | Sub-ms latency, pub/sub, TTL | External dependency, memory cost | 50+ agents, multi-machine |
| **Temporal** | Full durable execution, built-in retry/resume | Heavy infrastructure | Enterprise scale |

**Recommendation for Agent Workstation:** SQLite. It's the sweet spot — ACID guarantees for state consistency, zero external deps, single file in the project. Vega uses this exact approach. Our scale (3-10 agents per project) fits perfectly.

### 4.3 Temporal's Key Insight: Separation of Concerns

Temporal separates:
- **Workflow state** (what step are we on?) → persisted to cluster, survives any crash
- **Activity execution** (the actual work) → can fail and retry independently
- **Search attributes** (queryable metadata) → enables routing blocked work to right handler

Our equivalent should be:
- **Plan state** (which tasks done/pending/blocked) → persist to file/SQLite
- **Agent execution** (the Zellij pane doing work) → can crash and re-spawn
- **Observability metadata** (why blocked, how long stuck) → persist for monitoring

### 4.4 Retention Policy

From production systems:
- **Active results:** Keep until plan completes + 1 hour
- **Completed plans:** Keep 7 days for debugging
- **Failed attempts:** Keep 24 hours (useful for understanding failure patterns)
- **Agent logs (pane output):** Keep until plan completes (these are large)

---

## 5. Scaling Patterns

### 5.1 Bottlenecks at 20+ Agents

From DigitalOcean's research and production post-mortems:

| Bottleneck | Threshold | Symptom | Fix |
|---|---|---|---|
| **Memory** | 3-5 agents @ 2GB each | OOM kills | Stale pane garbage collection |
| **File I/O** | 10+ agents writing /tmp/ | Write contention | Per-agent temp dirs |
| **API rate limits** | 5+ concurrent model calls | 429 responses, cascading delays | Token bucket / semaphore |
| **Daemon CPU** | 20+ agents polling for status | Daemon becomes bottleneck | Event-driven (we already use this) |
| **Context window** | N/A per agent but 15x cost | Budget explosion | Cost tracking per plan |

### 5.2 When File-Based Protocol Breaks Down

Our `/tmp/<id>-result.md` approach is elegant for:
- ✅ <10 concurrent agents
- ✅ Human-readable debugging
- ✅ No external dependencies
- ✅ Atomic write (write-then-rename)

It breaks at:
- ❌ 20+ agents (polling overhead, directory listing gets slow)
- ❌ Cross-machine orchestration (filesystem is local)
- ❌ Sub-second notification needs (we already mitigate with HTTP notify)
- ❌ State queries ("show me all BLOCKED tasks" requires scanning all files)

**Transition path:** File-based for results (keep human-readable), SQLite for orchestration state and queries. This is exactly what Vega does.

### 5.3 Cross-Project Orchestration

- **Single daemon per project:** Simpler, no cross-contamination. Our current approach.
- **Single daemon multiple projects:** Needed only for cross-project refactoring.
- **Recommendation:** Stay single-daemon-per-project until cross-project dependencies are a real requirement.

### 5.4 Observability Requirements

From production systems (DigitalOcean checklist, OpenTelemetry patterns):

Minimum viable agent observability:
1. **Per-agent:** spawn time, completion time, status, token usage, retry count
2. **Per-wave:** wall-clock time, pass rate, gate results
3. **Per-plan:** total duration, total tokens, total spawns, success rate
4. **Anomaly detection:** Agent stuck >5 min without heartbeat (we have this), cost spike alerts (we don't)

---

## 6. Wave/Plan Execution Patterns

### 6.1 DAG Scheduling vs Wave Model

| Approach | How It Works | Strengths | Weaknesses |
|---|---|---|---|
| **Wave model** (ours) | Group tasks by dependency level, run each level in parallel | Simple, predictable, easy to visualize | Underutilizes resources (fast tasks wait for slow ones in same wave) |
| **DAG scheduling** (Argo, Tekton) | Start each task as soon as all its dependencies complete | Maximum parallelism, no artificial waiting | More complex state tracking, harder to reason about progress |
| **Hybrid** (recommended) | DAG internally, wave boundaries for quality gates | Quality checkpoints without sacrificing parallelism | Moderate complexity |

**Argo Workflows production patterns that apply:**
- **Workflow of Workflows with Semaphore:** Parent spawns child workflows, semaphore limits concurrent execution. Maps to our "max 3 children per parent."
- **DAG with `depends`:** Tasks declare what they depend on, scheduler handles ordering. More flexible than waves.
- **Fan-out/Fan-in:** Scatter work to N agents, gather results before continuing. Already in our pattern.
- **TTL and garbage collection:** Without TTL, Argo's Kubernetes control plane degraded with 1500+ pods. Our stale pane detection is the equivalent.

### 6.2 Dynamic Re-Planning Mid-Execution

CI/CD systems handle this poorly (usually: cancel and restart). Better approaches from production:

1. **Temporal:** Workflow can modify its own future based on intermediate results. It doesn't re-plan; it adjusts.
2. **K8s controllers:** Reconciliation loop naturally handles spec changes mid-execution — just re-compare desired vs actual.
3. **Our approach should be:** If sprint-manager observes a structural problem (e.g., dependency was wrong, approach doesn't work), it signals planner to re-plan remaining tasks without discarding completed work.

### 6.3 Priority and Preemption

From CI/CD systems (Tekton, Argo):
- **Priority classes:** Urgent bugfix > feature work > refactoring
- **Preemption:** Higher-priority tasks can evict lower-priority agents
- **Our gap:** All tasks are equal priority. For now this is fine (single-plan execution), but needed for multi-plan scenarios.

### 6.4 Plan Cancellation and Rollback

Temporal's saga pattern:
```
Register compensation BEFORE executing forward step:
  compensations.unshift({
    forward: "createFile",
    compensate: "deleteFile"
  })
  
On abort:
  for comp in compensations (LIFO order):
    execute comp.compensate()
```

For coding tasks, this is often natural:
- `git stash` or `git checkout` the branch
- Remove created files
- Revert modified files

---

## 7. Distributed Systems Parallels Summary

| Distributed Systems Pattern | Agent Workstation Equivalent | Status |
|---|---|---|
| **Erlang supervisor tree** | Planner → Sprint-manager → Coder hierarchy | ✅ Architecture matches |
| **Erlang one_for_one restart** | Re-spawn single failed coder | ✅ Implemented |
| **Erlang max_restarts** | Max fix cycles (default 3) | ✅ Implemented |
| **Erlang error classification** | 7 categories (Vega) | ⚠️ We have PASS/FAIL/PARTIAL/BLOCKED but not error-type-specific retry |
| **K8s reconciliation loop** | Daemon auto-dispatch comparing plan vs results | ✅ Conceptually implemented |
| **K8s desired state** | Plan.md with task definitions | ✅ Implemented |
| **K8s health checks** | Heartbeat/stale pane detection (5 min) | ✅ Implemented |
| **Temporal durable execution** | Checkpoint-and-resume for long tasks | ❌ Not implemented |
| **Temporal search attributes** | Queryable task metadata for routing | ❌ Not implemented |
| **Temporal saga compensation** | Rollback on plan cancellation | ❌ Not implemented |
| **Argo DAG scheduling** | Task dependency graph execution | ⚠️ Wave model (simpler approximation) |
| **Argo semaphore** | Max 3 children per parent | ✅ Implemented |
| **Argo workflow-of-workflows** | Sprint-manager spawning coders | ✅ Implemented |
| **Circuit breaker** | Fail fast after repeated failures | ⚠️ We escalate but don't back off |
| **Event-driven pub/sub** | Signal bus + pane injection | ✅ Implemented |
| **Blackboard pattern** | /tmp/ result files as shared state | ✅ Implemented |
| **Idempotent operations** | File-claim ensures no duplicate work | ✅ Implemented |

---

## 8. Failure Mode Analysis

### What breaks when X happens:

| Scenario | Current Behavior | Severity | Improvement |
|---|---|---|---|
| **Coder crashes mid-task** | Stale pane detected after 5 min, task BLOCKED, re-spawned | Medium | Reduce detection to 2 min; preserve partial progress |
| **Sprint-manager crashes** | Orphaned coders continue working, results pile up unprocessed | High | Persist sprint state; planner detects orphan and re-spawns sprint-manager |
| **Daemon crashes** | All state lost, in-flight tasks continue but results unprocessed | Critical | Persist orchestration state to file/SQLite; reconcile on restart |
| **Model API 429s all agents** | All agents hit rate limit simultaneously, cascade of failures | High | Shared token bucket at daemon level; backoff coordination |
| **Plan has circular dependency** | Wave dispatch never advances | Medium | Validate DAG at parse time (detect cycles) |
| **Two agents claim same file** | Should not happen (file-claim system) | Low | Already handled |
| **Git conflicts between agents** | Sprint-manager must resolve or re-assign | Medium | Already handled via sequential commits |
| **Agent produces wrong code** | Caught by tests/review or not | High | Hidden test pattern + adversarial review (implemented) |
| **Re-plan invalidates in-flight work** | Currently: doesn't happen (plan is static) | N/A | Need: cancel in-flight tasks gracefully before re-plan |

---

## 9. Recommendations for Agent Workstation Orchestration

### Priority 1: Critical Gaps (implement now)

1. **Persist orchestration state to survive daemon restart**
   - Write plan progress, file claims, and pipeline stage to `<project>/.agent-state.json` or SQLite
   - On daemon start, reconcile state file against actual filesystem (K8s pattern)
   - Level-triggered reconciliation: compare desired state (plan) with actual state (result files)

2. **Error classification with type-specific retry**
   - Classify failures as: transient (retry with backoff), permanent (escalate), budget (stop), structural (re-plan)
   - Different retry strategies per classification (not just "3 attempts for everything")
   - Inspired by Vega's 7-category model

3. **Checkpoint intermediate progress**
   - For tasks with >3 sub-steps, write progress markers to result file
   - On re-spawn after crash, include "resume from step N" in the brief
   - File system is natural checkpoint: if files exist and pass lint, they're done

### Priority 2: Scale Readiness (implement before 10+ agents)

4. **Evolve wave dispatch toward DAG scheduling**
   - Allow tasks to declare dependencies explicitly (not just wave grouping)
   - Start tasks as soon as dependencies complete (don't wait for full wave)
   - Keep wave boundaries as optional quality gate checkpoints

5. **Add circuit breaker with backoff**
   - After 3 consecutive failures from same cause: 30-second cool-down
   - Prevent retry storms when the model API is degraded
   - Coordinate rate limiting at daemon level (shared budget across all agents)

6. **Quality gate timing budget**
   - Per-task gates: hard cap 30 seconds
   - Per-wave gates: hard cap 2 minutes  
   - If gate exceeds budget: log warning, proceed (don't block pipeline indefinitely)

### Priority 3: Production Hardening (implement before external users)

7. **Observability dashboard**
   - Per-plan metrics: duration, tokens, spawns, success rate
   - Anomaly detection: cost spikes, stuck agents, retry storms
   - Query interface for state: "show all BLOCKED tasks and why"

8. **Saga-style cancellation**
   - On plan abort: cleanly terminate in-flight agents, revert uncommitted changes
   - Register compensating actions before each forward step
   - LIFO rollback order

9. **Dynamic re-planning**
   - Sprint-manager can signal planner: "task X revealed that tasks Y, Z need restructuring"
   - Planner re-plans remaining tasks without discarding completed work
   - Completed tasks are never re-run unless explicitly invalidated

### What NOT to change:

- ✅ **Max 3 children per parent** — validated by research (beyond 3, coordination costs explode for coding tasks)
- ✅ **File-based results** — keep for human readability and debugging; add SQLite for queries
- ✅ **Orchestrator hierarchy** — planner→sprint-manager→coder is the proven "hub" topology
- ✅ **Different-model-family reviewer** — validated by cascade research and Codacy findings
- ✅ **Pipeline FSM** — state machine enforcement prevents invalid transitions
- ✅ **Pane-per-agent isolation** — provides the process isolation Erlang supervisors rely on

---

## 10. Sources

1. Lanham, M. "Multi-Agent in Production in 2026: What Actually Survived" (Medium, Apr 2026) — Framework comparison, topology failure modes, MIT/Google evidence
2. Temporal.io "Keep Business Processes Moving by Recovering Failed Steps Without Restarting" (May 2026) — recoverableStep pattern, saga compensation, search attributes
3. DigitalOcean "What Breaks When Multi-Agent Systems Scale" (Jun 2026) — State management taxonomy, observability requirements, infrastructure checklist
4. Codacy "Why Coding Agents Need Independent Quality Gates to Work at Scale" (Apr 2026) — Deterministic vs probabilistic verification, quality gate architecture
5. Vega (v3ga.dev, v0.7.0) — Erlang supervision model applied to AI agents: error classification, restart strategies, SQLite persistence
6. Hodgkins, M. "Argo Workflows - Proven Patterns from Production" (2025) — Workflow-of-Workflows with semaphore, TTL/GC, DAG patterns
7. markaicode.com "Production Agent Architecture — Avoiding the 5 Common Failures in 2026" (May 2026) — Redis state store, circuit breakers, async tool execution, scaling playbook
8. Smith, J. "Elixir's BEAM Is the Runtime AI Agents Want" (May 2026) — Process isolation, preemptive scheduling, supervision trees for agent orchestration
9. "From Spark to Fire" cascade paper (2026) — Topological fragility: hub injection = 100% failure, leaf = 9.7%; governance layer defense 0.32→0.89
10. Google 2026 scaling study — 180 configurations, centralized coordination +80.9% on parallelizable work, -39-70% on sequential planning
11. MIT "Stalled Pilot" study — Without new exogenous signals, added stages degrade performance: 90.7% → 22.5% accuracy over 5 relay stages
12. "Multi-Agent Coordination Hell: The 6 Patterns That Actually Survive Production in 2026" (Medium, May 2026) — Orchestrator-Worker, Blackboard, Supervisor/Verifier, Pub/Sub, Human-in-Loop, Idempotent Retry
