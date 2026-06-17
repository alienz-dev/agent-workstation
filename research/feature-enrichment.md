# Feature Enrichment

Detailed design for features that were underspecified in the implementation plan.

---

## 1. Core Types — Schema Detail

### SpawnConfig
```typescript
interface SpawnConfig {
  agent: string            // role name (coder, planner, researcher, etc.)
  task: string             // human-readable task description
  adapter?: string         // kiro | aider | claude-code | generic (default: kiro)
  workdir?: string         // working directory for the agent
  model?: string           // LLM model override
  skills?: string[]        // methodology skills to attach
  owned_files?: string[]   // exclusive write access paths (file claims)
  timeout?: number         // max seconds before kill (default: 1800)
  parent_id?: string       // spawn ID of parent agent
  subscribe?: boolean      // notify parent on completion
  headless?: boolean       // invisible pane
  topic?: boolean          // persistent tab (no auto-close)
  context_file?: string    // path to additional context
  env?: Record<string, string>  // extra env vars for the agent
}
```

### AgentResult
```typescript
interface AgentResult {
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'BLOCKED'
  summary: string
  changes: Array<{ file: string; description: string }>
  verification: { command: string; output: string; exit_code: number }
  decisions: Record<string, string>
  issues?: string[]
}
```

### Briefing
```typescript
interface Briefing {
  task: string                          // 1-3 sentences
  context: string                       // inlined content (≤5KB)
  read_directives?: Array<{             // for content >5KB
    path: string
    description: string                 // WHY to read this, what to look for
  }>
  constraints: {
    owned_files: string[]               // exclusive write access
    denied_paths: string[]              // cannot read/write
    allowed_tools?: string[]            // tool whitelist (if set, only these)
    denied_commands?: string[]          // blocked shell commands
    scope: string                       // what's in/out
    do_not: string[]                    // anti-patterns
  }
  verification: {
    command: string                     // exact command to run
    expected: string                    // pattern or exit code
  }
  heuristics?: Array<{                  // ≤3 relevant lessons
    trigger: string
    action: string
  }>
}
```

### AgentState (for daemon registry)
```typescript
type AgentState = 'initializing' | 'ready' | 'working' | 'exiting' | 'terminated' | 'failed'
```

### PipelineStage
```typescript
type PipelineStage = 'plan' | 'test' | 'sprint' | 'review' | 'done' | 'failed'

interface Transition {
  from: PipelineStage
  to: PipelineStage
  gate?: string          // gate name to evaluate
  signal: string         // signal that triggers (plan_ready, tests_ready, etc.)
}

interface Constitution {
  workflow: {
    states: PipelineStage[]
    transitions: Transition[]
  }
  policies: {
    information_barrier: boolean
    max_fix_cycles: number
    max_children_per_parent: number
    rate_limit_per_minute: number
  }
  gates: Record<string, {
    command: string
    timeout: number       // seconds
  }>
}
```

---

## 2. Database Schema — Relationships & Indexes

```sql
-- Agents: currently running or recently completed
CREATE TABLE agents (
  id TEXT PRIMARY KEY,            -- spawn_id (kiro-sub-<timestamp>)
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'initializing',  -- AgentState
  adapter TEXT NOT NULL DEFAULT 'kiro',
  task TEXT NOT NULL,
  parent_id TEXT,                 -- references agents.id
  spawn_config JSON,             -- full SpawnConfig as JSON
  result_path TEXT,
  result_status TEXT,            -- PASS/FAIL/PARTIAL/BLOCKED (from result file)
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  last_heartbeat INTEGER,
  pane_id TEXT,                  -- Zellij pane identifier
  session_name TEXT NOT NULL     -- Zellij session scope
);
CREATE INDEX idx_agents_parent ON agents(parent_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_session ON agents(session_name);

-- Plans
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_file TEXT,             -- original markdown path
  status TEXT NOT NULL DEFAULT 'loaded',  -- loaded/active/completed/cancelled
  created_at INTEGER NOT NULL
);

-- Tasks (within plans)
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  title TEXT NOT NULL,
  description TEXT,
  role TEXT NOT NULL,            -- which agent role executes this
  deps TEXT DEFAULT '[]',       -- JSON array of task IDs
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/dispatched/running/done/failed/cancelled
  wave INTEGER,                 -- optional wave grouping
  agent_id TEXT,                -- assigned agent spawn_id
  result_status TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX idx_tasks_plan ON tasks(plan_id);
CREATE INDEX idx_tasks_status ON tasks(status);

-- Issues
CREATE TABLE issues (
  id TEXT PRIMARY KEY,           -- project#N format
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bug',   -- bug/feature/task/research
  severity TEXT DEFAULT 'P2',         -- P0/P1/P2/P3
  status TEXT NOT NULL DEFAULT 'open', -- open/in-progress/review/done/wontfix
  project TEXT,
  body TEXT,
  file_path TEXT,               -- markdown file location
  linked_task_id TEXT,
  linked_agent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_project ON issues(project);

-- Heuristics
CREATE TABLE heuristics (
  id TEXT PRIMARY KEY,           -- h-YYYY-MM-DD-NNN
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'failure',  -- failure/success
  trigger_condition TEXT NOT NULL,
  action TEXT NOT NULL,
  rationale TEXT NOT NULL,
  scope TEXT DEFAULT 'briefing',
  confidence TEXT DEFAULT 'medium',  -- high/medium/low
  times_retrieved INTEGER DEFAULT 0,
  times_relevant INTEGER DEFAULT 0,  -- user feedback
  source_context TEXT,               -- where this came from
  created_at INTEGER NOT NULL,
  archived INTEGER DEFAULT 0
);
CREATE INDEX idx_heuristics_archived ON heuristics(archived);

-- Sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  summary TEXT,
  agents_spawned INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0
);

-- Events (append-only log)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,            -- agent.spawned, agent.done, pipeline.advanced, gate.passed, etc.
  payload JSON,
  agent_id TEXT,
  timestamp INTEGER NOT NULL
);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_timestamp ON events(timestamp);

-- File claims
CREATE TABLE file_claims (
  path TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL
);

-- Messages (queue)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  from_agent TEXT,
  to_role TEXT,                 -- deliver to first agent with this role
  to_agent TEXT,                -- or specific agent
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending/delivered/acknowledged/dlq
  created_at INTEGER NOT NULL,
  delivered_at INTEGER
);
CREATE INDEX idx_messages_status ON messages(status);
```

---

## 3. Plugin System — Lifecycle & Error Handling

```typescript
interface Plugin {
  name: string
  version: string
  
  // Commands this plugin adds to aw CLI
  commands: PluginCommand[]
  
  // DB migrations this plugin needs
  migrations: Migration[]
  
  // Event subscriptions
  events?: {
    'agent.done'?: (event: AgentDoneEvent) => Promise<void>
    'pipeline.advanced'?: (event: PipelineEvent) => Promise<void>
    'session.end'?: (event: SessionEndEvent) => Promise<void>
  }
  
  // Lifecycle
  onInit?(ctx: PluginContext): Promise<void>       // called once on aw startup
  onSessionStart?(ctx: PluginContext): Promise<void>
  onSessionEnd?(ctx: PluginContext): Promise<void>
}

interface PluginContext {
  db: Database              // drizzle instance
  daemon: DaemonClient      // daemon HTTP client
  projectRoot: string
  methodologyPath: string   // path to methodology/ dir
}

// Error handling: plugins are isolated
// If a plugin throws during event handling: log error, continue other plugins
// If a plugin throws during onInit: mark as degraded, report in aw doctor
```

---

## 4. Plan Parser — Grammar

Plan markdown format (what `aw plan load` accepts):

```markdown
# Plan: <title>

## Wave 1: <wave-name>

### Task: <task-title>
- **Role:** coder
- **Deps:** [task-id-1, task-id-2]  (optional)
- **Description:** What this task does

### Task: <task-title>
- **Role:** researcher
- **Description:** What this task does

## Wave 2: <wave-name>

### Task: <task-title>
- **Role:** coder
- **Deps:** [wave-1-task-1]
- **Description:** ...
```

Parser rules:
- `# Plan:` → plan title
- `## Wave N:` → wave assignment (optional, for gate boundaries)
- `### Task:` → task
- `**Role:**` → agent role (required)
- `**Deps:**` → JSON array of task IDs (generated as slugified title if not explicit)
- `**Description:**` → task description (rest of section if not explicit field)
- Tasks without deps in Wave 1 are immediately dispatchable
- Tasks with deps: dispatch only when ALL deps have status=done

---

## 5. Error Classification Logic

```typescript
function classifyError(result: AgentResult, context: ErrorContext): ErrorClass {
  // Budget exceeded
  if (context.cost_exceeded || result.issues?.includes('budget')) 
    return 'budget'
  
  // Structural (needs re-plan)
  if (result.status === 'BLOCKED' && result.issues?.some(i => 
    i.includes('impossible') || i.includes('conflicting') || i.includes('missing dependency')
  )) return 'structural'
  
  // Permanent (unrecoverable by retry)
  if (result.issues?.some(i => 
    i.includes('permission denied') || i.includes('not found') || i.includes('invalid spec')
  )) return 'permanent'
  
  // Transient (likely to succeed on retry)
  if (
    result.status === 'FAIL' && 
    context.attempt < context.max_retries &&
    !context.same_error_repeated  // different error each time = making progress
  ) return 'transient'
  
  // Default to permanent after max retries
  return 'permanent'
}
```

---

## 6. Gate System — Detail

```typescript
interface GateConfig {
  name: string
  command: string           // shell command to execute
  timeout: number           // seconds (default 30)
  working_dir?: string      // relative to project root
  required_for: string      // which transition this gates
}

// Gate execution:
// 1. Run command with timeout
// 2. Capture stdout + stderr + exit code
// 3. PASS if exit 0, FAIL otherwise
// 4. Store evidence in events table
// 5. On timeout: log warning, treat as PASS (don't block forever)

// Standard gates (from methodology/quality/):
const STANDARD_GATES = {
  'spec-quality': 'node scripts/validate-spec.js',
  'red-gate': 'npm run test -- --reporter=json 2>&1 | node scripts/red-gate-check.js',
  'green-gate': 'npm run test',
  'typecheck': 'npm run typecheck',
  'lint': 'npm run lint -- --max-warnings 0',
}

// Parallel gate execution: gates within same transition CAN run in parallel
// Gate ordering: if gate B depends on gate A (e.g., typecheck before test), define as sequence
```

---

## 7. Review System — Blast Radius Rules

```typescript
function calculateBlastRadius(changes: FileChange[]): ReviewTier {
  const paths = changes.map(c => c.file)
  
  // Tier 3 (full review, different model): any of these
  if (paths.some(p => 
    p.includes('auth') || p.includes('security') || 
    p.includes('permission') || p.includes('middleware') ||
    p.includes('migration') || p.includes('schema') ||
    p.endsWith('.env') || p.includes('secret')
  )) return 3
  
  // Tier 3: touching >10 files
  if (paths.length > 10) return 3
  
  // Tier 2 (reviewer-lite): API routes, config, >5 files
  if (paths.some(p => 
    p.includes('route') || p.includes('api') || 
    p.includes('config') || p.includes('package.json')
  )) return 2
  if (paths.length > 5) return 2
  
  // Tier 1 (inline check): everything else
  return 1
}
```

---
