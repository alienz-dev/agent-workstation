# Agent Workstation — Context & Glossary

## What This Is

Orchestration platform for AI coding agents. Hosts kiro/aider/claude-code in Zellij panes. NOT a coding agent itself — no LLM loop, no tool execution.

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| Workstation | This platform — orchestration + methodology in one repo |
| Daemon | Python process (packages/daemon) managing Zellij pane lifecycle |
| Adapter | Module that knows how to launch a specific agent CLI |
| Briefing | Markdown file prepared for an agent (task + context + constraints) |
| Result | Markdown file an agent writes on completion (Status + Summary + Evidence) |
| Pipeline | FSM: plan → test → sprint → review → done |
| Gate | Verification checkpoint (exit code 0 from a command) |
| Constitution | Project config (.agents/constitution.yml) defining workflow + policies |
| Heuristic | Learned pattern from past sessions (trigger → action) |
| DAG Dispatch | Task scheduling based on dependency graph, not rigid waves |
| File Claim | Exclusive write access to a path (prevents parallel agent conflicts) |
| Information Barrier | Coders never see specs — tests ARE the spec |
| Blast Radius | How risky a change is (determines review tier) |

## Technical Constraints

- Node 22+ (ESM only)
- Python 3.10+ (daemon only)
- SQLite (better-sqlite3 + drizzle-orm) — per-project at .agents/workstation.db
- Turborepo monorepo
- vitest (threads only, never forks)
- citty for CLI
- p-graph for DAG execution
- aiohttp for daemon HTTP server
- SQLite FTS5 for search/matching
