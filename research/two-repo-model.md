# Two-Repo Model

## The Split

```
agent-workstation    — INFRA (everything that runs)
dev-kit              — TOOLSET (everything that teaches)
```

## agent-workstation (this repo)

**One repo, one install, everything that executes:**

```
agent-workstation/
├── packages/
│   ├── cli/              # aw binary (TypeScript, citty)
│   ├── core/             # Types, state, orchestration, plugins (TypeScript)
│   ├── runtime/          # Agent loop, providers, tools, context mgmt (TypeScript)
│   ├── daemon/           # Session daemon — lifecycle, Zellij, messaging (Python)
│   ├── plugins/          # Issue, knowledge, browser, devops, data-analyst (TypeScript)
│   └── adapters/         # Native, kiro, aider, claude-code, generic (TypeScript)
├── turbo.json
├── package.json          # npm workspaces root
└── pyproject.toml        # Python workspace (daemon only)
```

**Owns:**
- CLI binary (`aw`)
- Agent runtime (LLM loop, tool execution, streaming, context management)
- Session daemon (Zellij pane lifecycle, agent registry, message routing, health)
- Pipeline FSM (state machine, spawn policy enforcement, gate verification)
- Orchestration (plans, DAG dispatch, heuristics, error classification)
- State (unified SQLite: agents, plans, issues, heuristics, events)
- Plugins (issues, knowledge, browser, devops, data-analyst)
- Agent adapters (native, kiro, aider, claude-code, generic)
- Systemd unit for daemon auto-start

## dev-kit (separate repo)

**Methodology reference + project templates:**

```
dev-kit/
├── workflow/
│   ├── sdd/              # Spec-Driven Development methodology
│   ├── trio/             # Test-Red-Implement-Observe protocol
│   ├── pipeline/         # Pipeline state definitions, gate specs
│   ├── grill/            # Grill protocol for spec interrogation
│   └── retro/            # Retrospective extraction protocol
├── agents/
│   └── roles/            # 12 role definitions (constraints, deniedPaths, tools)
├── templates/
│   ├── constitution.yml  # Default project constitution
│   ├── CONTEXT.md        # Template
│   ├── STATUS.md         # Template
│   └── specs/            # Spec templates (EARS)
├── quality/
│   ├── gates/            # Gate definition docs (what each gate checks)
│   └── review/           # Review tier definitions
└── docs/                 # User-facing methodology guides
```

**Owns:**
- SDD methodology documentation
- TRIO protocol documentation
- Pipeline state definitions (what states exist, what transitions mean)
- Agent role definitions (capabilities, constraints, deniedPaths, model preferences)
- Project scaffolding templates
- Quality gate definition specs
- Workflow documentation

## Why This Split

| Criterion | agent-workstation | dev-kit |
|-----------|------------------|---------|
| Changes when | Runtime behavior changes | Process/methodology changes |
| Release cycle | Frequent (bug fixes, features) | Infrequent (methodology evolves slowly) |
| Language | TypeScript + Python | Markdown + YAML |
| Tested by | Unit tests, integration tests | Human review |
| Consumed by | Developers running agents | `aw init` (copies templates) + agents (reads role defs) |
| Install | `npm install -g agent-workstation` | Git clone or npm package of markdown |

## Interaction

```
aw init
  → reads dev-kit/templates/ → copies into project
  → reads dev-kit/agents/roles/ → validates constitution against roles

aw spawn coder "task"
  → reads dev-kit/agents/roles/coder.md → applies deniedPaths, tool restrictions
  → daemon (packages/daemon) manages Zellij pane
  → runtime (packages/runtime) runs agent loop
  → core (packages/core) handles orchestration + state

aw doctor
  → checks dev-kit exists and is accessible
  → checks daemon is running (or starts it)
  → validates constitution against dev-kit schema
```

## Benefits of Embedding Daemon

1. **Single install:** `npm install -g agent-workstation` gives you CLI + daemon + runtime
2. **Single version:** No cross-repo version coordination
3. **Tight coupling resolved:** Spawn policy, pipeline FSM, and orchestration can share types directly
4. **Simplified IPC:** Can use Unix socket instead of HTTP for local communication (faster, no port discovery)
5. **Unified testing:** Integration tests span daemon + runtime in one test suite
6. **Single systemd setup:** `aw daemon install` configures systemd from the same package

## Migration from Current State

| Current | Becomes |
|---------|---------|
| ~/projects/kiro-sessiond | → packages/daemon/ in agent-workstation |
| ~/projects/kong | → packages/runtime/ in agent-workstation |
| ~/projects/krew-cli | → packages/core/ + packages/cli/ in agent-workstation |
| ~/projects/dev-kit/tools/ | → packages/plugins/ in agent-workstation |
| ~/projects/dev-kit/workflow/ | Stays in dev-kit |
| ~/projects/dev-kit/agents/roles/ | Stays in dev-kit |
| ~/projects/dev-kit/templates/ | Stays in dev-kit |
| ~/work-enhancement/issue-tracker | → packages/plugins/issues/ in agent-workstation |
| ~/work-enhancement/knowledge-graph | → packages/plugins/knowledge/ in agent-workstation |
| ~/work-enhancement/browser-cli | → packages/plugins/browser/ in agent-workstation |
