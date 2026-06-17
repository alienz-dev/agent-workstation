# Architecture: Agent Workstation

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Workstation CLI                      │
│  (aw spawn, aw plan, aw issue, aw knowledge, aw review)     │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────────┐
│                      Core Package                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Session  │ │ Pipeline │ │  State   │ │    Agent      │  │
│  │ Client   │ │   FSM    │ │  Store   │ │   Protocol    │  │
│  └────┬─────┘ └──────────┘ └────┬─────┘ └───────────────┘  │
│       │                          │                           │
└───────┼──────────────────────────┼───────────────────────────┘
        │                          │
        ▼                          ▼
┌───────────────┐          ┌──────────────┐
│ kiro-sessiond │          │   SQLite DB  │
│   (daemon)    │          │  (drizzle)   │
│ HTTP API :port│          │              │
└───────────────┘          └──────────────┘

┌─────────────────────────────────────────────────────────────┐
│                        Plugins                                │
│  ┌─────────┐ ┌───────────┐ ┌────────┐ ┌─────────────────┐  │
│  │ Issues  │ │ Knowledge │ │ Review │ │    Heuristics   │  │
│  └─────────┘ └───────────┘ └────────┘ └─────────────────┘  │
│  ┌─────────┐ ┌───────────┐ ┌────────┐ ┌─────────────────┐  │
│  │ Browser │ │  DevOps   │ │  Plan  │ │   Data Analyst  │  │
│  └─────────┘ └───────────┘ └────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Agent Adapters                             │
│  ┌──────┐ ┌───────┐ ┌────────────┐ ┌───────┐ ┌──────────┐ │
│  │ kiro │ │ aider │ │ claude-code│ │ codex │ │  cursor  │ │
│  └──────┘ └───────┘ └────────────┘ └───────┘ └──────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Package Structure

```
agent-workstation/
├── packages/
│   ├── cli/                    # CLI binary (citty or oclif)
│   │   └── src/commands/       # aw spawn, aw plan, aw issue, etc.
│   │
│   ├── core/                   # Core library
│   │   ├── session-client/     # HTTP client for sessiond
│   │   ├── pipeline/           # FSM: plan→test→sprint→review→done
│   │   ├── state/              # SQLite via drizzle-orm
│   │   ├── protocol/           # Agent protocol types + validation
│   │   └── plugin-loader/      # Dynamic plugin registration
│   │
│   ├── plugins/                # Optional capability modules
│   │   ├── issues/             # Issue lifecycle (from issue-tracker)
│   │   ├── knowledge/          # Search, graph, ingest (from knowledge-graph)
│   │   ├── heuristics/         # Learning DB (from krew-cli)
│   │   ├── review/             # Multi-tier review (from dev-kit)
│   │   ├── plan/               # Plan parse, dispatch, wave (from krew-cli)
│   │   ├── browser/            # CDP automation (from browser-cli)
│   │   ├── devops/             # Git, CI, release (from krew-cli + forge)
│   │   └── data-analyst/       # Sandboxed analysis (from dev-kit)
│   │
│   └── adapters/               # Agent runtime adapters
│       ├── kiro/               # kiro-cli specific (default)
│       ├── aider/              # aider adapter
│       ├── claude-code/        # claude-code adapter
│       └── generic/            # File-based (works with anything)
│
├── specs/                      # SDD specifications
├── research/                   # Discovery & design docs
├── docs/                       # User-facing documentation
└── .agents/                    # Agent configuration for this project
```

## Agent Protocol (Core Abstraction)

```typescript
interface AgentProtocol {
  // Spawn an agent with a task
  spawn(config: SpawnConfig): Promise<AgentHandle>;
  
  // Agent reports its status
  reportStatus(status: AgentStatus): void;
  
  // Agent reads its briefing
  getBriefing(): Briefing;
  
  // Agent writes its result
  submitResult(result: AgentResult): void;
  
  // Agent declares what it can do
  capabilities(): AgentCapabilities;
}

interface SpawnConfig {
  agent: string;           // role name
  task: string;            // what to do
  briefing?: string;       // path to context file
  workdir?: string;        // working directory
  model?: string;          // LLM model override
  skills?: string[];       // attached knowledge
  owned_files?: string[];  // exclusive write access
  timeout?: number;        // max execution time
}

interface AgentResult {
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'BLOCKED';
  summary: string;
  changes: FileChange[];
  verification: { command: string; output: string };
  decisions: Record<string, string>;
  issues?: string[];
}
```

## State Model (Unified DB)

Single SQLite database replacing krew-cli's 23 migrations + issue-tracker's DB:

| Table | Source | Purpose |
|-------|--------|---------|
| agents | sessiond registry | Active agent instances |
| messages | sessiond queue | Inter-agent messaging |
| file_claims | sessiond claims | Exclusive write access |
| plans | krew-cli plans | Loaded plans + wave state |
| tasks | krew-cli tasks | Individual plan tasks |
| issues | issue-tracker | Issue lifecycle |
| heuristics | krew-cli heuristics | Learned patterns |
| gotchas | krew-cli gotchas | Failure lessons |
| events | krew-cli events | Append-only event log |
| sessions | krew-cli sessions | Session history |
| skills | dev-kit skills | Available skill registry |

## Migration Path

### Phase 1: Scaffold + Core Types
- Package structure, tsconfig, build
- Agent protocol types
- Session client (HTTP to sessiond)
- Plugin interface definition

### Phase 2: State Consolidation
- Unified DB schema (drizzle-orm)
- Migrate issue-tracker logic
- Migrate heuristic/gotcha logic
- Migrate plan system logic

### Phase 3: CLI Unification
- `aw` binary with all commands
- Each plugin registers its commands
- Backward-compat aliases (issue → aw issue, krew plan → aw plan)

### Phase 4: Agent Adapters
- kiro adapter (default, existing behavior)
- Generic file-based adapter
- aider adapter (--message flag)
- claude-code adapter

### Phase 5: Knowledge Consolidation
- Merge knowledge-graph into knowledge plugin
- Unified search (semantic + full-text + structural)
- Cross-reference issues ↔ code ↔ specs
