/**
 * Pipeline FSM (Finite State Machine) for workflow enforcement.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Constitution, PipelineStage, Transition } from './types.js'

export interface FSMState {
  currentStage: PipelineStage
  history: Array<{ from: PipelineStage; to: PipelineStage; timestamp: number; evidence?: string }>
}

export interface FSMResult {
  allowed: boolean
  reason?: string
  newStage?: PipelineStage
}

/**
 * Parse constitution.yml file.
 */
export function parseConstitution(content: string): Constitution {
  // Simple YAML parser for constitution format
  const lines = content.split('\n')
  const result: Constitution = {
    workflow: {
      states: ['plan', 'test', 'sprint', 'review', 'done', 'failed'],
      transitions: []
    },
    policies: {
      information_barrier: true,
      max_fix_cycles: 3,
      max_children_per_parent: 3,
      rate_limit_per_minute: 5
    },
    gates: {}
  }
  
  let inWorkflow = false
  let inPolicies = false
  let inGates = false
  let currentGate: string | null = null
  
  for (const line of lines) {
    const trimmed = line.trim()
    
    if (trimmed === 'workflow:') {
      inWorkflow = true
      inPolicies = false
      inGates = false
      continue
    }
    if (trimmed === 'policies:') {
      inWorkflow = false
      inPolicies = true
      inGates = false
      continue
    }
    if (trimmed === 'gates:') {
      inWorkflow = false
      inPolicies = false
      inGates = true
      continue
    }
    
    if (inPolicies) {
      const match = trimmed.match(/^(\w+):\s*(.+)$/)
      if (match) {
        const [, key, value] = match
        if (key === 'information_barrier') {
          result.policies.information_barrier = value === 'true'
        } else if (key === 'max_fix_cycles') {
          result.policies.max_fix_cycles = parseInt(value, 10)
        } else if (key === 'max_children_per_parent') {
          result.policies.max_children_per_parent = parseInt(value, 10)
        } else if (key === 'rate_limit_per_minute') {
          result.policies.rate_limit_per_minute = parseInt(value, 10)
        }
      }
    }
    
    if (inGates) {
      const gateMatch = trimmed.match(/^(\w+):$/)
      if (gateMatch && !trimmed.startsWith('-')) {
        currentGate = gateMatch[1]
        result.gates[currentGate] = { command: '', timeout: 60 }
        continue
      }
      if (currentGate) {
        const cmdMatch = trimmed.match(/^command:\s*["']?(.+?)["']?$/)
        if (cmdMatch) {
          result.gates[currentGate].command = cmdMatch[1]
        }
        const timeoutMatch = trimmed.match(/^timeout:\s*(\d+)/)
        if (timeoutMatch) {
          result.gates[currentGate].timeout = parseInt(timeoutMatch[1], 10)
        }
      }
    }
  }
  
  // Build default transitions
  result.workflow.transitions = buildDefaultTransitions()
  
  return result
}

/**
 * Build default workflow transitions.
 */
export function buildDefaultTransitions(): Transition[] {
  return [
    { from: 'plan', to: 'test', signal: 'plan_ready', gate: 'spec_has_criteria' },
    { from: 'test', to: 'sprint', signal: 'tests_ready', gate: 'tests_exist' },
    { from: 'sprint', to: 'review', signal: 'sprint_done', gate: 'tests_pass' },
    { from: 'review', to: 'done', signal: 'review_approved', gate: 'review_passed' },
    { from: 'sprint', to: 'sprint', signal: 'retry', gate: 'within_retry_limit' },
    { from: 'review', to: 'sprint', signal: 'changes_requested' },
    { from: 'plan', to: 'failed', signal: 'unrecoverable_error' },
    { from: 'test', to: 'failed', signal: 'unrecoverable_error' },
    { from: 'sprint', to: 'failed', signal: 'unrecoverable_error' }
  ]
}

/**
 * Load constitution from project.
 */
export function loadConstitution(projectRoot: string): Constitution | null {
  const constitutionPath = join(projectRoot, '.agents', 'constitution.yml')
  if (!existsSync(constitutionPath)) return null
  
  const content = readFileSync(constitutionPath, 'utf-8')
  return parseConstitution(content)
}

/**
 * Create FSM engine.
 */
export class PipelineFSM {
  private constitution: Constitution
  private state: FSMState
  
  constructor(constitution: Constitution, initialStage: PipelineStage = 'plan') {
    this.constitution = constitution
    this.state = {
      currentStage: initialStage,
      history: []
    }
  }
  
  /**
   * Get current stage.
   */
  get currentStage(): PipelineStage {
    return this.state.currentStage
  }
  
  /**
   * Get history.
   */
  get history(): FSMState['history'] {
    return [...this.state.history]
  }
  
  /**
   * Check if transition is allowed.
   */
  canTransition(to: PipelineStage, signal?: string): FSMResult {
    const validTransitions = this.constitution.workflow.transitions.filter(
      t => t.from === this.state.currentStage && t.to === to
    )
    
    if (validTransitions.length === 0) {
      return {
        allowed: false,
        reason: `No transition from '${this.state.currentStage}' to '${to}'`
      }
    }
    
    if (signal) {
      const matchingTransition = validTransitions.find(t => t.signal === signal)
      if (!matchingTransition) {
        return {
          allowed: false,
          reason: `Signal '${signal}' not valid for transition to '${to}'`
        }
      }
    }
    
    return { allowed: true, newStage: to }
  }
  
  /**
   * Execute transition.
   */
  transition(to: PipelineStage, evidence?: string): FSMResult {
    const result = this.canTransition(to)
    
    if (!result.allowed) {
      return result
    }
    
    const from = this.state.currentStage
    this.state.history.push({
      from,
      to,
      timestamp: Date.now(),
      evidence
    })
    this.state.currentStage = to
    
    return { allowed: true, newStage: to }
  }
  
  /**
   * Get valid next stages.
   */
  getValidNextStages(): PipelineStage[] {
    return this.constitution.workflow.transitions
      .filter(t => t.from === this.state.currentStage)
      .map(t => t.to)
      .filter((v, i, a) => a.indexOf(v) === i) // unique
  }
  
  /**
   * Get required gate for transition.
   */
  getRequiredGate(to: PipelineStage): string | undefined {
    const transition = this.constitution.workflow.transitions.find(
      t => t.from === this.state.currentStage && t.to === to
    )
    return transition?.gate
  }
}

/**
 * Spawn policy checker.
 */
export class SpawnPolicy {
  private constitution: Constitution
  private spawnCounts: Map<string, number[]>
  private childrenCounts: Map<string, number>
  
  constructor(constitution: Constitution) {
    this.constitution = constitution
    this.spawnCounts = new Map()
    this.childrenCounts = new Map()
  }
  
  /**
   * Check if spawn is allowed.
   */
  canSpawn(role: string, parentId?: string): { allowed: boolean; reason?: string } {
    // Check rate limit
    const now = Date.now()
    const minuteKey = Math.floor(now / 60000).toString()
    const counts = this.spawnCounts.get(minuteKey) ?? []
    const recentCounts = counts.filter(t => now - t < 60000)
    
    if (recentCounts.length >= this.constitution.policies.rate_limit_per_minute) {
      return { allowed: false, reason: 'Rate limit exceeded' }
    }
    
    // Check max children
    if (parentId) {
      const childCount = this.childrenCounts.get(parentId) ?? 0
      if (childCount >= this.constitution.policies.max_children_per_parent) {
        return { allowed: false, reason: 'Max children exceeded' }
      }
    }
    
    return { allowed: true }
  }
  
  /**
   * Record a spawn.
   */
  recordSpawn(role: string, parentId?: string): void {
    const now = Date.now()
    const minuteKey = Math.floor(now / 60000).toString()
    const counts = this.spawnCounts.get(minuteKey) ?? []
    counts.push(now)
    this.spawnCounts.set(minuteKey, counts)
    
    if (parentId) {
      this.childrenCounts.set(parentId, (this.childrenCounts.get(parentId) ?? 0) + 1)
    }
  }
  
  /**
   * Record a child completion.
   */
  recordCompletion(parentId: string): void {
    const count = this.childrenCounts.get(parentId) ?? 0
    if (count > 0) {
      this.childrenCounts.set(parentId, count - 1)
    }
  }
  
  /**
   * Check information barrier.
   */
  isInformationBarrierActive(): boolean {
    return this.constitution.policies.information_barrier
  }
  
  /**
   * Get max fix cycles.
   */
  get maxFixCycles(): number {
    return this.constitution.policies.max_fix_cycles
  }
}
