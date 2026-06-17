# Discovery: Agent Workstation Consolidation

## Problem Statement

Multiple independently-built tools serve overlapping functions for AI coding agents. Each requires separate installation, has its own DB, its own CLI, and different integration patterns. This creates:
- Fragmented agent experience (different CLIs for different capabilities)
- Duplicated state (krew-cli DB, issue-tracker DB, sessiond registry)
- Integration friction (tools don't share context)
- Onboarding complexity (new agents need to know 5+ tools)
- Maintenance burden (updates across N repos)

## Inventory of Existing Capabilities

### Core Infrastructure (KEEP AS DEPENDENCIES)

| Capability | Source | What It Does |
|-----------|--------|-------------|
| Agent Lifecycle | kiro-sessiond | Spawn, register, heartbeat, health check, auto-close |
| Message Queue | kiro-sessiond | Scoped message delivery between agents |
| File Claims | kiro-sessiond | Exclusive write access to paths |
| Pipeline FSM | dev-kit/workflow/pipeline | plan→test→sprint→review→done enforcement |
| SDD Methodology | dev-kit/workflow/sdd | Spec writing, EARS notation, quality gates |
| TRIO Protocol | dev-kit/workflow/trio | Test-Red-Implement-Observe cycle |
| Agent Roles | dev-kit/agents/roles | 12 role definitions with constraints |
| Quality Gates | dev-kit/quality | Pre-commit, regression, review tiers |

### Orchestration Layer (CONSOLIDATE)

| Capability | Source | Overlap With |
|-----------|--------|-------------|
| Plan loading/dispatch | krew-cli | kong (plan system) |
| Agent spawning | krew-cli + kiro-ctl | kong (native spawn) |
| Wave management | krew-cli | dev-kit pipeline |
| Session management | krew-cli | sessiond |
| Agent status/monitoring | krew-cli | sessiond registry |
| Heuristic knowledge | krew-cli | standalone DB |
| Signal bus | krew-cli | sessiond messages |
| Context rot detection | krew-cli | could be agent-side |
| Hung agent remediation | krew-cli | sessiond health |

### Knowledge Layer (CONSOLIDATE)

| Capability | Source | Notes |
|-----------|--------|-------|
| Issue tracking | issue-tracker | Markdown + SQLite + Supabase |
| Heuristic DB | krew-cli | SQLite, per-session |
| Gotcha DB | krew-cli | SQLite, per-session |
| Knowledge graph | knowledge-graph | Vault semantic search |
| Knowledge hub | knowledge-hub | Multi-source graph (scaffolded) |
| Hot memory | ~/.kiro/state/ | Per-workspace curated context |
| Skills | dev-kit + ~/.kiro/skills | Attachable knowledge modules |

### Agent Capabilities (UNIFY INTERFACE)

| Capability | Source | Notes |
|-----------|--------|-------|
| Code generation | coder agent | Core — needs briefing + verification |
| Research | researcher agent | Web + vault + codebase |
| Browser automation | browser-cli | CDP-based, persistent session |
| Web research | web-agent | Fetch + extract + summarize |
| Data analysis | data-analyst | Sandboxed iterative analysis |
| UI visual checks | dev-kit/tools/ui-visual-check | VLM + DOM heuristics |
| Design system | dev-kit/tools/design-system | Autonomous feedback loop |

### DevOps Layer (INTEGRATE)

| Capability | Source | Notes |
|-----------|--------|-------|
| Git operations | krew-cli worktree | Worktree management |
| CI integration | krew-cli ci | Test running in CI mode |
| Self-hosted DevOps | forge | Gitea + Plane + BookStack |
| Release workflow | krew-cli release | Version bumping, changelog |

## Consolidation Strategy

### Tier 1: Unified CLI (agent-workstation binary)

One CLI that wraps all capabilities with consistent UX:
```
aw session start|stop|status
aw spawn <agent> "<task>"
aw plan load|dispatch|advance|status
aw issue open|list|show|resolve
aw heuristic add|query|list
aw knowledge search|ingest|graph
aw review request|approve|reject
aw skill list|attach
aw doctor
```

### Tier 2: Unified State Layer

Single database (SQLite + optional remote sync) containing:
- Agent registry (currently sessiond)
- Plan state (currently krew-cli)
- Issues (currently issue-tracker)
- Heuristics + gotchas (currently krew-cli)
- Session history
- File claims

### Tier 3: Plugin Architecture

Each capability as a plugin that registers:
- CLI commands it provides
- DB migrations it needs
- Agent roles it supports
- Gates it can enforce
- Events it emits/listens to

### Tier 4: Agent Compatibility Layer

Standard interface ANY coding agent must implement:
- Receive briefing (structured context)
- Report progress (status updates)
- Produce result (structured output)
- Declare capabilities (what tools/models available)

This makes workstation work with: kiro, aider, claude-code, copilot, cursor, windsurf, codex, etc.

## Unique Features to Preserve

1. **Pipeline FSM enforcement** — daemon-enforced, not advisory
2. **Information barrier** — coders never see spec, tests ARE the spec
3. **Heuristic learning** — agents get smarter across sessions
4. **Hot memory** — curated bounded context per workspace
5. **Multi-tier review** — auto-escalation based on blast radius
6. **Context rot detection** — knows when agent context is degraded
7. **Hung agent remediation** — automated recovery
8. **File claims** — prevents write conflicts between parallel agents
9. **Wave dispatch** — dependency-aware parallel execution
10. **SDD/TRIO methodology** — spec-first, test-first, always

## Key Design Decisions Needed

1. **Monorepo or single package?** — Leaning monorepo (packages/) for clean boundaries
2. **Replace krew-cli or wrap it?** — Replace. Too much overlap to maintain both.
3. **sessiond stays Python or rewrite TS?** — Keep Python daemon, TS CLI talks to it via HTTP
4. **Kong's role?** — Kong becomes the "native agent runtime" plugin. Workstation orchestrates, Kong executes.
5. **Database:** SQLite (drizzle-orm) for local, Supabase for team sync (same as issue-tracker pattern)
6. **Plugin loading:** Dynamic import of `@agent-workstation/<plugin>` packages
7. **Agent protocol:** JSON-over-HTTP (sessiond already does this) + file-based results (already works)

## Compatibility Requirements

Must work with ANY coding agent that can:
- Read a markdown briefing file
- Write a markdown result file
- Execute shell commands
- Report status via HTTP or file

This covers: kiro, aider, claude-code, codex, cursor (via CLI), cline, continue, etc.
