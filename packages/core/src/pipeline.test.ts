import { describe, it, expect } from 'vitest'
import {
  parseConstitution,
  buildDefaultTransitions,
  PipelineFSM,
  SpawnPolicy
} from './pipeline.js'
import type { PipelineStage } from './types.js'

describe('parseConstitution', () => {
  it('parses basic constitution', () => {
    const content = `
workflow:
  states: [plan, test, sprint, review, done]

policies:
  information_barrier: true
  max_fix_cycles: 3
  max_children_per_parent: 3
  rate_limit_per_minute: 5

gates:
  test:
    command: npm test
    timeout: 120
`
    const constitution = parseConstitution(content)
    
    expect(constitution.policies.information_barrier).toBe(true)
    expect(constitution.policies.max_fix_cycles).toBe(3)
    expect(constitution.gates.test).toBeDefined()
    expect(constitution.gates.test.command).toBe('npm test')
    expect(constitution.gates.test.timeout).toBe(120)
  })
})

describe('buildDefaultTransitions', () => {
  it('creates default transitions', () => {
    const transitions = buildDefaultTransitions()
    
    expect(transitions.length).toBeGreaterThan(0)
    expect(transitions.some(t => t.from === 'plan' && t.to === 'test')).toBe(true)
    expect(transitions.some(t => t.from === 'sprint' && t.to === 'review')).toBe(true)
  })
})

describe('PipelineFSM', () => {
  const makeConstitution = () => ({
    workflow: {
      states: ['plan', 'test', 'sprint', 'review', 'done', 'failed'] as PipelineStage[],
      transitions: buildDefaultTransitions()
    },
    policies: {
      information_barrier: true,
      max_fix_cycles: 3,
      max_children_per_parent: 3,
      rate_limit_per_minute: 5
    },
    gates: {}
  })

  it('starts in plan stage', () => {
    const fsm = new PipelineFSM(makeConstitution())
    expect(fsm.currentStage).toBe('plan')
  })

  it('allows valid transitions', () => {
    const fsm = new PipelineFSM(makeConstitution())
    
    const result = fsm.canTransition('test')
    expect(result.allowed).toBe(true)
  })

  it('blocks invalid transitions', () => {
    const fsm = new PipelineFSM(makeConstitution())
    
    const result = fsm.canTransition('done')
    expect(result.allowed).toBe(false)
  })

  it('executes transitions', () => {
    const fsm = new PipelineFSM(makeConstitution())
    
    const result = fsm.transition('test', 'tests written')
    expect(result.allowed).toBe(true)
    expect(fsm.currentStage).toBe('test')
  })

  it('tracks history', () => {
    const fsm = new PipelineFSM(makeConstitution())
    
    fsm.transition('test')
    fsm.transition('sprint')
    
    expect(fsm.history.length).toBe(2)
    expect(fsm.history[0].from).toBe('plan')
    expect(fsm.history[0].to).toBe('test')
  })

  it('gets valid next stages', () => {
    const fsm = new PipelineFSM(makeConstitution())
    
    const next = fsm.getValidNextStages()
    expect(next).toContain('test')
    expect(next).toContain('failed')
  })
})

describe('SpawnPolicy', () => {
  const makeConstitution = () => ({
    workflow: {
      states: ['plan', 'test', 'sprint', 'review', 'done', 'failed'] as PipelineStage[],
      transitions: []
    },
    policies: {
      information_barrier: true,
      max_fix_cycles: 3,
      max_children_per_parent: 2,
      rate_limit_per_minute: 3
    },
    gates: {}
  })

  it('allows spawn within rate limit', () => {
    const policy = new SpawnPolicy(makeConstitution())
    
    const result = policy.canSpawn('coder')
    expect(result.allowed).toBe(true)
  })

  it('blocks spawn over rate limit', () => {
    const constitution = makeConstitution()
    const policy = new SpawnPolicy(constitution)
    
    policy.recordSpawn('coder')
    policy.recordSpawn('coder')
    policy.recordSpawn('coder')
    
    const result = policy.canSpawn('coder')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Rate limit')
  })

  it('blocks spawn over max children', () => {
    const policy = new SpawnPolicy(makeConstitution())
    
    policy.recordSpawn('coder', 'parent-1')
    policy.recordSpawn('coder', 'parent-1')
    
    const result = policy.canSpawn('coder', 'parent-1')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Max children')
  })

  it('tracks child completion', () => {
    const policy = new SpawnPolicy(makeConstitution())
    
    policy.recordSpawn('coder', 'parent-1')
    policy.recordCompletion('parent-1')
    
    const result = policy.canSpawn('coder', 'parent-1')
    expect(result.allowed).toBe(true)
  })
})
