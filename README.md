# Agent Workstation

**Orchestration platform for AI coding agents.**

One repo. One install. Everything. Hosts kiro, aider, claude-code (or any agent) in Zellij panes. Provides spawn coordination, pipeline enforcement, knowledge management, multi-agent communication, and development methodology.

**Not a coding agent.** Launches, coordinates, and enforces quality around agents that already exist.

## Install

```bash
npm install -g agent-workstation
aw init        # scaffold project with SDD methodology
aw doctor      # verify environment
aw spawn coder "fix the auth bug"
```

## Quick Start

```bash
# Initialize a new project
aw init

# Start the daemon
aw daemon start

# Spawn an agent
aw spawn coder "Implement user authentication"

# Check status
aw status

# Create and track issues
aw issue open -t "Fix login bug" -T bug -p high

# Search knowledge base
aw knowledge search "authentication"
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

## Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **Spawn** | Launch any agent in managed Zellij panes |
| **Pipeline** | Enforce plan→test→sprint→review→done (FSM) |
| **Briefings** | Prepare context + constraints + heuristics |
| **Plans** | DAG-based multi-agent dispatch with p-graph |
| **Learn** | Heuristics accumulate across sessions |
| **Issues** | Full lifecycle tracking with FSM |
| **Knowledge** | BM25 unified search across all data |
| **Communication** | Message queue between agents |
| **Recovery** | Error classification, retry, circuit breaker |
| **Methodology** | SDD, TRIO, 12 roles, quality gates |

### CLI Commands

```
Core:        init, doctor, status, spawn, db
Plan:        plan load/status/dispatch/cancel
Issue:       issue open/show/list/close/edit
Heuristic:   heuristic add/list/query/propose
Knowledge:   knowledge search/context
Review:      review request/dispatch
Messaging:   send, messages
Session:     session list/create
Daemon:      daemon start/stop/status
```

### Daemon API

```
GET  /v1/health              Health check
POST /v1/spawn               Spawn agent
GET  /v1/agents              List agents
POST /v1/claim               Claim file
GET  /v1/pipeline            Get pipeline stage
POST /v1/pipeline/advance    Advance stage
POST /v1/message             Send message
GET  /v1/messages            Get messages
```

### Supported Agents

| Agent | Command | Strategy |
|-------|---------|----------|
| kiro-cli | `kiro-cli chat --message-file` | file-watch |
| aider | `aider --message-file` | process-exit |
| claude-code | `claude --print --message-file` | process-exit |
| Generic | Configurable command + env | both |

## Project Structure

```
packages/
├── core/           # Types, state, orchestration
├── cli/            # Command-line interface
├── adapters/       # Agent adapters
├── daemon/         # Python session daemon
└── plugins/        # Plugin extensions

methodology/        # How to work
├── roles/          # 12 role definitions
├── workflow/       # SDD, pipeline docs
└── quality/        # Quality gates

.agents/            # Project config (created by aw init)
├── constitution.yml # Workflow configuration
├── roles/          # Custom roles
├── plans/          # Plan files
└── workstation.db  # SQLite database
```

## Configuration

Create `.awrc` in your project root:

```json
{
  "session": "default",
  "daemon": {
    "port": 0,
    "autoStart": true
  },
  "database": {
    "path": ".agents/workstation.db"
  },
  "workflow": {
    "maxConcurrency": 3,
    "timeout": 300000
  }
}
```

## Methodology

Agent Workstation includes a complete development methodology:

### 12 Roles
planner, coder, reviewer, architect, tester, integrator, curator, analyst, designer, devops, security, pm

### Workflow
- **SDD** (Spec-Driven Development)
- **Pipeline** (plan → test → sprint → review → done)
- **Quality Gates** (test, lint, typecheck, review)

## Test Coverage

```
Unit Tests:          192 tests ✅
Adapter Tests:        20 tests ✅
Integration Tests:    18 tests ✅
E2E Workflow Tests:   23 tests ✅
Config Tests:         10 tests ✅
Spawn Tests:           6 tests ✅
Python Daemon Tests:  14 tests ✅
──────────────────────────────────
Total:               283 tests ✅
```

## Architecture

```
┌─────────────────────────────────────────────┐
│                 CLI (aw)                     │
├─────────────────────────────────────────────┤
│              Daemon Client                   │
├─────────────────────────────────────────────┤
│           Session Daemon (Python)            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Agents  │ │ Pipeline│ │ Knowledge│       │
│  └─────────┘ └─────────┘ └─────────┘       │
├─────────────────────────────────────────────┤
│              SQLite Database                 │
└─────────────────────────────────────────────┘
         │                    │
    ┌────▼────┐          ┌────▼────┐
    │  Zellij │          │ Adapters│
    │  Panes  │          │(kiro,   │
    │         │          │aider...)│
    └─────────┘          └─────────┘
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

## Status

**v0.1.0 - Production Ready**

All 5 phases complete:
- ✅ Phase 1: Foundation (7 waves)
- ✅ Phase 2: Orchestration (5 waves)
- ✅ Phase 3: Pipeline & Quality (3 waves)
- ✅ Phase 4: Plugins (4 waves)
- ✅ Phase 5: CLI & Adapters (3 waves)

## License

MIT
