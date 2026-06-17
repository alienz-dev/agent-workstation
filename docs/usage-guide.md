# How Agent Workstation Gets Used

## Distribution & Install

```bash
npm install -g agent-workstation
```

This gives you:
- `aw` CLI globally available
- Daemon auto-starts on first `aw` command
- All methodology/templates bundled inside the package

## Day 1: New Project

```bash
cd ~/projects/my-app
aw init
```

Creates:
```
.agents/constitution.yml     — pipeline config
.agents/workstation.db       — project state (gitignored)
.kiro/rules.md               — agent rules
.kiro/knowledge/workflow.md  — SDD reference
CONTEXT.md                   — glossary
STATUS.md                    — state tracking
NEXT-SESSION.md              — session resume
specs/README.md              — spec index
.lefthookrc.yml              — pre-commit hooks
```

## Day-to-Day: Developer Workflow

### Single task (most common)
```bash
aw spawn coder "fix the auth middleware race condition"
# → builds briefing, launches kiro in Zellij pane, collects result
```

### Full SDD feature
```bash
# 1. Write spec
aw spawn planner "write spec for user pagination"

# 2. Pipeline executes automatically (auto-mode)
#    planner → test-manager (RED) → sprint-manager (GREEN) → reviewer

# Or manually:
aw spawn test-manager "RED gate for pagination spec"
aw spawn sprint-manager "implement pagination"
aw spawn reviewer "review pagination implementation"
```

### Plan-based multi-task
```bash
aw plan load plans/phase-1.md
aw plan dispatch              # DAG scheduler, event-driven
aw plan status                # watch progress
```

### Knowledge & learning
```bash
aw heuristic list             # what has the system learned
aw knowledge search "auth"    # search issues, heuristics, history
aw issue open "bug title" --type bug --severity P1
```

### Monitoring
```bash
aw status                     # active agents, roles, pipeline stage
aw daemon health              # daemon process health
aw doctor                     # full environment check
```

---

## Integration Points

### 1. Command Line (primary interface)

The `aw` CLI is the main entry point. All operations go through it.

```bash
aw spawn        # spawn agents
aw plan         # manage plans
aw issue        # issue tracking
aw heuristic    # learning system
aw knowledge    # search
aw review       # code review
aw session      # session lifecycle
aw daemon       # daemon management
aw doctor       # health check
aw init         # project setup
aw send         # inter-agent messages
aw messages     # view message queue
```

### 2. MCP Integration (Model Context Protocol)

Agent Workstation exposes tools via MCP so that ANY MCP-compatible agent can use it:

```json
{
  "mcpServers": {
    "agent-workstation": {
      "command": "aw",
      "args": ["mcp-server"],
      "description": "Agent orchestration tools"
    }
  }
}
```

**MCP tools exposed:**

| Tool | What It Does |
|------|-------------|
| `aw_spawn` | Spawn an agent with task + constraints |
| `aw_plan_status` | Get current plan progress |
| `aw_issue_create` | Create an issue |
| `aw_heuristic_query` | Search heuristics for a task |
| `aw_knowledge_search` | Search all knowledge |
| `aw_status` | Get active agents + pipeline state |
| `aw_pipeline_advance` | Advance pipeline with evidence |
| `aw_claim_file` | Claim exclusive write access |
| `aw_release_file` | Release file claim |
| `aw_send_message` | Send message to another agent |

This means Claude Desktop, Cursor, Continue, or any MCP client can TRIGGER operations. Agents still execute in Zellij panes — MCP is a remote control, not a replacement. Zellij is required for agent execution.

### 3. HTTP API (daemon)

The daemon exposes a REST API for programmatic access:

```
POST /v1/spawn/request    — spawn agent
GET  /v1/agents           — list agents
POST /v1/messages/send    — send message
GET  /v1/pipeline/state   — pipeline state
POST /v1/pipeline/advance — advance with evidence
GET  /v1/health           — health check
```

Auth: Bearer token from port file (`/tmp/agent-workstation-<session>.port`)

### 4. Environment Variables

Agents receive context via env vars:

```bash
AW_BRIEFING_PATH    # path to briefing markdown
AW_RESULT_PATH      # where to write result
AW_SESSION_ID       # current session
AW_WORKDIR          # working directory
AW_AGENT_ROLE       # agent's role (coder, planner, etc.)
AW_SPAWN_ID         # unique spawn identifier
```

### 5. File Protocol (universal)

Any process can participate by:
1. Reading `$AW_BRIEFING_PATH` (markdown briefing)
2. Doing work
3. Writing `$AW_RESULT_PATH` (standard result format)

```markdown
## Status: PASS

## Summary
What was done.

## Changes Made
- `file.ts` — description

## Verification Evidence
$ npm run test
All tests passing.
```

### 6. Git Hooks

`.lefthookrc.yml` runs on every commit:
- Typecheck (incremental, fast)
- Affected tests only
- Lint staged files

### 7. CI/CD Integration

```bash
# In CI pipeline:
aw ci test              # JSON output, proper exit codes
aw ci typecheck         # type-check with memory limits
aw ci lint              # lint with zero-warning threshold
```

---

## Usage Scenarios

### Scenario A: Solo developer with kiro
```
Terminal → aw spawn coder "task" → kiro-cli runs in Zellij pane → result
```

### Scenario B: Team using different agents
```
Dev 1: aw spawn --adapter kiro coder "feature A"
Dev 2: aw spawn --adapter aider coder "feature B"
Both: share .agents/workstation.db (via git) → heuristics accumulate
```

### Scenario C: IDE integration (via MCP)
```
VS Code + Continue extension → MCP server → aw mcp-server
User: "fix the auth bug"
Continue → calls aw_spawn tool → daemon spawns agent in Zellij pane → result returned to IDE
```

### Scenario D: CI gate enforcement
```yaml
# GitHub Actions / Bitbucket Pipeline
steps:
  - run: npm install -g agent-workstation
  - run: aw ci test
  - run: aw ci typecheck
```

### Scenario E: Autonomous pipeline (no human)
```bash
aw spawn planner "implement feature X" --auto
# Planner writes spec → test-manager → sprint-manager → reviewer
# All automatic. Reports only at end or on failure.
```

---

## What Gets Stored Where

| Data | Location | Shared? |
|------|----------|---------|
| Project state (agents, plans, issues) | `.agents/workstation.db` | Git (optional) |
| Issues (markdown) | `.agents/issues/` | Git |
| Heuristics | `.agents/workstation.db` | Git (optional) |
| Daemon runtime state | `/tmp/agent-workstation-*.port` | No (per-machine) |
| Briefings/results | `/tmp/aw-*` | No (ephemeral) |
| Session history | `.agents/workstation.db` | Git (optional) |
| Events log | `.agents/workstation.db` | Git (optional) |

---

## Upgrade Path

```bash
npm update -g agent-workstation    # upgrade CLI + daemon + methodology
aw db migrate                       # apply new schema migrations
aw doctor                           # verify everything works
```

Methodology docs update automatically (bundled in package).
DB migrations are forward-compatible (new columns nullable, never drop).

---

## Why Zellij Is Required (Not Optional)

Zellij is the **execution substrate**, not a nice-to-have:

| What Zellij Provides | Why It Matters |
|---------------------|---------------|
| Process isolation | Each agent = separate pane. Crash doesn't kill others. |
| User visibility | Switch tabs to watch any agent work in real-time |
| User intervention | Type into an agent's pane to correct/guide it |
| TRIO observability | See test-manager, coder, reviewer running simultaneously |
| Notification injection | `[system] [DONE]` injected into parent pane |
| Lifecycle detection | Daemon detects pane close → triggers result collection |
| No stdin conflicts | Each pane has its own stdin/stdout (no multiplexing bugs) |

**The human stays in the loop** — you can:
- Watch a coder struggle and kill it early
- See a test-manager writing wrong tests and intervene
- Approve a reviewer's verdict by reading its tab
- Switch to any agent tab and type additional context

**MCP/HTTP are remote triggers only** — they say "start this", but the work ALWAYS happens in a Zellij pane where the user can observe it.

```
MCP call → aw daemon → Zellij pane (agent runs here, visible to user)
CLI call → aw daemon → Zellij pane (same)
```

Without Zellij: no panes, no isolation, no visibility, no TRIO.
