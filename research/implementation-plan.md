# Implementation Plan: Agent Workstation

## Overview

Build from scratch. Clean start. No code ported from existing repos.

An orchestration platform that hosts coding agents (kiro, aider, claude-code) in Zellij panes. Provides spawn coordination, pipeline enforcement, briefing preparation, result collection, knowledge management, and development methodology.

**Repo:** ~/project/agent-workstation
**Language:** TypeScript (Node 22, ESM) + Python (daemon)
**Build:** tsc + turborepo
**Test:** vitest (TS), pytest (Python)
**DB:** SQLite via drizzle-orm
**CLI:** citty

---

## Phase 1: Foundation

**Goal:** Monorepo, types, daemon, database, plugin system, methodology content.

### Wave 1.1 — Monorepo Bootstrap

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 1.1.1 | Init monorepo with turborepo | `turbo build` works, workspaces resolve |
| 1.1.2 | Package structure | packages/cli, core, daemon, plugins, adapters — each with package.json + tsconfig |
| 1.1.3 | Shared tooling | Root eslint, vitest config, tsconfig base. `turbo test` works. |
| 1.1.4 | Python workspace | packages/daemon with pyproject.toml, pytest, venv setup |

### Wave 1.2 — Core Types

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 1.2.1 | Spawn types | `SpawnConfig` (agent, task, adapter, workdir, model, skills, owned_files, timeout) |
| 1.2.2 | Result types | `AgentResult` (status, summary, changes, verification, decisions, issues) |
| 1.2.3 | Briefing types | `Briefing` (task, context, read_directives, constraints, owned_files, verification, heuristics) |
| 1.2.4 | Pipeline types | `PipelineStage`, `Transition`, `GateResult`, `Constitution` |
| 1.2.5 | Plugin types | `Plugin` (name, commands, migrations, hooks) |
| 1.2.6 | Adapter types | `AgentAdapter` (launch, collectResult, isAlive, terminate) |
| 1.2.7 | Event types | `Event` (agent.spawned, agent.done, pipeline.advanced, gate.passed, gate.failed, message.sent) |

### Wave 1.3 — Session Daemon

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 1.3.1 | HTTP server (aiohttp) | Starts on dynamic port, writes port file to /tmp/ |
| 1.3.2 | Auth | Bearer token generated at startup, stored in port file |
| 1.3.3 | Agent registry | Register, heartbeat, list, deregister. SQLite-backed. |
| 1.3.4 | Spawn endpoint | POST /v1/spawn — validate, policy check, launch Zellij pane |
| 1.3.5 | Zellij integration | Create pane/tab, detect close, inject text into pane |
| 1.3.6 | Message queue | Send, pending, deliver, acknowledge. Scoped to session. |
| 1.3.7 | File claims | Claim, release, list. Exclusive write access registry. |
| 1.3.8 | Pipeline state | Track current stage, validate transitions, advance with evidence |
| 1.3.9 | Spawn policy | Role constraints, rate limit (5/min), max children (3), pipeline stage check |
| 1.3.10 | Health monitoring | Heartbeat timeout detection (5min), dead pane detection |
| 1.3.11 | State persistence | All state in SQLite. Survives restart. |
| 1.3.12 | Reconciliation | On startup: compare DB vs running panes. Clean stale entries. |
| 1.3.13 | Notification | On child done: inject [system] [DONE] into parent pane |
| 1.3.14 | Systemd unit | Template for `systemctl --user enable agent-workstation@<session>` |

### Wave 1.4 — Daemon Client (packages/core)

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 1.4.1 | Connection discovery | Read port file, auto-launch daemon if missing |
| 1.4.2 | Spawn client | `spawn()`, `cancel()`, `status()` |
| 1.4.3 | Message client | `send()`, `pending()`, `acknowledge()` |
| 1.4.4 | Claim client | `claim()`, `release()`, `list()` |
| 1.4.5 | Pipeline client | `stage()`, `advance()` |

### Wave 1.5 — Database (packages/core)

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 1.5.1 | Drizzle setup | drizzle-orm + better-sqlite3, migration system |
| 1.5.2 | Agents table | id, role, status, spawn_id, parent_id, adapter, started_at, finished_at, result_path |
| 1.5.3 | Plans + tasks tables | plans (id, title, source, status), tasks (id, plan_id, title, deps[], status, role, agent_id) |
| 1.5.4 | Issues table | id, title, type, severity, status, project, body, created_at |
| 1.5.5 | Heuristics table | id, title, trigger, action, rationale, confidence, times_used, created_at |
| 1.5.6 | Sessions + events tables | sessions (id, started, ended), events (id, type, payload, timestamp) |
| 1.5.7 | DB factory | `createDatabase(projectRoot)` → .agents/workstation.db |

### Wave 1.6 — Plugin System (packages/core)

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 1.6.1 | Plugin registry | register, getCommands, getMigrations |
| 1.6.2 | Plugin loading | Scan packages/plugins/*, auto-register |
| 1.6.3 | Lifecycle hooks | onInit, onSessionStart, onSessionEnd, onAgentDone |

### Wave 1.7 — Methodology Content

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 1.7.1 | SDD workflow docs | methodology/workflow/sdd/ — EARS notation, spec template, quality gate |
| 1.7.2 | TRIO protocol docs | methodology/workflow/trio/ — test-red-implement-observe |
| 1.7.3 | Pipeline definition | methodology/workflow/pipeline/ — states, transitions, gate meanings |
| 1.7.4 | Role definitions (12) | methodology/roles/ — coder, planner, researcher, reviewer, test-manager, sprint-manager, debugger, ui-designer, data-analyst, reviewer-lite, explorer, architect |
| 1.7.5 | Project templates | methodology/templates/ — constitution.yml, CONTEXT.md, STATUS.md, NEXT-SESSION.md, specs/README.md |
| 1.7.6 | Quality gate specs | methodology/quality/ — test gate, typecheck gate, lint gate, review gate definitions |

---

## Phase 2: Orchestration

**Goal:** Plan execution, error handling, heuristic learning, briefing construction.

### Wave 2.1 — Plan System

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 2.1.1 | Plan parser | Markdown → tasks with titles, deps, roles. Validate: no cycles. |
| 2.1.2 | Plan storage | Load into DB. List loaded plans. |
| 2.1.3 | Plan status | Show task states, completion %, blocked tasks |

### Wave 2.2 — DAG Dispatch

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 2.2.1 | Dispatcher | Find tasks with deps satisfied → spawn. Event-driven. |
| 2.2.2 | Completion handler | On done: update, check downstream, auto-dispatch |
| 2.2.3 | Plan cancel | Terminate in-flight, mark remaining cancelled |

### Wave 2.3 — Error Handling

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 2.3.1 | Error classifier | Result context → transient/permanent/budget/structural |
| 2.3.2 | Retry logic | Transient: backoff (30s, 60s, 120s). Permanent: escalate. |
| 2.3.3 | Circuit breaker | 3 same-class failures → 30s cool-down |

### Wave 2.4 — Heuristics

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 2.4.1 | CRUD | add, list, query, archive |
| 2.4.2 | Matching | Fuzzy match task description → triggers. Top 3. |
| 2.4.3 | Auto-inject | Include in briefing |
| 2.4.4 | Post-session reflection | Analyze session → propose candidates |

### Wave 2.5 — Briefing Builder

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 2.5.1 | Generator | Task + context + constraints + heuristics → /tmp/<id>-briefing.md |
| 2.5.2 | Context assembly | Inline ≤5KB, read directives >5KB |
| 2.5.3 | Role constraints | Read methodology/roles/<role>.md → apply deniedPaths |
| 2.5.4 | Result validator | Parse result file, validate Status line |

---

## Phase 3: Pipeline & Quality

**Goal:** FSM enforcement, gates, review, information barrier.

### Wave 3.1 — Pipeline FSM

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 3.1.1 | Constitution parser | .agents/constitution.yml → typed config |
| 3.1.2 | FSM engine | Validate transitions, audit log |
| 3.1.3 | Spawn policy | Role + stage → allow/deny |

### Wave 3.2 — Gates

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 3.2.1 | Gate runner | Execute command, pass if exit 0 |
| 3.2.2 | Gate types | test, typecheck, lint, custom |
| 3.2.3 | Timing budget | 30s task, 2min wave. Timeout = warn + proceed. |

### Wave 3.3 — Review & Barrier

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 3.3.1 | Blast radius → tier | Files + sensitivity → 1/2/3 |
| 3.3.2 | Review dispatch | Tier-appropriate reviewer spawn |
| 3.3.3 | Information barrier | deniedPaths enforcement, spec isolation for coders |

---

## Phase 4: Plugins

**Goal:** Issues, knowledge, devops, browser.

### Wave 4.1 — Issues

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 4.1.1 | CRUD | open, show, edit, close, list |
| 4.1.2 | Lifecycle FSM | open → in-progress → review → done |
| 4.1.3 | Linking | Link to tasks, agents |

### Wave 4.2 — Knowledge

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 4.2.1 | Unified search | FTS5 across issues, heuristics, session history |
| 4.2.2 | Context retrieval | Assemble context package for briefings |

### Wave 4.3 — DevOps

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 4.3.1 | Git operations | Worktree, commit, branch |
| 4.3.2 | CI mode | `aw ci test` — JSON output |

### Wave 4.4 — Browser

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 4.4.1 | CDP wrapper | Connect to browser-harness, navigate, extract |

---

## Phase 5: CLI & Adapters

**Goal:** The `aw` binary and agent adapters.

### Wave 5.1 — CLI

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 5.1.1 | Scaffold (citty) | `aw` with subcommand routing, help, version |
| 5.1.2 | Core commands | init, doctor, status, spawn, db migrate |
| 5.1.3 | Plan commands | plan load/status/dispatch/cancel |
| 5.1.4 | Issue commands | issue open/show/list/close |
| 5.1.5 | Heuristic commands | heuristic add/list/query |
| 5.1.6 | Other commands | knowledge search, review request, send, messages, session, daemon |

### Wave 5.2 — Init & Doctor

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 5.2.1 | Init | Copy methodology/templates/ into project, create DB, start daemon |
| 5.2.2 | Doctor | Check Node, daemon, DB, Zellij, constitution |

### Wave 5.3 — Adapters

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 5.3.1 | kiro adapter | Launch kiro-cli chat with briefing + agent JSON |
| 5.3.2 | aider adapter | Launch aider --message with task + files |
| 5.3.3 | claude-code adapter | Launch claude --print --message |
| 5.3.4 | generic adapter | Configurable command + AW_BRIEFING_PATH/AW_RESULT_PATH env |

---

## Dependency Graph

```
Phase 1 (Foundation) → Phase 2 (Orchestration)
Phase 1 (Foundation) → Phase 3 (Pipeline)
Phase 1 (Foundation) → Phase 4 (Plugins)
Phase 2 + Phase 3 → Phase 5 (CLI + Adapters)
```

Phases 2, 3, 4 parallel after Phase 1. Phase 5 integrates all.

---

## Summary

| Phase | Tasks | Effort |
|-------|-------|--------|
| 1 — Foundation | 34 | 7-9 days |
| 2 — Orchestration | 14 | 4-5 days |
| 3 — Pipeline | 9 | 3-4 days |
| 4 — Plugins | 8 | 3-4 days |
| 5 — CLI & Adapters | 12 | 3-5 days |
| **Total** | **77 tasks** | **~20-27 days** |
## Appendix: Hardened Acceptance Criteria (from lessons-learned review)

These criteria augment the tasks above based on bugs encountered in sessiond (v0.15.0, 601 tests) and krew-cli (v2.0.0, 3909 tests):

### Wave 1.1 — Bootstrap
- **1.1.3 augment:** Test isolation: each test gets unique temp dir. No shared git state. git env vars (GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE) cleared in test setup.

### Wave 1.3 — Daemon
- **1.3.1 augment:** ALL daemon operations session-scoped (ZELLIJ_SESSION_NAME). Each service in tick loop wrapped in try/catch — individual failure logged, doesn't crash process.
- **1.3.3 augment:** Agent state machine: INITIALIZING → READY → WORKING → EXITING. State transitions validated. Message delivery gated to READY only.
- **1.3.4 augment:** Subscription created ONLY after pane launch confirmed (not before). On launch failure: no subscription exists.
- **1.3.5 augment:** Atomic inject with busy-state hold. Before inject: verify pane is in READY state. If WORKING: queue message, deliver on next READY transition. Never inject during active tool execution.
- **1.3.6 augment:** Before delivery: verify target pane is alive (Zellij pane list). On dead pane: move to DLQ. Mark undeliverable within one cycle.
- **1.3.9 augment:** Policy enforcement is HARD — returns HTTP 403, not logged warning. Spawn request rejected before any resource allocation.
- **1.3.10 augment:** Liveness based on heartbeat timeout (5min), NOT viewport/screen content analysis. No regex-based "is agent busy" heuristics.
- **1.3.12 augment:** On startup: list actual Zellij panes. Any DB entry without matching live pane → mark terminated. Sweep stale subscriptions (>60s without matching pane).
- **1.3.13 augment:** Exactly-once notification. Dedup key = spawn_id + "done". Mark-delivered BEFORE inject attempt. On inject failure: already marked, no re-attempt.

### Wave 2.3 — Error Handling
- **2.3.2 augment:** Sprint-manager retry budgets from role def: GREEN fail max 3, visual fail max 2, hidden fail → promote test + retry 1.

### Wave 2.5 — Briefing Builder
- **2.5.3 augment:** Role constraints include three dimensions: deniedPaths (file access), allowedTools (tool whitelist), deniedCommands (command blacklist). All enforced structurally, not advisory.

### Wave 3.1 — Pipeline FSM (NEW TASK)
- **3.1.4 (NEW):** Agent telemetry — log tool calls per agent to events table. Daemon evaluates behavior rules on tick (e.g., coder writing to specs/ → violation → warn/terminate).

### Wave 1.7 — Methodology
- **1.7.4 augment:** Role definitions must include:
  - All 12 roles with full deniedPaths + allowedTools + deniedCommands
  - Researcher includes ARIA v2 flow (parallel explorers + adversarial critic)
  - UI-designer includes autonomous scoring loop (audit→explore→critique→decide→specify→verify)
  - Sprint-manager includes per-gate retry budgets
  - Test-manager includes persistent flag + hidden test pattern
  - Coder includes explicit "never sees spec" constraint

### Deferred to v2
- Goal system (persistent goals surviving session restart)
- Dynamic re-planning mid-execution
- OS-level sandboxing (Landlock)

---

## Phase 5 Addition: MCP Server (Wave 5.4)

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 5.4.1 | MCP server command | `aw mcp-server` starts stdio MCP server exposing workstation tools |
| 5.4.2 | MCP tool: aw_spawn | Spawn agent via MCP tool call |
| 5.4.3 | MCP tool: aw_status | Return active agents + pipeline state |
| 5.4.4 | MCP tool: aw_knowledge_search | Search knowledge base |
| 5.4.5 | MCP tool: aw_issue_create | Create issue |
| 5.4.6 | MCP tool: aw_pipeline_advance | Advance pipeline with evidence |

This enables IDE-initiated operations (trigger spawns from Cursor/Continue/Claude Desktop). Agents STILL run in Zellij panes — MCP is a remote trigger, not a replacement for the execution environment.

---

## Phase 1 Addendum: Design Pipeline (Wave 1.7)

### Wave 1.7.4 augment — ui-designer role

The ui-designer role definition (methodology/roles/ui-designer.md) MUST include:
- Autonomous scoring loop: generate → screenshot → grade → iterate
- Reference input support (`--reference <html|png>`)
- Token fidelity enforcement against DESIGN.md
- Design memory persistence to `.interface-design/system.md`
- Pass/accept thresholds configurable via constitution.yml

### Wave 1.7 NEW TASK — Design Gate

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 1.7.8 | Design gate spec | methodology/quality/design-gate.md — defines visual QA gate with reference_alignment scoring, pass thresholds, retry behavior, constitution config |

---

## Phase 2 Addendum: Design Briefing (Wave 2.5)

### Wave 2.5 augment — Briefing Builder design awareness

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 2.5.5 | Design context injection | WHEN task type = UI AND project has DESIGN.md, briefing builder includes `## Design Contract` section with: DESIGN.md token subset, reference path (if exists), .interface-design/system.md decisions |
| 2.5.6 | Reference resolution | Resolve reference from: spawn config > .agents/design/references/<task>.html > default.html > none. Include resolved path in briefing. |

---

## Phase 3 Addendum: Design Gate (Wave 3.2)

### Wave 3.2 augment — Gate types

| Task | Objective | Acceptance Criteria |
|------|-----------|-------------------|
| 3.2.4 | Design gate type | Gate runner supports `type: design`. Invokes design-grade.sh with --design-md and --reference. Parses JSON output. Evaluates thresholds from constitution. |
| 3.2.5 | Reference directory | `aw init` creates `.agents/design/references/` directory. Sprint-manager checks this directory for auto-matched references when running visual QA. |

---

## Updated Summary

| Phase | Tasks | Effort |
|-------|-------|--------|
| 1 — Foundation | 34 + 1 = 35 | 7-9 days |
| 2 — Orchestration | 14 + 2 = 16 | 4-5 days |
| 3 — Pipeline | 9 + 2 = 11 | 3-4 days |
| 4 — Plugins | 8 | 3-4 days |
| 5 — CLI & Adapters | 12 | 3-5 days |
| **Total** | **82 tasks** | **~21-28 days** |
