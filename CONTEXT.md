# Agent Workstation — Context & Glossary

## What This Is

A unified platform consolidating all agent-infrastructure tooling into a single coherent system. Built on top of `kiro-sessiond` (daemon) and `dev-kit` (methodology/workflows) as foundational dependencies.

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| Workstation | The consolidated platform — one install, all agent capabilities |
| Session | A bounded work context managed by sessiond (daemon process) |
| Agent | An AI entity with a role, model, tools, and constraints |
| Crew | A set of agents collaborating on a project within a session |
| Orchestrator | An agent that spawns/coordinates other agents (planner, sprint-manager) |
| Worker | An agent that executes tasks (coder, researcher, reviewer) |
| Pipeline | FSM-enforced workflow: plan → test → sprint → review → done |
| SDD | Spec-Driven Development — write spec + tests before code |
| TRIO | Test-Red-Implement-Observe — the execution cycle |
| Briefing | Context package given to a spawned agent (inline + read directives) |
| Gate | Verification checkpoint that must pass before pipeline advances |
| Heuristic | Learned agent behavior pattern stored for future sessions |
| Skill | Attachable knowledge module that extends agent capabilities |
| Hot Memory | Per-workspace curated context loaded into every agent session |

## Existing Components (Current State)

| Component | Repo | Status | Role |
|-----------|------|--------|------|
| kiro-sessiond | ~/projects/kiro-sessiond | Production | Daemon: agent registry, message queue, file claims, lifecycle |
| dev-kit | ~/projects/dev-kit | Production | Methodology: SDD, TRIO, pipeline, roles, templates, quality gates |
| krew-cli | ~/projects/krew-cli | Production | Orchestration CLI: plans, agents, heuristics, sessions, DB |
| kong | ~/projects/kong | v0.3.0 | Native coding agent platform — API-first, TUI-native |
| issue-tracker | ~/projects/dev-kit/tools/issue-cli | Production | Markdown-first issue management with SQLite + Supabase |
| knowledge-hub | ~/projects/knowledge-hub | Scaffolded | Knowledge graph engine for AI agents |
| browser-cli | ~/work-enhancement/browser-cli | v2.0.0 | Browser automation via CDP |
| web-agent | ~/projects/web-agent | Active | Web research agent |
| forge | ~/projects/forge | Ready | Self-hosted DevOps (Gitea+Plane+BookStack+Authentik) |
| knowledge-graph | ~/work-enhancement/knowledge-graph | Active | Vault semantic search + graph queries |

## Dependencies (Fixed)

- **kiro-sessiond** — daemon layer (Python, aiohttp). Agent lifecycle, message routing, file claims.
- **dev-kit** — workflow/methodology layer. SDD, TRIO, pipeline FSM, agent roles, quality gates.

Both are updatable but treated as foundation — workstation builds ON TOP, not replacing.
