/**
 * Gate system for quality enforcement.
 */
import { spawn } from 'child_process'
import type { Constitution } from './types.js'

export type GateType = 'test' | 'typecheck' | 'lint' | 'review' | 'custom'

export interface GateConfig {
  name: string
  type: GateType
  command: string
  timeout: number
  required?: boolean
}

export interface GateResult {
  name: string
  passed: boolean
  output: string
  exitCode: number
  duration: number
  timedOut: boolean
}

export interface GateRunnerOptions {
  timeout?: number
  cwd?: string
  env?: Record<string, string>
}

/**
 * Run a gate command.
 */
export async function runGate(
  config: GateConfig,
  options: GateRunnerOptions = {}
): Promise<GateResult> {
  const startTime = Date.now()
  const timeout = options.timeout ?? config.timeout ?? 60000
  
  return new Promise((resolve) => {
    const proc = spawn(config.command, [], {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
      shell: true,
      timeout
    })
    
    let output = ''
    let timedOut = false
    
    proc.stdout.on('data', (data) => {
      output += data.toString()
    })
    
    proc.stderr.on('data', (data) => {
      output += data.toString()
    })
    
    proc.on('close', (code) => {
      resolve({
        name: config.name,
        passed: code === 0 && !timedOut,
        output,
        exitCode: code ?? 1,
        duration: Date.now() - startTime,
        timedOut
      })
    })
    
    proc.on('error', (error) => {
      resolve({
        name: config.name,
        passed: false,
        output: error.message,
        exitCode: 1,
        duration: Date.now() - startTime,
        timedOut: false
      })
    })
    
    // Handle timeout
    setTimeout(() => {
      timedOut = true
      proc.kill('SIGTERM')
    }, timeout)
  })
}

/**
 * Built-in gate configurations.
 */
export const BUILTIN_GATES: Record<string, GateConfig> = {
  test: {
    name: 'test',
    type: 'test',
    command: 'npm test',
    timeout: 120000
  },
  typecheck: {
    name: 'typecheck',
    type: 'typecheck',
    command: 'npx tsc --noEmit',
    timeout: 60000
  },
  lint: {
    name: 'lint',
    type: 'lint',
    command: 'npm run lint',
    timeout: 60000
  }
}

/**
 * Get gate config from constitution.
 */
export function getGateConfig(name: string, constitution?: Constitution): GateConfig {
  // Check built-in first
  if (BUILTIN_GATES[name]) {
    return BUILTIN_GATES[name]
  }
  
  // Check constitution
  if (constitution?.gates[name]) {
    return {
      name,
      type: 'custom',
      command: constitution.gates[name].command,
      timeout: constitution.gates[name].timeout
    }
  }
  
  // Default
  return {
    name,
    type: 'custom',
    command: name,
    timeout: 60000
  }
}

/**
 * Run multiple gates in sequence.
 */
export async function runGates(
  configs: GateConfig[],
  options: GateRunnerOptions = {}
): Promise<GateResult[]> {
  const results: GateResult[] = []
  
  for (const config of configs) {
    const result = await runGate(config, options)
    results.push(result)
    
    // Stop on first failure if required
    if (!result.passed && config.required) {
      break
    }
  }
  
  return results
}

/**
 * Check if all gates passed.
 */
export function allGatesPassed(results: GateResult[]): boolean {
  return results.every(r => r.passed)
}

/**
 * Get failed gates.
 */
export function getFailedGates(results: GateResult[]): GateResult[] {
  return results.filter(r => !r.passed)
}

/**
 * Timing budget for gates.
 */
export interface TimingBudget {
  task: number      // per-task timeout
  wave: number      // per-wave timeout
  total: number     // total timeout
}

export const DEFAULT_TIMING_BUDGET: TimingBudget = {
  task: 30000,   // 30s per task
  wave: 120000,  // 2min per wave
  total: 600000  // 10min total
}

/**
 * Check timing budget.
 */
export function checkTimingBudget(
  elapsed: number,
  budget: TimingBudget = DEFAULT_TIMING_BUDGET
): { exceeded: boolean; remaining: number; level: 'task' | 'wave' | 'total' | null } {
  if (elapsed >= budget.total) {
    return { exceeded: true, remaining: 0, level: 'total' }
  }
  if (elapsed >= budget.wave) {
    return { exceeded: true, remaining: budget.total - elapsed, level: 'wave' }
  }
  if (elapsed >= budget.task) {
    return { exceeded: true, remaining: budget.wave - elapsed, level: 'task' }
  }
  return { exceeded: false, remaining: budget.task - elapsed, level: null }
}
