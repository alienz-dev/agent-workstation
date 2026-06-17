# Architecture & Data Flow

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DEVELOPER                                     │
│                    (observes, intervenes, approves)                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │ types commands, switches tabs
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ZELLIJ SESSION                                 │
│                                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Planner  │  │  Test    │  │  Coder   │  │ Reviewer │  ...panes  │
│  │  (tab)   │  │ Manager  │  │  (tab)   │  │  (tab)   │           │
│  └────┬─────┘  └──────────┘  └──────────┘  └──────────┘           │
│       │                                                              │
└───────┼──────────────────────────────────────────────────────────────┘
        │ aw spawn / aw plan dispatch
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     AW CLI (packages/cli)                             │
│                                                                       │
│  Commands: spawn, plan, issue, heuristic, knowledge, review, send    │
│  Builds briefings, validates results, queries DB, advances pipeline  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP / Unix socket
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DAEMON (packages/daemon)                           │
│                                                                       │
│  Agent Registry │ Spawn Policy │ Pipeline FSM │ Message Queue        │
│  File Claims    │ Health Mon   │ Notifications │ State Persistence   │
│                                                                       │
│  SQLite: /tmp/aw-daemon-<session>.db                                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │ zellij action new-tab / inject
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ZELLIJ (pane operations)                           │
│                                                                       │
│  new-tab → agent runs │ detect close → notify │ inject text → msg   │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Spawn a Coder

```
1. Developer (or planner agent):
   $ aw spawn coder "fix auth race condition"

2. AW CLI (packages/cli + packages/core):
   a. Read methodology/roles/coder.md → get denied_paths, constraints
   b. Query heuristics DB → top 3 matching "auth race condition"
   c. Build briefing → write /tmp/aw-<id>-briefing.md
   d. POST daemon /v1/spawn/request {agent:"coder", task:..., briefing_path:...}

3. DAEMON (packages/daemon):
   a. Check pipeline policy: is "coder" allowed in current stage? (sprint only)
   b. Check rate limit: <5 spawns/min from this parent? ✓
   c. Check max children: <3 concurrent from this parent? ✓
   d. Register agent in DB (status: initializing)
   e. Execute: zellij action new-tab --name "🔧 coder" --cwd /project
   f. Inside tab: launch adapter command (kiro-cli chat --initial-prompt ...)

4. AGENT (in Zellij pane):
   a. Reads briefing (test paths, context, constraints)
   b. Does work (makes tests pass)
   c. Writes /tmp/aw-<id>-result.md
   d. Exits (pane closes)

5. DAEMON detects pane close:
   a. Read result file
   b. Update agent registry (status: terminated, result_status: PASS)
   c. Inject into parent pane: [system] [DONE] Child: Result /tmp/aw-<id>-result.md

6. PARENT AGENT (receives notification):
   a. Reads result file
   b. Validates (Status line present? Verification evidence?)
   c. If PASS: check if downstream tasks unblocked → dispatch
   d. If FAIL: classify error → retry or escalate
```

## Data Flow: Pipeline Advance

```
1. Sprint-manager: all coders done, GREEN gate needed
   $ aw pipeline advance --evidence "turbo test exit 0"

2. AW CLI:
   a. Run gate command: turbo test
   b. Capture exit code + output
   c. POST daemon /v1/pipeline/advance {from:"sprint", to:"review", evidence:{...}}

3. DAEMON:
   a. Validate transition: sprint → review allowed? ✓
   b. Validate evidence: exit code 0? ✓
   c. Update pipeline state in DB
   d. Emit event: pipeline.advanced {from:"sprint", to:"review"}
   e. Return success

4. AW CLI:
   a. Log gate evidence to events table
   b. Report: "Pipeline advanced: sprint → review"
```

## Data Flow: Heuristic Learning

```
1. Session ends (agent exits or user closes)

2. AW CLI runs post-session reflection:
   a. Query events table for this session
   b. Find: failures, retries, decisions
   c. Generate candidate heuristics

3. Present to user:
   "Found 2 patterns:
    [1] Trigger: 'vitest watch mode' → Action: 'always use --run flag'
    [2] Trigger: 'auth middleware' → Action: 'check session expiry first'
    Approve? [y/n/select]"

4. On approval:
   a. INSERT into heuristics table
   b. Available for future sessions (FTS5 indexed)

5. Next spawn:
   a. aw spawn coder "fix auth session issue"
   b. FTS5 match: "auth" → heuristic #2 matches
   c. Included in briefing under "## Relevant Lessons"
```

## Data Flow: DAG Plan Dispatch

```
1. Developer:
   $ aw plan load plans/phase-1.md

2. AW CLI:
   a. Parse markdown → tasks with deps
   b. Build DAG (detect cycles)
   c. Store plan + tasks in DB

3. Developer:
   $ aw plan dispatch

4. AW CLI:
   a. Query tasks WHERE deps all satisfied AND status=pending
   b. For each ready task: aw spawn <role> "<task>"
   c. Register dispatch in DB

5. On task completion (notification received):
   a. Mark task done in DB
   b. Query: which tasks have ALL deps now done?
   c. Auto-dispatch newly unblocked tasks
   d. Repeat until plan complete or failure

6. On wave boundary (if configured):
   a. Run wave gate (e.g., typecheck)
   b. Only advance to next wave if gate passes
```

## Data Flow: Inter-Agent Communication

```
1. Sprint-manager needs to tell coder about a specific approach:
   $ aw send coder "Use the existing AuthService, don't create new one"

2. AW CLI:
   a. POST daemon /v1/messages/send {to_role:"coder", content:...}

3. DAEMON:
   a. Store message in queue (status: pending)
   b. Find agent with role "coder" in state READY
   c. Inject message into coder's pane:
      [system] Message from sprint-manager: "Use the existing AuthService..."

4. CODER reads message in their terminal:
   a. Adjusts approach accordingly
   b. Continues working
```

## State Locations

```
┌────────────────────────────────────────────────┐
│ .agents/workstation.db (per-project, persists) │
│                                                 │
│  agents    — spawn history, results            │
│  plans     — loaded plans                      │
│  tasks     — task state + deps                 │
│  issues    — issue tracking                    │
│  heuristics — learned patterns                 │
│  sessions  — session history                   │
│  events    — append-only audit log             │
│  messages  — message queue (daemon syncs)      │
│  file_claims — who owns what file              │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ /tmp/aw-daemon-<session>.port (ephemeral)      │
│                                                 │
│  {"port": 8234, "token": "abc...", "pid": 1234}│
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ /tmp/aw-<spawn-id>-briefing.md (ephemeral)     │
│ /tmp/aw-<spawn-id>-result.md (ephemeral)       │
│                                                 │
│  Created per spawn, cleaned on session end      │
└────────────────────────────────────────────────┘
```

## Package Dependencies

```
packages/cli
  └── depends on → packages/core

packages/core
  └── standalone (types, DB, orchestration logic)

packages/plugins
  └── depends on → packages/core

packages/adapters
  └── depends on → packages/core

packages/daemon
  └── independent (Python, communicates via HTTP only)
```

## External Dependencies

```
                    ┌───────────────┐
                    │   Zellij      │ ← pane lifecycle
                    └───────────────┘
                    ┌───────────────┐
                    │   kiro-cli    │ ← hosted agent (default)
                    │   aider       │ ← hosted agent (alternative)
                    │   claude-code │ ← hosted agent (alternative)
                    └───────────────┘
                    ┌───────────────┐
                    │   Node 22     │ ← TS runtime
                    │   Python 3.10 │ ← daemon runtime
                    │   SQLite      │ ← state storage
                    └───────────────┘
```
