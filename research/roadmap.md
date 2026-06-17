# Agent Workstation — Roadmap

## Summary

Build a **unified coding agent platform** that consolidates sessiond, dev-kit, krew-cli, kong, issue-tracker, and knowledge-graph into a single coherent system. The platform provides:

1. **A native coding agent runtime** (kong's agent loop: LLM ↔ tools ↔ environment)
2. **A communication layer** (sessiond's Zellij-based multi-agent coordination)
3. **A customizable workflow engine** (pipeline FSM, gates, SDD/TRIO)
4. **A knowledge/learning system** (heuristics, issues, knowledge graph)
5. **An agent-agnostic protocol** (so non-native agents like aider/claude-code also work)

## What Already Exists (Built)

| Layer | Component | Status | Key Features |
|-------|-----------|--------|-------------|
| **Daemon** | kiro-sessiond | Production | Agent registry, message queue, file claims, spawn policy, pipeline FSM, health monitoring, dead pane detection, rate limiting |
| **Agent Runtime** | kong | v0.3 | LLM streaming loop, tool system (zod schemas), session management, coordination (file locks, messages), hooks engine, TUI, Hono API server, budget/cost tracking, context compaction |
| **Orchestration CLI** | krew-cli | Production | 42+ commands, plan system (parse/dispatch/wave), heuristic DB, gotcha DB, signal bus, context rot detection, hung agent remediation, worktree management, auto-dispatch, skill system |
| **Methodology** | dev-kit | Production | SDD, TRIO, pipeline states, 12 agent roles, pre-commit gates, UI visual checks, data analyst, design system tools, project scaffolding |
| **Issues** | issue-tracker | Production | Markdown-first + SQLite + Supabase sync, lifecycle states |
| **Knowledge** | knowledge-graph | Active | Semantic search, full-text search, structural queries (paths, neighbors, common) |
| **Browser** | browser-cli | v2.0 | CDP persistent sessions, 652 methods, event subscription |
| **DevOps** | forge | Ready | Self-hosted Gitea+Plane+BookStack+Authentik, webhook bridge |

## What I Want to Build

A **single platform** where:
- `aw` CLI replaces `krew`, `kong`, `issue`, `kiro-ctl` as entry points
- One SQLite DB (drizzle-orm) replaces 3 separate databases
- Kong's agent loop IS the runtime (not wrapping kiro-cli)
- Sessiond stays as the daemon (Python, manages Zellij panes)
- Workflow is configurable per-project (constitution.yml)
- Any agent (kiro, aider, claude-code, codex) can participate via protocol
- Heuristics survive across sessions/projects (cross-project learning)
- Pipeline enforcement is daemon-level (not advisory)

## Communication Layer (Zellij-Based)

Current architecture (proven, keep):
```
Parent Agent (orchestrator pane)
  ↓ kiro-ctl spawn → HTTP POST /v1/spawn/request
  ↓ sessiond → kiro-sub.sh → zellij action new-tab
  ↓ Child agent starts in new Zellij pane
  ↓ Child writes result to /tmp/<id>-result.md
  ↓ sessiond detects completion → injects [system] notification into parent pane
  ↓ Parent reads result file, continues
```

Enhancement for workstation:
- Kong's native sessions replace kiro-cli sessions for native agents
- Protocol adapters handle external agents (aider: --message flag, claude-code: --print)
- EventBus (kong) + signal bus (krew) merge into unified pub/sub
- File locks (kong) + file claims (sessiond) merge — daemon is authority

## Workflow Engine

Configurable FSM per project:
```yaml
# .agents/constitution.yml
workflow:
  states: [plan, test, sprint, review, done, failed]
  transitions:
    - from: plan, to: test, gate: spec-quality
    - from: test, to: sprint, gate: red-gate
    - from: sprint, to: review, gate: green-gate
    - from: review, to: done, gate: reviewer-approval
  
  policies:
    orchestrator_cannot_spawn_coder: true
    information_barrier: true  # coders never see spec
    max_fix_cycles: 3
```

## Phases

### Phase 0: Research & Design (NOW)
- [x] Inventory all components
- [x] Map overlaps and consolidation targets
- [ ] Research: latest agent orchestration patterns (OpenAI Swarm, LangGraph, CrewAI, etc.)
- [ ] Research: terminal multiplexer agent comm patterns
- [ ] Enrichment: what's missing vs market leaders
- [ ] Architecture decision: kong absorption vs separate runtime
- [ ] Write formal EARS spec

### Phase 1: Core Foundation
- Package structure (monorepo, turborepo/nx)
- Agent protocol types (spawn, briefing, result, status)
- Session client (HTTP ↔ sessiond)
- Unified DB schema (drizzle-orm, single SQLite)
- Plugin interface definition

### Phase 2: Runtime Consolidation
- Kong's agent loop becomes `@agent-workstation/runtime`
- Tool registry (zod-validated, permissioned)
- Context management (compaction, budget, hot memory)
- Checkpoint/resume system

### Phase 3: Orchestration Consolidation
- Plan system (parse, dispatch, wave) from krew-cli
- Heuristic/gotcha learning system
- Signal/event bus (unified)
- Health monitoring + hung agent remediation

### Phase 4: Workflow & Quality
- Pipeline FSM (configurable per-project)
- Gate system (pluggable evaluators)
- SDD/TRIO enforcement
- Review tiers (auto-escalation)
- Pre-commit quality gates

### Phase 5: Knowledge & Integrations
- Issue lifecycle (from issue-tracker)
- Knowledge graph (semantic + full-text + structural)
- Browser automation plugin
- DevOps integration (forge, CI/CD)
- Remote sync (Supabase)

### Phase 6: Agent Adapters
- Native adapter (kong runtime)
- kiro-cli adapter (current, backward compat)
- aider adapter
- claude-code adapter
- Generic file-based adapter (works with anything)

## Success Criteria

1. `npm install -g agent-workstation` gives you everything
2. `aw init` scaffolds a project with full SDD infrastructure
3. `aw spawn coder "fix the bug"` works with ANY underlying agent
4. `aw plan load plan.md && aw plan dispatch` orchestrates multi-agent work
5. Heuristics from one project improve agents in another
6. Workflow gates prevent bypassing quality steps
7. One `aw doctor` checks entire environment health
8. Works on Linux (primary), macOS (secondary)
