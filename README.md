# Agent Workstation

One repo. One install. Everything.

Orchestration platform for AI coding agents. Hosts kiro, aider, claude-code (or any agent) in Zellij panes. Provides spawn coordination, pipeline enforcement, knowledge management, multi-agent communication, and development methodology.

**Not a coding agent.** Launches, coordinates, and enforces quality around agents that already exist.

## Install

```bash
npm install -g agent-workstation
aw init        # scaffold project with SDD methodology
aw doctor      # verify environment
aw spawn coder "fix the auth bug"
```

## How It Works

```
aw spawn coder "fix the auth bug"
  → reads role definition (methodology/roles/coder.md)
  → builds briefing (task + context + heuristics + constraints)
  → daemon spawns kiro-cli in Zellij pane
  → kiro does the coding work
  → kiro writes result file
  → daemon detects completion → notifies parent
  → aw validates result → gate check → pipeline advance
```

## Capabilities

- **Spawn** — launch any agent in managed Zellij panes
- **Pipeline** — enforce plan→test→sprint→review→done (FSM)
- **Briefings** — prepare context + constraints + heuristics
- **Plans** — DAG-based multi-agent dispatch
- **Learn** — heuristics accumulate across sessions
- **Issues** — markdown-first tracking
- **Knowledge** — unified search
- **Communication** — message queue between panes
- **Recovery** — error classification, retry, circuit breaker, reconciliation
- **Methodology** — SDD, TRIO, 12 roles, quality gates (all included)

## Supported Agents

| Agent | How |
|-------|-----|
| kiro-cli | `kiro-cli chat` with briefing + agent JSON |
| aider | `aider --message` with task + files |
| claude-code | `claude --print --message` with context |
| Any | Generic adapter: command + env vars |

## Structure

```
packages/       — code (cli, core, daemon, plugins, adapters)
methodology/    — how to work (SDD, TRIO, roles, templates, gates)
docs/           — user guides
specs/          — platform specs
research/       — design phase docs
```

## Status

**Design phase complete.** 89 tasks planned across 5 phases. See `INDEX.md` for full document map.
