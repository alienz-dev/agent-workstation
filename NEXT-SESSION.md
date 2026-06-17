# Next Session

## What This Is
Agent Workstation — orchestration platform for coding agents (kiro, aider, claude-code). Hosts agents in Zellij panes. Provides spawn coordination, pipeline enforcement, knowledge management. NOT a coding agent itself.

## Resume Point
Design phase COMPLETE. 77 tasks planned. All features researched and enriched. Ready to build Phase 1.

## Key Constraint
**Clean start.** No code copied from existing repos (kiro-sessiond, krew-cli, kong, dev-kit). Build from scratch against the spec. Old repos are reference only.

## Documents to Read (in order)

1. `INDEX.md` — master document index
2. `specs/platform.md` — 36 EARS acceptance criteria (the CONTRACT)
3. `research/implementation-plan.md` — 77 tasks, 5 phases, wave breakdown
4. `research/feature-enrichment.md` — types, schema, plugin system, parser, gates, review
5. `research/feature-research.md` — DAG dispatch (p-graph), heuristic matching (FTS5), adapters
6. `research/lessons-from-existing-repos.md` — 10 bug classes to avoid (hardened into plan)
7. `DECISIONS.md` — 13 ADRs

## How to Execute Phase 1

Phase 1 has 7 waves. Execute in order:

```
Wave 1.1 — Monorepo bootstrap (turborepo, packages/, shared config)
Wave 1.2 — Core types (SpawnConfig, AgentResult, Briefing, Pipeline, Plugin, Adapter, Events)
Wave 1.3 — Session daemon (Python, aiohttp, SQLite, Zellij integration)
Wave 1.4 — Daemon client (TypeScript HTTP client for daemon API)
Wave 1.5 — Database (drizzle-orm, schema from feature-enrichment.md §2)
Wave 1.6 — Plugin system (registry, dynamic loading, lifecycle hooks)
Wave 1.7 — Methodology content (SDD, TRIO, 12 roles, templates, gates)
```

### To start:
```bash
cd ~/project/agent-workstation

# Wave 1.1: Bootstrap monorepo
# - Init turborepo: turbo.json, root package.json with workspaces
# - Create: packages/cli, packages/core, packages/daemon, packages/plugins, packages/adapters
# - Each package: package.json + tsconfig.json
# - Root: eslint, vitest, tsconfig.base.json
# - packages/daemon: pyproject.toml, pytest, src/ structure
# - Verify: `turbo build` and `turbo test` work
```

### Key implementation references:
- **Types:** See `research/feature-enrichment.md` §1 for exact TypeScript interfaces
- **DB schema:** See `research/feature-enrichment.md` §2 for complete SQL DDL
- **Daemon:** Build from scratch as Python aiohttp server. Reference `~/projects/kiro-sessiond` for patterns only. Key: session-scoped, service isolation per tick, heartbeat-based liveness, exactly-once notifications.
- **DAG dispatch:** Use `p-graph` library (Microsoft). See `research/feature-research.md` §1.
- **Heuristic matching:** SQLite FTS5 BM25. See `research/feature-research.md` §2.
- **Knowledge search:** Unified FTS virtual table. See `research/feature-research.md` §3.
- **Adapters:** File-based contract. See `research/feature-research.md` §4.
- **Bug avoidance:** See `research/lessons-from-existing-repos.md` for 10 critical patterns.

## Tech Stack
- TypeScript (Node 22, ESM) — cli, core, plugins, adapters
- Python (3.10+) — daemon only
- turborepo — monorepo orchestration
- drizzle-orm + better-sqlite3 — database
- citty — CLI framework
- vitest — TS tests
- pytest — Python tests
- p-graph — DAG execution
- aiohttp — daemon HTTP server

## Structure

```
agent-workstation/
├── packages/
│   ├── cli/          — aw binary (citty)
│   ├── core/         — types, state, orchestration, briefings
│   ├── daemon/       — session daemon (Python, aiohttp, systemd)
│   ├── plugins/      — issues, knowledge, devops, browser
│   └── adapters/     — kiro, aider, claude-code, generic
├── methodology/
│   ├── workflow/     — SDD, TRIO, pipeline docs
│   ├── roles/        — 12 agent role definitions
│   ├── templates/    — project scaffold templates
│   └── quality/      — gate specs
├── docs/
├── specs/
└── research/         — design phase docs (reference only during build)
```
