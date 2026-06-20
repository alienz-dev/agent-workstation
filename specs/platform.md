# Spec: Agent Workstation Platform

## Problem

AI coding agent infrastructure is fragmented across 6+ repos with overlapping databases, CLIs, and integration patterns. Developers use kiro, aider, claude-code — but lack orchestration, pipeline enforcement, and cross-session learning around those agents.

## Solution

**One repo. One install. Everything.**

Agent Workstation is an orchestration platform that hosts existing coding agents (kiro, aider, claude-code, codex) via Zellij panes and provides: spawn coordination, pipeline enforcement, briefing preparation, result collection, knowledge management, multi-agent communication, and development methodology.

It is NOT a coding agent. It does not have an LLM loop. It launches, coordinates, and enforces quality around agents that already exist.

```
agent-workstation/
├── packages/
│   ├── cli/          — aw binary (TypeScript)
│   ├── core/         — types, state, orchestration, briefings (TypeScript)
│   ├── daemon/       — session daemon, Zellij lifecycle (Python)
│   ├── plugins/      — issues, knowledge, browser, devops (TypeScript)
│   └── adapters/     — kiro, aider, claude-code, generic (TypeScript)
├── methodology/
│   ├── workflow/     — SDD, TRIO, pipeline, grill, retro
│   ├── roles/        — 12 agent role definitions
│   ├── templates/    — project scaffold (constitution.yml, CONTEXT.md, etc.)
│   └── quality/      — gate specs, review tier definitions
├── docs/             — user-facing guides
└── specs/            — platform specifications
```

### What It Does

1. **Spawns agents** — launches kiro/aider/claude-code in Zellij panes with prepared briefings
2. **Enforces pipeline** — FSM prevents skipping quality steps (plan→test→sprint→review→done)
3. **Builds briefings** — assembles context, constraints, heuristics, owned files
4. **Collects results** — parses result files, validates structure, updates state
5. **Manages communication** — message queue between agents, notifications on completion
6. **Learns across sessions** — heuristics, gotchas, post-session reflection
7. **Tracks state** — plans, tasks, issues, agents, sessions in unified SQLite
8. **Coordinates concurrency** — file claims, rate limits, max children, circuit breakers
9. **Provides methodology** — SDD, TRIO, roles, templates, quality gates

### What It Does NOT Do

- Run LLM inference
- Execute tool calls
- Stream LLM responses
- Manage context windows

### Interaction Pattern

```
aw spawn coder "fix the auth bug"
  → reads methodology/roles/coder.md → applies constraints
  → builds briefing (task + context + heuristics + deniedPaths)
  → daemon spawns Zellij pane (kiro-cli with briefing)
  → kiro does all the coding
  → kiro writes result file
  → daemon detects pane close → notifies parent
  → aw validates result → checks gate → advances pipeline
```

## Acceptance Criteria (EARS)

### Core Platform

1. WHEN user runs `aw init` in a project directory THE system SHALL copy templates from `methodology/templates/` into the project, create `.agents/workstation.db`, and register with daemon.

2. WHEN user runs `aw doctor` THE system SHALL verify: Node ≥22, daemon reachable, database healthy, Zellij session active, constitution.yml valid — reporting each as PASS/FAIL with remediation.

3. WHEN user runs `aw spawn <agent> "<task>"` THE system SHALL build a briefing, send spawn request to daemon, and report spawn ID + result path within 2 seconds.

4. WHEN the daemon receives a spawn request THE system SHALL enforce pipeline policy (role constraints, rate limits, max children) BEFORE launching the agent pane.

5. WHILE a spawned agent is running THE system SHALL track status with heartbeat updates every 30 seconds.

6. WHEN a spawned agent's Zellij pane closes THE system SHALL detect within 5 seconds, read result file, update database, and notify parent.

7. WHEN user runs `aw status` THE system SHALL display active agents, roles, durations, and pipeline stage in table format.

### Agent Hosting (Adapters)

8. WHEN spawning with kiro adapter THE system SHALL launch `kiro-cli chat` in Zellij pane with briefing as initial prompt and agent JSON for role config.

9. WHEN spawning with aider adapter THE system SHALL launch `aider --message "<task>" --yes` with relevant files.

10. WHEN spawning with claude-code adapter THE system SHALL launch `claude --print --message "<task>"` with project context.

11. WHEN spawning with generic adapter THE system SHALL launch configured command, passing `AW_BRIEFING_PATH` and `AW_RESULT_PATH` as environment variables.

### Pipeline & Workflow

12. WHEN a project has `.agents/constitution.yml` with workflow section THE system SHALL enforce FSM transitions and reject invalid spawn requests.

13. WHEN advancing pipeline THE system SHALL require machine-checkable evidence (exit code 0 from verification command).

14. IF gate verification exits non-zero THEN THE system SHALL block transition, record in audit log, and report to requesting agent.

15. WHERE `information_barrier: true` THE system SHALL exclude spec content from coder briefings.

16. WHERE `max_fix_cycles: N` THE system SHALL fail sprint after N unsuccessful attempts.

### Error Classification & Recovery

17. WHEN an agent fails THE system SHALL classify as: transient (retry), permanent (escalate), budget (stop), or structural (re-plan).

18. WHEN transient failure THE system SHALL retry with backoff (30s, 60s, 120s) up to max retries.

19. IF 3 consecutive same-class failures THEN THE system SHALL activate circuit breaker (30s cool-down).

20. WHEN daemon restarts THE system SHALL reconcile persisted state against running panes and recover in-flight tasks.

### Briefing & Results

21. WHEN spawning THE system SHALL write briefing at `/tmp/<id>-briefing.md` with: task, context (≤5KB inline), constraints, owned files, verification command, heuristics (≤3).

22. WHEN agent completes THE system SHALL expect result with: `## Status: PASS|FAIL|PARTIAL|BLOCKED`, `## Summary`, `## Changes Made`, `## Verification Evidence`.

23. IF result missing `## Status:` THEN THE system SHALL reject and mark agent FAILED.

### State & Knowledge

24. WHEN `aw issue open "<title>"` THE system SHALL create markdown file + SQLite row with state `open`.

25. WHEN `aw heuristic add` THE system SHALL store with timestamp, confidence, source context.

26. WHEN spawning THE system SHALL query matching heuristics and include top 3 in briefing.

27. WHEN session ends THE system SHALL run post-session reflection and propose heuristic candidates.

### Orchestration

28. WHEN `aw plan load <file>` THE system SHALL parse markdown into tasks with dependencies (DAG).

29. WHEN `aw plan dispatch` THE system SHALL spawn agents for all tasks with deps satisfied (DAG scheduling).

30. WHEN task completes THE system SHALL immediately dispatch newly-unblocked downstream tasks.

31. WHEN `aw knowledge search "<query>"` THE system SHALL search vault, issues, heuristics, history — ranked results.

32. WHEN `aw review request` THE system SHALL calculate blast radius and spawn appropriate reviewer tier.

### Communication

33. WHEN `aw send <role> "<msg>"` THE system SHALL queue and deliver to target pane within 5 seconds.

34. WHEN parent has `--subscribe` THE system SHALL inject `[system] [DONE]` when child completes.

### Methodology

35. WHEN `aw init` THE system SHALL copy SDD templates (constitution, CONTEXT, STATUS, specs/) from `methodology/templates/`.

36. WHEN spawning an agent THE system SHALL read role definition from `methodology/roles/<role>.md` and apply deniedPaths + constraints to briefing.

## Non-Goals

- Building a coding agent / LLM runtime
- Tool execution engine
- Context window management
- IDE/editor integration
- Cloud-hosted multi-tenant
- Windows native (WSL2 path)

## Coverage

| Dev Case | How |
|----------|-----|
| Single task | `aw spawn coder "fix bug"` → kiro in pane → result |
| Full SDD pipeline | planner → test-manager → sprint-manager → reviewer |
| Multi-agent plan | `aw plan load && aw plan dispatch` (DAG) |
| Use aider | `aw spawn --adapter aider coder "task"` |
| Use claude-code | `aw spawn --adapter claude-code coder "task"` |
| Issues | `aw issue open/list/close` |
| Learning | Heuristics + post-session reflection |
| Crash recovery | Daemon reconciliation |
| Quality enforcement | Pipeline gates + information barrier + review tiers |
| Research | `aw spawn researcher "investigate X"` |
| New project | `aw init` → full SDD scaffold from methodology/ |

### Design Pipeline (UI Tasks)

37. WHEN spawning ui-designer role THE system SHALL load `DESIGN.md` from project root and `.interface-design/system.md` if present, including both as constraints in the briefing.

38. WHEN a spawn config includes `reference` field THE system SHALL resolve the reference path and pass `--reference <path>` to design-grade.sh during gate evaluation.

39. WHEN sprint-manager wave modifies UI files (.tsx, .jsx, .vue, .svelte, .css, .scss, .html) THE system SHALL run design gate (design-grade.sh) after GREEN gate passes.

40. IF design gate scores total < 6.0 OR token_fidelity < 8 THEN THE system SHALL re-dispatch coder with grade feedback, up to max_visual_retries (default 2).

41. WHERE `.agents/design/references/` contains HTML files THE system SHALL auto-match reference to task by filename convention (`<task-name>.html`) or use `default.html` as fallback.

42. WHEN ui-designer completes THE system SHALL persist design decisions to `.interface-design/system.md` and updated tokens to project `DESIGN.md`.
