/**
 * Core types for Agent Workstation.
 * See research/feature-enrichment.md §1 for full documentation.
 */

// Agent States
export type AgentState = 'initializing' | 'ready' | 'working' | 'exiting' | 'terminated' | 'failed'

// Pipeline
export type PipelineStage = 'plan' | 'test' | 'sprint' | 'review' | 'done' | 'failed'

// Result status
export type ResultStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'BLOCKED'

// Spawn configuration
export interface SpawnConfig {
  agent: string
  task: string
  adapter?: string
  workdir?: string
  model?: string
  skills?: string[]
  owned_files?: string[]
  timeout?: number
  parent_id?: string
  subscribe?: boolean
  headless?: boolean
  topic?: boolean
  context_file?: string
  env?: Record<string, string>
}

// Agent result (from result file)
export interface AgentResult {
  status: ResultStatus
  summary: string
  changes: Array<{ file: string; description: string }>
  verification: { command: string; output: string; exit_code: number }
  decisions: Record<string, string>
  issues?: string[]
}

// Briefing (written to /tmp/<id>-briefing.md)
export interface Briefing {
  task: string
  context: string
  read_directives?: Array<{ path: string; description: string }>
  constraints: {
    owned_files: string[]
    denied_paths: string[]
    allowed_tools?: string[]
    denied_commands?: string[]
    scope: string
    do_not: string[]
  }
  verification: { command: string; expected: string }
  heuristics?: Array<{ trigger: string; action: string }>
}

// Pipeline transition
export interface Transition {
  from: PipelineStage
  to: PipelineStage
  gate?: string
  signal: string
}

// Constitution (from .agents/constitution.yml)
export interface Constitution {
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
  gates: Record<string, { command: string; timeout: number }>
}

// Plugin interface
export interface Plugin {
  name: string
  version: string
  commands: PluginCommand[]
  migrations: string[]
  onInit?(ctx: PluginContext): Promise<void>
  onSessionStart?(ctx: PluginContext): Promise<void>
  onSessionEnd?(ctx: PluginContext): Promise<void>
  onAgentDone?(ctx: PluginContext, result: AgentResult): Promise<void>
}

export interface PluginCommand {
  name: string
  description: string
  run(args: string[]): Promise<void>
}

export interface PluginContext {
  projectRoot: string
  methodologyPath: string
}

// Adapter interface
export interface AgentAdapter {
  name: string
  buildCommand(config: SpawnConfig, briefingPath: string): string[]
  getEnv(config: SpawnConfig): Record<string, string>
  completionStrategy: 'process-exit' | 'file-watch' | 'both'
  parseResult(resultPath: string): AgentResult | null
}

// Events
export type EventType =
  | 'agent.spawned'
  | 'agent.done'
  | 'pipeline.advanced'
  | 'gate.passed'
  | 'gate.failed'
  | 'message.sent'
  | 'error.classified'

export interface WorkstationEvent {
  type: EventType
  payload: Record<string, unknown>
  agent_id?: string
  timestamp: number
}
