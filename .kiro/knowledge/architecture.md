# Architecture Context

## What This Project IS
An orchestration platform that hosts existing coding agents (kiro, aider, claude-code) in Zellij panes. Provides spawn coordination, pipeline enforcement, briefing preparation, result collection, and knowledge management.

## What This Project IS NOT
A coding agent. It does NOT have an LLM loop. It does NOT execute tools. It launches, coordinates, and manages quality around agents that already exist.

## Key Abstractions

### Daemon (packages/daemon — Python)
Long-running process managing Zellij pane lifecycle. Communicates via HTTP API.
- Spawns agent panes
- Enforces pipeline policy (role constraints, rate limits)
- Detects pane close → notifies parent
- Manages file claims, message queue, agent registry
- Persists state to SQLite (survives restart)

### Core (packages/core — TypeScript)
Shared types + business logic consumed by cli, plugins, adapters.
- Types: SpawnConfig, AgentResult, Briefing, Constitution, Plugin, AgentAdapter
- State: drizzle-orm SQLite (agents, plans, tasks, issues, heuristics, events)
- Orchestration: plan parser, DAG dispatch, error classification, briefing builder
- Client: HTTP client for daemon API

### Adapters (packages/adapters — TypeScript)
Each adapter knows how to launch a specific coding agent and collect its result.
- kiro: `kiro-cli chat --initial-prompt`
- aider: `aider --message-file --yes`
- claude-code: `claude --print --output-format json`
- generic: any command + AW_BRIEFING_PATH/AW_RESULT_PATH env vars

### Plugins (packages/plugins — TypeScript)
Optional capability modules that register CLI commands + DB migrations.
- issues: markdown + SQLite issue tracking
- knowledge: FTS5 unified search
- devops: git operations, CI mode
- browser: CDP automation

## Communication Pattern
```
aw CLI → daemon (HTTP) → Zellij pane (agent runs) → result file → daemon notification → aw CLI
```

## Key Design Patterns

1. **File-based protocol** — briefing in, result out (markdown files at /tmp/<id>-*)
2. **Exactly-once notifications** — dedup key, mark-delivered before inject
3. **Agent state machine** — INITIALIZING → READY → WORKING → EXITING
4. **Pipeline FSM** — plan → test → sprint → review → done (daemon-enforced)
5. **DAG dispatch** — p-graph library, event-driven (not polling)
6. **Error classification** — transient/permanent/budget/structural → different strategies
7. **Heuristic matching** — SQLite FTS5 BM25, top 3 injected into briefings

## Reference Documents
- Full spec: `specs/platform.md`
- Types/schema detail: `research/feature-enrichment.md`
- Implementation decisions: `research/feature-research.md`
- Bug patterns to avoid: `research/lessons-from-existing-repos.md`
