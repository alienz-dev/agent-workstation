# Decisions

## ADR-001: Foundation Dependencies

**Decision:** kiro-sessiond (daemon) and dev-kit (methodology) remain separate repos, consumed as dependencies. Workstation builds on top.

**Rationale:** sessiond is a running daemon (Python) — different lifecycle than a TS CLI. dev-kit is a template/documentation repo — consumed at scaffold time, not runtime.

**Consequence:** Workstation has a runtime dep on sessiond HTTP API and a dev-time dep on dev-kit templates.

## ADR-002: TypeScript Monorepo

**Decision:** Single repo, monorepo structure with packages/.

**Rationale:** Clean boundaries between concerns (cli, core, plugins) while sharing types, build, and test infrastructure. Avoids npm publish overhead during development.

## ADR-003: Agent-Agnostic Protocol

**Decision:** Define a standard agent protocol (briefing in, result out, status reporting) that any coding agent can implement.

**Rationale:** Current tooling is kiro-specific. Market has 10+ coding agents. Lock-in to one is a business risk. The protocol is simple enough that adapters are trivial.

## Pending

- [ ] Kong's role — runtime plugin vs absorbed into core
- [ ] krew-cli migration path — gradual feature absorption vs clean break
- [ ] Plugin architecture — dynamic import vs compile-time

## ADR-004: npm Global Install

**Decision:** Distribute as npm global package (`npm install -g agent-workstation`).

**Rationale:** Easier development iteration, familiar to Node ecosystem, TypeScript source runs via tsx during dev. Single binary can be a future optimization.

## ADR-005: Per-Project Database

**Decision:** SQLite database lives per-project at `.agents/workstation.db`.

**Rationale:** Project isolation — no cross-contamination. Heuristics that should be shared get explicitly promoted to workspace-level memo (hot-memory pattern). DB travels with the repo.

## ADR-006: Cherry-Pick Migration from krew-cli

**Decision:** Selective import of krew-cli data — user explicitly chooses which heuristics, plans, and issues to migrate.

**Rationale:** krew-cli DB has accumulated noise. Fresh start with curated import gives better signal. Migration tool: `aw migrate --from-krew <db-path> --select`.

## ADR-007: Three-Repo Model

**Decision:** Three repos cover the full stack: agent-workstation (TS runtime+CLI+state), kiro-sessiond (Python daemon), dev-kit (methodology+templates).

**Rationale:**
- agent-workstation = runtime code that executes. One language (TS), one build, one test suite.
- kiro-sessiond = long-running daemon, different lifecycle (systemd-managed Python process). Mixing into a TS repo adds complexity for zero benefit.
- dev-kit = methodology docs + templates. Not runtime code. Consumed at `aw init` time. Versionable separately (role definitions evolve independently of runtime).

**Consequence:** `aw` depends on sessiond HTTP API (runtime) and dev-kit templates (init-time). Both are semver'd. Breaking changes in sessiond API require coordinated release.

## ADR-008: Dev-Kit Becomes Pure Methodology

**Decision:** All executable code moves OUT of dev-kit. It becomes docs, templates, and role definitions only.

**Rationale:** Dev-kit tried to be both documentation AND tooling. The tooling (agent-launcher, issue-cli, create-dev-kit) now lives in agent-workstation. Dev-kit focuses on what it does uniquely: define HOW to work (SDD, TRIO, roles, gates).

## ADR-009: Sessiond Gains State Persistence

**Decision:** Sessiond persists orchestration state to SQLite, reconciles on restart.

**Rationale:** Research identified "daemon crash loses all state" as the #1 critical gap. Level-triggered reconciliation (compare desired vs actual) is the proven K8s pattern for recovery.

## ADR-010: Embed Sessiond Into Agent-Workstation (supersedes ADR-007)

**Decision:** kiro-sessiond (Python daemon) moves INTO agent-workstation as `packages/daemon`. Two-repo model: agent-workstation (infra) + dev-kit (toolset).

**Rationale:**
- Sessiond is tightly coupled to the runtime — spawn policy, pipeline FSM, and lifecycle all interact directly with orchestration logic
- Separate repo creates version coordination overhead for tightly-coupled changes
- Single install experience: `npm install -g agent-workstation` bootstraps everything including the daemon
- 6K lines of Python — small enough to be a monorepo package
- Eliminates HTTP-only constraint for internal communication (can use Unix socket or direct IPC)

**Two-Repo Model:**
- `agent-workstation` = INFRA. Everything that runs: daemon, runtime, CLI, orchestration, state, plugins, adapters.
- `dev-kit` = TOOLSET. Everything that teaches: SDD methodology, TRIO protocol, agent roles, templates, quality gate specs, workflow docs.

**Consequence:** Mixed-language monorepo (TS + Python). Turborepo handles both. `packages/daemon/` has its own pyproject.toml, pytest, and systemd unit.

## ADR-011: No Custom Agent Runtime — Host Existing Agents (supersedes Phase 2 runtime)

**Decision:** Agent Workstation does NOT build its own coding agent / LLM loop. It uses Zellij to host existing agents (kiro, aider, claude-code, codex, etc.) and provides orchestration, pipeline, and communication around them.

**Rationale:**
- Kong was an experiment in building a native agent. That's a massive maintenance surface for diminishing returns.
- kiro-cli already exists and works. aider exists. claude-code exists. Building another runtime is waste.
- The VALUE of agent-workstation is the ORCHESTRATION layer: spawn, coordinate, enforce quality, learn across sessions.
- Zellij is the host — each agent gets a pane. Workstation manages lifecycle AROUND the agents, not inside them.

**What this means:**
- `packages/runtime/` is REMOVED from the plan. No agent loop, no LLM streaming, no tool system.
- Observation masking, prompt cache, multi-provider — all IRRELEVANT (that's the agent's job, not ours).
- We keep: daemon, CLI, orchestration, state, plugins, adapters.
- Adapters become simpler: they just know how to LAUNCH an agent in a pane and COLLECT its result.

**What agent-workstation IS:**
- Spawn coordinator (launch agents in Zellij panes)
- Pipeline enforcer (FSM, gates, policies)
- Briefing builder (prepare context for agents)
- Result collector (parse result files, advance pipeline)
- Knowledge system (heuristics, issues, search)
- Communication layer (messages between panes)

**What agent-workstation IS NOT:**
- An LLM runtime
- A tool execution engine
- A coding agent

## ADR-012: Single Repo (supersedes ADR-007, ADR-010)

**Decision:** Everything in one repo. No dev-kit separate repo. No sessiond separate repo.

**Rationale:**
- dev-kit's only consumer is agent-workstation — not a shared library
- Role definitions are consumed at runtime (deniedPaths, spawn policy) — tightly coupled to orchestration
- Templates consumed by `aw init` — same binary
- Gate specs consumed by gate runner — same system
- Single install, single version, zero coordination overhead
- "Methodology docs" are just `docs/` in the repo

**Structure:**
- `packages/` — executable code (cli, core, daemon, plugins, adapters)
- `methodology/` — SDD, TRIO, roles, templates, quality gate specs
- `docs/` — user-facing guides
- `specs/` — EARS specifications for the platform itself

## ADR-013: Clean Start — No Code Migration (supersedes ADR-006)

**Decision:** Build from scratch. Do not copy/port code from krew-cli, kong, sessiond, or any existing repo. Use existing repos as REFERENCE only (design patterns, learned lessons) — not as source to migrate.

**Rationale:**
- Existing repos have accumulated technical debt, inconsistent patterns, and workarounds
- Copying code means inheriting bugs and design compromises made under different constraints
- Clean implementation against the spec produces better code than refactoring old code
- The KNOWLEDGE from those repos is captured in research/ docs and the spec — that's what matters
- Building fresh with TypeScript + Python from the spec gives a coherent codebase

**What this means:**
- No `cp` from ~/projects/kiro-sessiond, ~/projects/krew-cli, ~/projects/kong, etc.
- No migration tool needed (removed from plan)
- Existing repos remain available as reference for "how did we solve X before?"
- The spec (specs/platform.md) is the source of truth, not existing code
- Heuristic/issue data from old systems can be manually imported later if desired
