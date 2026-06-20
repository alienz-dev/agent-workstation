import { describe, it, expect } from 'vitest'
import {
  BUILTIN_GATES,
  getGateConfig,
  allGatesPassed,
  getFailedGates,
  checkTimingBudget,
  DEFAULT_TIMING_BUDGET
} from './gates.js'
import type { PipelineStage } from './types.js'

describe('BUILTIN_GATES', () => {
  it('has test gate', () => {
    expect(BUILTIN_GATES.test).toBeDefined()
    expect(BUILTIN_GATES.test.type).toBe('test')
  })

  it('has typecheck gate', () => {
    expect(BUILTIN_GATES.typecheck).toBeDefined()
    expect(BUILTIN_GATES.typecheck.type).toBe('typecheck')
  })

  it('has lint gate', () => {
    expect(BUILTIN_GATES.lint).toBeDefined()
    expect(BUILTIN_GATES.lint.type).toBe('lint')
  })
})

describe('getGateConfig', () => {
  it('returns built-in gates', () => {
    const config = getGateConfig('test')
    expect(config.name).toBe('test')
    expect(config.command).toBe('npm test')
  })

  it('returns custom gate from constitution', () => {
    const constitution = {
      workflow: {
        states: ['plan'] as PipelineStage[],
        transitions: []
      },
      policies: {
        information_barrier: true,
        max_fix_cycles: 3,
        max_children_per_parent: 3,
        rate_limit_per_minute: 5
      },
      gates: {
        'my-gate': { command: 'echo test', timeout: 30 }
      }
    }
    
    const config = getGateConfig('my-gate', constitution)
    expect(config.command).toBe('echo test')
    expect(config.timeout).toBe(30)
  })

  it('returns default for unknown gate', () => {
    const config = getGateConfig('unknown-gate')
    expect(config.name).toBe('unknown-gate')
    expect(config.type).toBe('custom')
  })
})

describe('allGatesPassed', () => {
  it('returns true when all passed', () => {
    const results = [
      { name: 'test', passed: true, output: '', exitCode: 0, duration: 100, timedOut: false },
      { name: 'lint', passed: true, output: '', exitCode: 0, duration: 50, timedOut: false }
    ]
    expect(allGatesPassed(results)).toBe(true)
  })

  it('returns false when any failed', () => {
    const results = [
      { name: 'test', passed: true, output: '', exitCode: 0, duration: 100, timedOut: false },
      { name: 'lint', passed: false, output: 'error', exitCode: 1, duration: 50, timedOut: false }
    ]
    expect(allGatesPassed(results)).toBe(false)
  })
})

describe('getFailedGates', () => {
  it('returns only failed gates', () => {
    const results = [
      { name: 'test', passed: true, output: '', exitCode: 0, duration: 100, timedOut: false },
      { name: 'lint', passed: false, output: 'error', exitCode: 1, duration: 50, timedOut: false }
    ]
    const failed = getFailedGates(results)
    expect(failed).toHaveLength(1)
    expect(failed[0].name).toBe('lint')
  })
})

describe('checkTimingBudget', () => {
  it('returns not exceeded within budget', () => {
    const result = checkTimingBudget(1000, DEFAULT_TIMING_BUDGET)
    expect(result.exceeded).toBe(false)
    expect(result.level).toBeNull()
  })

  it('returns exceeded at task level', () => {
    const result = checkTimingBudget(35000, DEFAULT_TIMING_BUDGET)
    expect(result.exceeded).toBe(true)
    expect(result.level).toBe('task')
  })

  it('returns exceeded at wave level', () => {
    const result = checkTimingBudget(130000, DEFAULT_TIMING_BUDGET)
    expect(result.exceeded).toBe(true)
    expect(result.level).toBe('wave')
  })

  it('returns exceeded at total level', () => {
    const result = checkTimingBudget(610000, DEFAULT_TIMING_BUDGET)
    expect(result.exceeded).toBe(true)
    expect(result.level).toBe('total')
  })
})
