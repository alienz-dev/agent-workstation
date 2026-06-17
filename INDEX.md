# Agent Workstation — Document Index

## What This Is

One repo. One install. Orchestration platform for AI coding agents.
Hosts kiro/aider/claude-code in Zellij panes. NOT a coding agent itself.

**Start here:** `NEXT-SESSION.md` (how to build from scratch)

---

## Core Documents

| Document | What | Read When |
|----------|------|-----------|
| `NEXT-SESSION.md` | How to start building, tech stack, structure | Session start |
| `specs/platform.md` | 36 EARS acceptance criteria (the CONTRACT) | Before any implementation |
| `research/implementation-plan.md` | 77 tasks, 5 phases, wave breakdown | To know what to build |
| `DECISIONS.md` | 13 ADRs (architectural choices) | When questioning a design choice |

## Implementation References

| Document | What | Read When |
|----------|------|-----------|
| `research/feature-enrichment.md` | Types, DB schema, plugin system, parser, gates, review | When implementing any feature |
| `research/feature-research.md` | DAG (p-graph), heuristics (FTS5), search, adapters | When implementing these specific features |
| `research/lessons-from-existing-repos.md` | 10 bug classes + fixes baked into acceptance criteria | When writing daemon or orchestration code |

## Background Research (reference only)

| Document | What |
|----------|------|
| `research/discovery.md` | Inventory of existing components |
| `research/ecosystem-exploration.md` | 9 competing tools analyzed |
| `research/state-of-art-report.md` | Protocols, orchestration, memory (2026) |
| `research/runtime-architecture-research.md` | Agent loop patterns (informs hosted agents) |
| `research/orchestration-at-scale-research.md` | Failure recovery, scaling, quality gates |
| `research/two-repo-model.md` | Historical — superseded by single-repo |

## Structure

```
agent-workstation/
├── packages/           — executable code (Phase 1+)
│   ├── cli/            — aw binary
│   ├── core/           — types, state, orchestration
│   ├── daemon/         — session daemon (Python)
│   ├── plugins/        — issues, knowledge, devops, browser
│   └── adapters/       — kiro, aider, claude-code, generic
├── methodology/        — how to work (Phase 1, Wave 1.7)
│   ├── workflow/       — SDD, TRIO, pipeline
│   ├── roles/          — 12 agent role definitions
│   ├── templates/      — project scaffold
│   └── quality/        — gate specs
├── specs/              — platform specs (done)
├── research/           — design phase docs (done, reference only)
├── docs/               — user guides (Phase 5)
├── INDEX.md            — this file
├── NEXT-SESSION.md     — how to start
├── STATUS.md           — current state
├── DECISIONS.md        — architectural decisions
└── CONTEXT.md          — ubiquitous language
```

## Key Decisions Summary

- **Single repo** — infra + methodology together (ADR-012)
- **Not a coding agent** — hosts existing agents, no LLM loop (ADR-011)
- **Clean start** — no code from existing repos (ADR-013)
- **Per-project DB** — .agents/workstation.db (ADR-005)
- **npm global install** (ADR-004)
- **Daemon embedded** — Python, packages/daemon/ (ADR-010)

## Tech Stack

- TypeScript (Node 22, ESM) + Python 3.10+
- turborepo, drizzle-orm, better-sqlite3, citty, vitest, pytest
- p-graph (DAG), aiohttp (daemon), SQLite FTS5 (search)
