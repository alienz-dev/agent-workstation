# State of the Art: Multi-Agent Coding Platforms (2025-2026)

**Date:** 2026-06-16
**Status:** complete
**Scope:** Research on architecture patterns, communication protocols, orchestration frameworks, memory systems, workflow enforcement, and interop standards for multi-agent coding platforms.
**Relevance:** Direct input to Agent Workstation architecture design decisions.

---

## Executive Summary

The multi-agent coding platform landscape matured dramatically between 2025-2026. Three protocol layers have consolidated: **MCP** (agent→tool, de facto standard, 110M+ monthly SDK downloads), **A2A** (agent→agent, Google-led, 150+ partners, v1.0 March 2026), and the now-archived **ACP** (merged into A2A under Linux Foundation, August 2025). Orchestration frameworks split into three mental models: graph-based (LangGraph), role-based (CrewAI), and conversation-based (AutoGen), with LangGraph winning for production stateful workflows. Memory architecture shifted from "which vector DB?" to platform-level primitives (Anthropic Dreaming, Google Memory Bank) with long-context (1M tokens flat-priced) now a viable alternative for small fleets. Workflow enforcement converged on correctness-gated pipelines with independent judge agents.

**Key finding for Agent Workstation:** Our existing architecture (daemon + file protocol + Zellij panes + pipeline FSM) is architecturally sound and aligns with proven patterns. The main gaps are: (1) no structured tool schema standard (should adopt MCP/JSON Schema), (2) no cross-session memory consolidation, and (3) opportunity to expose an A2A-compatible Agent Card for future interop.

---

## 1. Agent Communication Protocols

### 1.1 Protocol Landscape (Consolidated as of June 2026)

| Protocol | Layer | Status | Backed By | Transport |
|----------|-------|--------|-----------|-----------|
| **MCP** | Agent → Tool | De facto standard | Anthropic → Linux Foundation (Dec 2025) | JSON-RPC over stdio/HTTP+SSE |
| **A2A** | Agent → Agent | v1.0 stable (March 2026) | Google, 150+ partners (AWS, Cisco, SAP) | JSON-RPC 2.0 over HTTP(S) |
| **ACP** | Agent → Agent | **Archived** (merged into A2A, Aug 2025) | IBM Research → Linux Foundation | REST-based (deprecated) |

**The consolidation story:** IBM's ACP merged into A2A under the Linux Foundation in August 2025. AutoGen retired into Microsoft Agent Framework. AGNTCY archived its own competing protocol. The market has settled on **MCP + A2A** as the two complementary layers.

### 1.2 Model Context Protocol (MCP)

**What it is:** Open standard for connecting AI agents to external tools, data sources, and services. "USB-C for AI applications."

**Key facts (June 2026):**
- 110M monthly SDK downloads (as of MCP Dev Summit, June 2026)
- Donated to Linux Foundation's Agentic AI Foundation (Dec 2025), co-founded with Block and OpenAI
- Adopted by Anthropic, OpenAI, and Google — all three major providers
- Official SDKs: TypeScript, Python, C#, Java, Swift
- 500+ public MCP servers in ecosystem
- November 2025 spec: async operations, statelessness, server identity, extensions
- July 2026 spec: stateless HTTP transport (stable)

**Three primitives:**
1. **Tools** — Functions the agent can call (JSON Schema for input validation)
2. **Resources** — Data entities fetched on-demand
3. **Prompts** — Reusable prompt templates

**Relevance to Agent Workstation:** MCP is the clear winner for tool definition. Our current zod-based tool schemas should target MCP-compatible JSON Schema output. This gives us interop with Claude Code, Cursor, ChatGPT, and any MCP-aware client for free.

### 1.3 Google Agent-to-Agent Protocol (A2A)

**What it is:** Open protocol for peer-to-peer AI agent collaboration — discovery, authentication, task delegation, and multi-turn interactions.

**Core concepts:**
- **Agent Card** — JSON metadata at `/.well-known/agent.json` describing capabilities, skills, auth requirements
- **Task** — Stateful unit of work (lifecycle: submitted → working → input-required → completed/failed)
- **Message** — Communication unit with role (user/agent) and typed Parts (Text/File/Data)
- **Artifact** — Generated output returned on task completion

**Interaction modes:**
- Request/Response (simple tasks)
- Streaming (SSE for real-time updates)
- Push Notifications (webhooks for long-running tasks)

**When A2A matters (vs doesn't):**
- ✅ Cross-organization agent collaboration
- ✅ Agent marketplaces / discovery
- ✅ Enterprise multi-vendor agent ecosystems
- ❌ Same-process agent coordination (overkill)
- ❌ Single-developer local workflow (our primary use case)

### 1.4 Assessment: Is Our File-Based + HTTP Approach Good Enough?

**Yes, for our current scope.** Our daemon-mediated, file-based result protocol with HTTP notifications is architecturally equivalent to A2A's task lifecycle but simpler:

| Our Approach | A2A Equivalent |
|---|---|
| `/tmp/<id>-result.md` with Status header | Task artifact with completion state |
| Daemon HTTP notify on pane close | Push notification webhook |
| Spawn command with task brief | Task submission message |
| Pipeline FSM blocking invalid transitions | Agent Card skill constraints |

**Recommendation:** Keep our current protocol for internal communication (simpler, lower latency, proven). Add an **optional A2A Agent Card** (`/.well-known/agent.json`) if we ever want external agents to discover and delegate to our workstation agents. Adopt **MCP JSON Schema** for tool definitions to get ecosystem interop.

---

## 2. Multi-Agent Orchestration Patterns

### 2.1 Framework Comparison

| Framework | Mental Model | Language | Best For | Production Readiness |
|-----------|---|---|---|---|
| **LangGraph** | Directed graph / state machine | Python, **TypeScript** | Complex stateful workflows, checkpointing | ⭐⭐⭐⭐⭐ (v1.0, Oct 2025) |
| **CrewAI** | Role-based teams | Python | Rapid prototyping, intuitive team metaphor | ⭐⭐⭐⭐ |
| **AutoGen** | Conversational group chat | Python, .NET | Dynamic multi-agent conversations, code execution | ⭐⭐⭐⭐ |
| **OpenAI Agents SDK** | Handoffs (successor to Swarm) | Python | Lightweight agent delegation, guardrails | ⭐⭐⭐⭐ |

### 2.2 LangGraph (Most Relevant to Us)

**Why it matters:** Only major framework with first-class TypeScript support. Graph-based state machines are exactly what we're building with our pipeline FSM.

**Key architecture:**
- Nodes = agent actions or LLM calls
- Edges = transitions (conditional, parallel, cyclic)
- State = typed dict flowing through graph with persistence
- Checkpointing = resume from any node on failure
- Human-in-the-loop = interrupt at any node

**Performance:** 25-35s for 4-agent pipeline (vs 45-60s CrewAI sequential). Native parallel node execution and async support.

**Hype vs proven:** LangGraph is proven at scale. LangGraph Cloud handles production deployments. LangSmith provides observability. The LangChain dependency adds weight but the graph engine itself is solid.

### 2.3 OpenAI Swarm → Agents SDK Pattern

**Swarm** (deprecated March 2025) defined the minimalist pattern: agents are system prompts + functions, handoffs are functions returning another agent. **OpenAI Agents SDK** is the production successor.

**Key insight:** The handoff pattern is exactly what we do with `kiro-ctl spawn`. Agent A decides it needs Agent B, executes a handoff function, context transfers. Our file-based result protocol is the "handoff return."

### 2.4 Cursor's Finding: Planner-Worker Pipeline

Cursor's background agents went through 3 iterations:
1. ❌ Flat structure (all agents access all files) → lock bottlenecks
2. ❌ Optimistic concurrency (work independently, merge) → agents became risk-averse
3. ✅ **Planner-Worker pipeline** — planners explore and create specs, workers execute without coordination

**This validates our architecture:** orchestrator→planner→sprint-manager→coder is the proven pattern. The key finding: **workers should not need to coordinate with each other** — the planner provides enough specification that workers can operate independently.

### 2.5 What's Best for Terminal + Daemon + Zellij Panes?

**Our model is closest to:** A custom implementation combining:
- LangGraph's FSM concept (our pipeline states)
- Swarm's handoff pattern (spawn with task brief, file-based return)
- Cursor's planner-worker isolation (denied paths, scoped tool access)

**We should NOT adopt** a full framework because:
- LangGraph/CrewAI/AutoGen are Python-first (we're TypeScript)
- They assume in-process agents sharing memory (we use process isolation via Zellij)
- Our daemon-mediated model is architecturally superior for our use case (crash isolation, independent context per agent)

**Verdict:** Our architecture is sound. The industry validates our approach. We can borrow concepts (state machines, typed state, checkpointing) without adopting the framework.

---

## 3. Agent Memory & Learning

### 3.1 Memory Architecture Landscape (June 2026)

The field shifted from "which vector DB" to **platform-level memory primitives:**

| Vendor | Memory Model | Architecture |
|---|---|---|
| **Anthropic** | Filesystem at `/mnt/memory/` + Dreaming | File-based, client-controlled storage + async consolidation |
| **Google** | Memory Bank (I/O 2026) | Identity-scoped database, cross-session |
| **OpenAI** | file_search (vector-store) | Vector similarity via Responses API |
| **Mem0** | Cross-vendor abstraction | Graph-enhanced, 41K stars, 14M downloads |

### 3.2 Anthropic "Dreaming" (May 6, 2026) — The Breakthrough

**What it is:** Async hippocampal-consolidation process that runs between agent sessions:
- Reviews session transcripts + existing memory stores
- Extracts patterns, merges duplicates, replaces stale entries
- Writes reorganized memory for future sessions
- Harvey (legal AI) reported **6x task completion lift** (vendor-reported)

**Why it matters for us:** Our current heuristic system (hot-memory files, NEXT-SESSION.md, STATUS.md) is a manual version of Dreaming. We could implement an automated "reflection loop" that:
1. After session ends, agent reviews transcript
2. Extracts key decisions, failed approaches, learned patterns
3. Updates per-workspace memo files

### 3.3 Cross-Session Memory Patterns

| Pattern | Token Usage | Latency | Accuracy | Best For |
|---|---|---|---|---|
| Full context (stuff everything) | ~26K | 17s | 72.9% | <500K history, simple |
| Mem0 (memory extraction) | ~1.8K | 1.4s | 66.9% | Large fleets, cost-sensitive |
| Mem0g (graph memory) | ~2.1K | 2.6s | 68.4% | Relational/temporal queries |
| Long-context (1M flat-priced) | Variable | Variable | ~73% | Single-user, <10 sessions |

### 3.4 Context Window Management (The Real Constraint)

**Key finding:** 65% of enterprise AI failures in 2025 attributed to context drift or memory loss, not capability.

**Three-layer strategy (proven at scale):**

1. **Observation masking (primary)** — Replace verbose tool outputs with placeholders after processing. Research shows this halves cost while matching LLM summarization solve rates. (arxiv:2508.21433)

2. **LLM compaction (fallback)** — When context hits ~83.5% capacity, summarize and drop old turns. Claude Code triggers at this threshold. Manual `/compact` at 60% produces better summaries.

3. **Content offloading** — Tool outputs >20K tokens written to file, replaced with reference in context. Agent re-reads if needed. Extends session 2-3x.

**Additional techniques:**
- Focus architecture: `start_focus` / `complete_focus` boundaries — only conclusions retained
- Embedding-based compression: 80-90% token reduction for historical turns
- Tiered memory: pin critical facts → compressed recent activity → checkpointed snapshots

### 3.5 Recommendations for Agent Workstation

Our existing system already implements key patterns:
- ✅ Hot-memory files (pinned critical facts)
- ✅ Per-workspace memos (cross-session state)
- ✅ File-based results (content offloading)
- ✅ Rules/skills loaded per-session (observation masking equivalent — only load relevant context)

**Gaps to address:**
- Automated post-session reflection (Dreaming equivalent)
- Structured observation masking in our tool output handling
- Checkpoint/resume on agent crash

---

## 4. Workflow Enforcement

### 4.1 Quality Gates — The State of the Art

**Stanford correctness-gated workflow (April 2026):**
- Cross-agent review + structural QA + formal verification (Lean)
- Independent judge agents evaluate at each gate
- Published as open-source `agents-config`

**Quality-Gated Granularity Control (arxiv:2605.00410):**
- Multi-agent pipelines with N agents issue N LLM calls per run
- Merging agents ("compound execution") saves tokens but **silently degrades quality** through tool loss and prompt compression
- **Key finding:** Keep agents separate, add quality gates between them rather than merging

**EviBound (arxiv:2511.05524):**
- Evidence-bound execution framework
- Eliminates false claims ("task complete" when it isn't) through dual governance gates
- Requires machine-checkable evidence at each gate

**MinimumCD Pipeline Enforcement:**
- Standard quality gates handle mechanical checks (lint, type, test)
- Expert validation agents handle judgment calls standard tools can't make
- Pipeline = enforcement mechanism for Agentic Continuous Delivery (ACD)

### 4.2 Pipeline FSM vs Event-Driven vs Graph

| Approach | Strengths | Weaknesses | Used By |
|---|---|---|---|
| **Pipeline FSM** (our approach) | Predictable, auditable, simple to reason about | Rigid, hard to add dynamic branches | Agent Workstation, MinimumCD |
| **Event-driven** | Flexible, decoupled, easy to extend | Hard to reason about ordering, debugging complex | AutoGen |
| **Graph-based** | Handles cycles, conditionals, parallelism natively | Complex to define, steeper learning curve | LangGraph, Cursor |

**Verdict:** FSM is the right choice for our use case. The industry confirms that explicit, auditable state transitions are preferred for enforced quality pipelines. Graph-based is better when workflows are dynamic/exploratory, but our pipeline is deliberately fixed (plan→test→sprint→review→done).

### 4.3 Test-Driven Agent Development

**TDFlow (arxiv:2510.23761):**
- Agentic workflow where tests are written FIRST, agent iterates until they pass
- 88.8% pass rate on SWE-Bench Lite (vs 61% next best baseline)
- 94.3% on SWE-Bench Verified
- **Key insight:** Tests as completion criteria is dramatically more effective than open-ended "fix this"

**Verification Chain pattern:**
1. Write failing test (human or test-agent)
2. Agent implements fix
3. Run test suite (automated gate)
4. If fail → loop back to step 2
5. If pass → proceed to review gate

**This validates our RED→GREEN→REVIEW pipeline design.** Test-driven is proven at scale to produce better agent output than unguided development.

### 4.4 Recommendations for Agent Workstation

Our pipeline FSM is validated by industry patterns:
- ✅ FSM enforcement is the pattern for production quality gates
- ✅ Test-first (RED gate) aligns with TDFlow's 88.8% success rate
- ✅ Independent judge agents (our QA agent) matches correctness-gated patterns
- ✅ deniedPaths for coders matches Cursor's "workers don't need to see everything"

**Enhancements to consider:**
- Machine-checkable evidence at each gate (not just agent claiming "done")
- Automatic retry with structured feedback on gate failure (up to N attempts)
- Quality score tracking across sprints for self-improvement

---

## 5. Agent Compatibility & Interop Standards

### 5.1 Tool Schema Standards

The industry has converged on **JSON Schema** as the universal tool definition format:

| Platform | Tool Schema Format | Validation |
|---|---|---|
| MCP | JSON Schema (mandatory) | Server-side validation |
| OpenAI Function Calling | JSON Schema (strict mode available) | Client-side |
| Anthropic Tool Use | JSON Schema | Client-side |
| Google Gemini | JSON Schema (subset) | Client-side |
| LangGraph | JSON Schema via tool strategy | Framework-level |

**Mastra.ai finding:** A tool compatibility layer reducing error rates from 15% to 3% across OpenAI/Anthropic/Google by normalizing schema edge cases (30 property types tested).

**Zod → JSON Schema:** Our zod-based approach is correct. `zod-to-json-schema` produces standard JSON Schema that all providers accept. This is the same pattern used by the Anthropic Agent SDK, Vercel AI SDK, and OpenRouter SDK.

### 5.2 Supporting Multiple LLM Providers

**Proven patterns:**
1. **OpenRouter** — Single API, 200+ models, automatic routing. Good for experimentation.
2. **LangChain ChatModel abstraction** — Swap providers by changing one constructor. 50+ integrations.
3. **Vercel AI SDK** — TypeScript-first, streams, tool calling normalization across providers.
4. **Direct API + adapter pattern** — Thin wrappers per provider, our messages format as the canonical.

**For TypeScript terminal-based systems:** Vercel AI SDK or direct adapter pattern. Vercel AI SDK provides `generateText()` / `streamText()` with tool calling that works identically across OpenAI, Anthropic, Google, and local models.

### 5.3 Agent Runtime Interface

**No universal standard yet.** But converging patterns:

```typescript
interface AgentRuntime {
  // Identity
  id: string;
  role: string;
  capabilities: string[];
  
  // Lifecycle
  start(task: TaskBrief): Promise<void>;
  stop(): Promise<void>;
  
  // Communication
  onMessage(handler: (msg: Message) => void): void;
  sendResult(result: TaskResult): void;
  
  // Tools
  tools: ToolDefinition[];  // JSON Schema based
  
  // State
  getState(): AgentState;  // FSM state
}
```

**Common across:** OpenAI Agents SDK, CrewAI agent definition, AutoGen ConversableAgent, Devin session API, Claude Code subagent YAML.

### 5.4 Recommendations for Agent Workstation

1. **Tool schemas:** Keep zod, emit JSON Schema for MCP compatibility. One definition → multiple consumers.
2. **LLM provider:** Adapter pattern with Anthropic as primary, OpenAI as fallback. Don't couple to one provider's API shape.
3. **Agent runtime:** Define a thin TypeScript interface. Each agent type implements it. The daemon manages lifecycle.
4. **Future interop:** Expose optional A2A Agent Card for each agent role. Low effort, enables external discovery.

---

## 6. Hype vs Proven at Scale

| Claim | Verdict | Evidence |
|---|---|---|
| MCP is the standard for agent tools | **Proven** | 110M downloads, all 3 major providers adopted, Linux Foundation governance |
| A2A will replace custom protocols | **Hype (for now)** | 150+ partners but few production deployments outside Google Cloud. Useful for cross-org, overkill for single-system. |
| LangGraph is production-ready | **Proven** | v1.0 shipped Oct 2025, LangGraph Cloud, extensive production use. But TypeScript support lags Python. |
| CrewAI scales to production | **Partially proven** | Fast prototyping, limited async. Not validated for high-throughput production systems. |
| Agent memory replaces RAG | **Emerging** | Dreaming and Memory Bank are real but new (May 2026). Mem0 is proven (14M downloads). Long-context may obsolete both for small use cases. |
| FSM pipelines are outdated | **False** | MinimumCD, Stanford correctness-gated workflows, and our own system all validate FSMs for enforced quality. Graph-based is for exploratory workflows. |
| Test-driven agent dev works | **Proven** | TDFlow: 88.8% on SWE-Bench Lite. Multiple independent validations. |
| 52-hour autonomous agents are reliable | **Experimental** | Cursor reported it; reliability engineering for multi-day agents is still immature. |
| Observation masking > LLM summarization | **Proven** | arxiv:2508.21433 — halves cost, matches solve rate |

---

## 7. Recommendations for Agent Workstation

### 7.1 Keep (Our Architecture is Validated)

| What We Have | Industry Validation |
|---|---|
| Daemon-mediated communication | Cursor, Devin, Claude Code all use coordinator processes |
| File-based result protocol | Equivalent to A2A task artifacts, simpler for local use |
| Pipeline FSM (plan→test→sprint→review) | Matches MinimumCD, Stanford correctness-gated, TDFlow patterns |
| Planner→Sprint-manager→Coder hierarchy | Cursor's planner-worker pipeline finding |
| deniedPaths for coders | Cursor's "workers don't see everything" finding |
| Process isolation via Zellij panes | Better crash isolation than in-process frameworks |
| Hot-memory + per-workspace memos | Equivalent to Anthropic Memory Tool pattern |
| Test-first (RED gate) | TDFlow proves 88.8% success vs 61% without |

### 7.2 Add (High-Value Gaps)

| Gap | Recommendation | Effort | Value |
|---|---|---|---|
| **Tool schema standard** | Adopt MCP-compatible JSON Schema. Zod definitions → `zod-to-json-schema` → MCP format. | S (hours) | High — ecosystem interop |
| **Observation masking** | After tool output consumed, replace with summary/placeholder in agent context. | M (days) | High — 2x session duration |
| **Post-session reflection** | Automated "Dreaming-lite": on session end, review transcript, update workspace memo. | M (days) | High — cross-session learning |
| **Machine-checkable gates** | Each pipeline gate requires verifiable evidence (test output, type-check result), not just agent claim. | S (hours) | High — eliminates false claims |
| **Agent crash resume** | Checkpoint agent state to file before expensive operations. Resume from checkpoint on crash. | L (week) | Medium — reliability |
| **A2A Agent Card** | Optional `/.well-known/agent.json` per agent role. Enables future external discovery. | S (hours) | Low (future) |

### 7.3 Don't Adopt (Validated Against)

| Technology | Why Not |
|---|---|
| LangGraph framework | Python-first, assumes in-process agents. Our TypeScript + process isolation is better for our model. Borrow FSM concepts, don't adopt the framework. |
| CrewAI | Python-only, limited async, sequential default. Our parallel-spawn model is superior. |
| Full A2A implementation | Overkill for single-system local agents. Only relevant if we expose agents to external callers. |
| Vector DB for agent memory | Our history is <500K tokens per workspace. Long-context + file-based memos is simpler and proven sufficient. |
| ACP | Archived, merged into A2A. Dead end. |

### 7.4 Architecture Alignment Summary

```
┌─────────────────────────────────────────────────────────┐
│                   Agent Workstation                       │
├─────────────────────────────────────────────────────────┤
│  Protocol Layer                                          │
│  ├─ Internal: File-based results + daemon HTTP notify    │
│  ├─ Tools: MCP-compatible JSON Schema (zod → schema)    │
│  └─ External (future): A2A Agent Card for discovery     │
├─────────────────────────────────────────────────────────┤
│  Orchestration Layer                                     │
│  ├─ Pipeline FSM: plan→test→sprint→QA→review→done       │
│  ├─ Planner-Worker pattern (no worker-worker comms)     │
│  └─ Spawn isolation: each agent = Zellij pane + context │
├─────────────────────────────────────────────────────────┤
│  Memory Layer                                            │
│  ├─ Session: Context window + observation masking        │
│  ├─ Cross-session: Hot-memory + workspace memos          │
│  ├─ Consolidation: Post-session reflection (Dreaming)   │
│  └─ Knowledge: Vault RAG for project knowledge          │
├─────────────────────────────────────────────────────────┤
│  Enforcement Layer                                       │
│  ├─ Quality gates: Machine-checkable evidence required   │
│  ├─ Role constraints: deniedPaths, tool restrictions    │
│  ├─ Pipeline policy: FSM blocks invalid transitions      │
│  └─ Verification: Test-first (RED gate mandatory)       │
├─────────────────────────────────────────────────────────┤
│  Provider Layer                                          │
│  ├─ Primary: Anthropic (Claude)                          │
│  ├─ Adapter pattern: Swap provider without rewrite      │
│  └─ Tool schema: Single zod def → all providers         │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Sources

1. Anthropic — Model Context Protocol announcement + docs (anthropic.com, docs.anthropic.com) — MCP architecture, primitives, adoption
2. Google Developer Blog — Agent2Agent Protocol announcement (April 2025) — A2A spec, partner ecosystem
3. a2aprotocol.ai — 2025 Complete Guide to A2A Protocol — Core concepts, Agent Cards, task lifecycle
4. DesignRevision — "AI Agent Frameworks: CrewAI vs AutoGen vs LangGraph Compared (2026)" — Framework comparison, code examples, performance
5. Digital Applied — "AI Agent Memory 2026: Vector, Graph, Episodic Update" (May 2026) — Dreaming, Memory Bank, vendor architectures, decision matrix
6. O-mega — "Long-Running Coding Agents: The 2026 Guide" (May 2026) — Context management, /goal, subagents, Claude Code, Codex, Cursor
7. arxiv:2508.21433 — "Simple Observation Masking Is as Efficient as LLM Summarization" — Context management research
8. arxiv:2605.00410 — "Quality-Gated Granularity Control for Multi-Agent LLM Pipelines" — Quality gates, pipeline design
9. arxiv:2510.23761 — "TDFlow: Agentic Workflows for Test Driven Software Engineering" — Test-driven agent results
10. cs.stanford.edu — "What I Learned Building a Correctness-Gated Multi-Agent Workflow" (April 2026) — Pipeline enforcement
11. minimumcd.org — "Pipeline Enforcement and Expert Agents" — Agentic CD quality gates
12. rywalker.com — "Agent Coordination Protocols Compared" (June 2026) — Protocol consolidation timeline (ACP→A2A merger)
13. fast.io — "Validating MCP Tool Inputs: Best Practices for 2026" — JSON Schema for MCP tools
14. mastra.ai — "Reducing tool calling error rates from 15% to 3%" — Cross-provider tool compatibility
15. Augment Code — "Swarm vs Supervisor: Multi-Agent Architecture Guide" — Handoff patterns, Agents SDK
16. startdebugging.net — "MCP vs OpenAPI Plugins vs Custom Tool Calling" (June 2026) — Tool schema convergence
17. Oracle Developers Blog — "From RAG to Memory Systems: Building Stateful AI Architecture" — Memory vs RAG distinction
18. arxiv:2606.11213 — "Structured Context Eviction for Long-Horizon Agents" — CWL eviction strategy
19. Salesforce Research — "TEX: Test-Time Scaling Testing Agents" — SWE-Bench state of art
20. futureagi.com — "Model Context Protocol (MCP) 2026 Guide" — MCP became de facto standard

---

## Appendix: Key Dates Timeline

| Date | Event |
|---|---|
| Nov 2024 | Anthropic releases MCP |
| April 2025 | Google announces A2A at Cloud Next '25 |
| August 2025 | IBM's ACP merges into A2A (Linux Foundation) |
| October 2025 | LangGraph v1.0 GA |
| November 2025 | MCP spec update: async, statelessness, server identity |
| December 2025 | MCP donated to Linux Foundation's Agentic AI Foundation |
| February 2026 | Cursor Background Agents research preview |
| March 2026 | A2A v1.0 stable; OpenAI Swarm deprecated → Agents SDK |
| April 2026 | Claude Opus 4.7 (1M context flat-priced); GPT-5.5 launch |
| May 2026 | Anthropic Dreaming (May 6); Google Memory Bank at I/O (May 19) |
| June 2026 | MCP Dev Summit: 110M monthly SDK downloads |
