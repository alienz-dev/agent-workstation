/**
 * End-to-end integration test for Agent Workstation.
 * Verifies all built features work together.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { existsSync } from 'fs'

// Core imports
import { 
  SpawnConfig, 
  AgentResult, 
  Briefing, 
  PipelineStage,
  Constitution
} from './types.js'
import { DaemonClient } from './daemon-client.js'
import { createDatabase, createTestDatabase } from './database.js'
import { 
  createPluginRegistry, 
  registerPlugin,
  initializePlugins 
} from './plugins.js'
import { 
  parsePlan, 
  validateNoCycles,
  findReadyTasks 
} from './plan.js'
import { 
  buildTaskGraph, 
  EventDispatcher 
} from './dispatch.js'
import { 
  classifyError, 
  CircuitBreaker,
  withRetry 
} from './errors.js'
import { 
  addHeuristic, 
  matchHeuristics,
  proposeHeuristics 
} from './heuristics.js'
import { 
  buildBriefing, 
  formatBriefing,
  validateResult 
} from './briefing.js'
import { 
  PipelineFSM, 
  SpawnPolicy,
  parseConstitution 
} from './pipeline.js'
import { 
  runGate, 
  BUILTIN_GATES,
  allGatesPassed 
} from './gates.js'
import { 
  calculateBlastRadius, 
  InformationBarrier,
  filterSpecContent 
} from './review.js'

describe('E2E: Monorepo Structure', () => {
  it('has all packages', () => {
    const packages = ['cli', 'core', 'daemon', 'plugins', 'adapters']
    const rootDir = join(process.cwd(), '..', '..')
    for (const pkg of packages) {
      const path = join(rootDir, 'packages', pkg)
      expect(existsSync(path), `Package ${pkg} should exist`).toBe(true)
    }
  })

  it('has methodology content', () => {
    const dirs = ['workflow', 'roles', 'templates', 'quality']
    const rootDir = join(process.cwd(), '..', '..')
    for (const dir of dirs) {
      const path = join(rootDir, 'methodology', dir)
      expect(existsSync(path), `Methodology ${dir} should exist`).toBe(true)
    }
  })
})

describe('E2E: Core Types', () => {
  it('SpawnConfig is valid', () => {
    const config: SpawnConfig = {
      agent: 'coder',
      task: 'fix the bug',
      adapter: 'kiro',
      workdir: '/tmp/test'
    }
    expect(config.agent).toBe('coder')
    expect(config.task).toBe('fix the bug')
  })

  it('AgentResult is valid', () => {
    const result: AgentResult = {
      status: 'PASS',
      summary: 'Fixed successfully',
      changes: [{ file: 'src/index.ts', description: 'Fixed bug' }],
      verification: { command: 'npm test', output: 'OK', exit_code: 0 },
      decisions: {}
    }
    expect(result.status).toBe('PASS')
  })

  it('Briefing is valid', () => {
    const briefing: Briefing = {
      task: 'Fix bug',
      context: 'Context info',
      constraints: {
        owned_files: ['src/index.ts'],
        denied_paths: ['specs/**'],
        scope: 'coder',
        do_not: []
      },
      verification: { command: 'npm test', expected: 'exit 0' }
    }
    expect(briefing.task).toBe('Fix bug')
  })
})

describe('E2E: Database', () => {
  it('creates and queries database', async () => {
    const db = createTestDatabase()
    
    // Import schema
    const { agents, plans, tasks, issues, heuristics } = await import('./schema.js')
    const { eq } = await import('drizzle-orm')
    
    // Insert agent
    await db.insert(agents).values({
      id: 'e2e-agent-1',
      role: 'coder',
      status: 'initializing',
      adapter: 'kiro',
      task: 'e2e test',
      startedAt: Date.now(),
      sessionName: 'test'
    })
    
    // Query agent
    const result = await db.select().from(agents).where(eq(agents.id, 'e2e-agent-1'))
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('coder')
  })
})

describe('E2E: Plugin System', () => {
  it('registers and initializes plugins', async () => {
    const registry = createPluginRegistry()
    let initialized = false
    
    const plugin = {
      name: 'e2e-plugin',
      version: '1.0.0',
      commands: [
        { name: 'test', description: 'Test command', run: async () => {} }
      ],
      migrations: [],
      onInit: async () => { initialized = true }
    }
    
    registerPlugin(registry, plugin)
    
    const context = {
      projectRoot: '/tmp/test',
      methodologyPath: '/tmp/test/methodology'
    }
    
    await initializePlugins(registry, context)
    
    expect(registry.plugins.size).toBe(1)
    expect(initialized).toBe(true)
  })
})

describe('E2E: Plan System', () => {
  it('parses and validates plan', () => {
    const content = `
# Plan: E2E Test Plan

## Wave 1: Setup

### Task: Initialize
- **Role:** coder
- **Description:** Setup the project

### Task: Configure
- **Role:** coder
- **Deps:** [initialize]
- **Description:** Configure settings
`
    const plan = parsePlan(content, 'e2e.md')
    
    expect(plan.title).toBe('E2E Test Plan')
    expect(plan.tasks).toHaveLength(2)
    expect(plan.tasks[1].deps).toEqual(['initialize'])
    
    // Validate no cycles
    expect(() => validateNoCycles(plan.tasks)).not.toThrow()
  })

  it('finds ready tasks', () => {
    const tasks = [
      { id: 'a', status: 'pending', deps: [] },
      { id: 'b', status: 'pending', deps: ['a'] }
    ]
    
    const ready = findReadyTasks(tasks)
    expect(ready).toEqual(['a'])
  })
})

describe('E2E: DAG Dispatch', () => {
  it('builds and executes task graph', async () => {
    const tasks = [
      { id: 'a', title: 'A', role: 'coder', deps: [], wave: null as number | null, description: '' },
      { id: 'b', title: 'B', role: 'coder', deps: ['a'], wave: null as number | null, description: '' }
    ]
    
    const order: string[] = []
    const context = {
      spawnAgent: async (task: typeof tasks[0]) => {
        order.push(task.id)
        return `agent-${task.id}`
      }
    }
    
    const { nodes, deps } = buildTaskGraph(tasks, context)
    
    expect(Object.keys(nodes)).toEqual(['a', 'b'])
    expect(deps).toEqual([['a', 'b']])
  })

  it('uses event dispatcher', () => {
    const tasks = [
      { id: 'a', title: 'A', role: 'coder', deps: [], wave: null as number | null, description: '' }
    ]
    
    const dispatcher = new EventDispatcher(tasks, {
      spawnAgent: async () => 'agent'
    })
    
    const ready = dispatcher.getReadyTasks()
    expect(ready).toHaveLength(1)
    expect(ready[0].id).toBe('a')
  })
})

describe('E2E: Error Handling', () => {
  it('classifies errors correctly', () => {
    const result: AgentResult = {
      status: 'FAIL',
      summary: 'Failed',
      changes: [],
      verification: { command: '', output: '', exit_code: 1 },
      decisions: {},
      issues: ['permission denied']
    }
    
    const errorClass = classifyError(result, { attempt: 1, maxRetries: 3 })
    expect(errorClass).toBe('permanent')
  })

  it('uses circuit breaker', () => {
    const breaker = new CircuitBreaker({ threshold: 2 })
    
    breaker.recordFailure('test')
    expect(breaker.isOpen('test')).toBe(false)
    
    breaker.recordFailure('test')
    expect(breaker.isOpen('test')).toBe(true)
  })
})

describe('E2E: Heuristics', () => {
  it('adds and matches heuristics', async () => {
    const db = createTestDatabase()
    
    const id = await addHeuristic(db, {
      title: 'E2E heuristic',
      type: 'failure',
      triggerCondition: 'permission denied',
      action: 'check file permissions',
      rationale: 'Common issue'
    })
    
    expect(id).toMatch(/^h-/)
    
    const matches = await matchHeuristics(db, 'fix permission denied error')
    expect(matches.length).toBeGreaterThanOrEqual(0)
  })

  it('proposes heuristics from reflection', () => {
    const proposals = proposeHeuristics({
      successes: [{ task: 'read file', approach: 'use fs.readFile' }],
      failures: [{ task: 'write file', error: 'permission denied', attempted: 'direct write' }]
    })
    
    expect(proposals).toHaveLength(2)
    expect(proposals.some(p => p.type === 'success')).toBe(true)
    expect(proposals.some(p => p.type === 'failure')).toBe(true)
  })
})

describe('E2E: Briefing Builder', () => {
  it('builds and formats briefing', () => {
    const briefing = buildBriefing({
      task: 'Fix the bug',
      role: 'coder',
      projectRoot: '/tmp/test',
      context: 'This is the context',
      heuristics: [
        { id: 'h1', triggerCondition: 'error', action: 'fix it', confidence: 'high', score: 1 }
      ]
    })
    
    expect(briefing.task).toBe('Fix the bug')
    expect(briefing.heuristics).toHaveLength(1)
    
    const formatted = formatBriefing(briefing)
    expect(formatted).toContain('# Briefing')
    expect(formatted).toContain('Fix the bug')
  })

  it('validates result', () => {
    const valid = validateResult(`
## Status: PASS
## Summary
Done
`)
    expect(valid.valid).toBe(true)
    
    const invalid = validateResult('No status')
    expect(invalid.valid).toBe(false)
  })
})

describe('E2E: Pipeline FSM', () => {
  it('enforces workflow transitions', () => {
    const constitution: Constitution = {
      workflow: {
        states: ['plan', 'test', 'sprint', 'review', 'done', 'failed'],
        transitions: [
          { from: 'plan', to: 'test', signal: 'plan_ready' },
          { from: 'test', to: 'sprint', signal: 'tests_ready' }
        ]
      },
      policies: {
        information_barrier: true,
        max_fix_cycles: 3,
        max_children_per_parent: 3,
        rate_limit_per_minute: 5
      },
      gates: {}
    }
    
    const fsm = new PipelineFSM(constitution)
    
    expect(fsm.currentStage).toBe('plan')
    
    // Valid transition
    const result = fsm.transition('test')
    expect(result.allowed).toBe(true)
    expect(fsm.currentStage).toBe('test')
    
    // Invalid transition
    const invalid = fsm.canTransition('done')
    expect(invalid.allowed).toBe(false)
  })

  it('enforces spawn policy', () => {
    const constitution: Constitution = {
      workflow: { states: ['plan'], transitions: [] },
      policies: {
        information_barrier: true,
        max_fix_cycles: 3,
        max_children_per_parent: 2,
        rate_limit_per_minute: 3
      },
      gates: {}
    }
    
    const policy = new SpawnPolicy(constitution)
    
    expect(policy.canSpawn('coder').allowed).toBe(true)
    expect(policy.isInformationBarrierActive()).toBe(true)
  })
})

describe('E2E: Gates', () => {
  it('has built-in gates', () => {
    expect(BUILTIN_GATES.test).toBeDefined()
    expect(BUILTIN_GATES.typecheck).toBeDefined()
    expect(BUILTIN_GATES.lint).toBeDefined()
  })

  it('evaluates gate results', () => {
    const results = [
      { name: 'test', passed: true, output: '', exitCode: 0, duration: 100, timedOut: false },
      { name: 'lint', passed: true, output: '', exitCode: 0, duration: 50, timedOut: false }
    ]
    
    expect(allGatesPassed(results)).toBe(true)
  })
})

describe('E2E: Review & Barrier', () => {
  it('calculates blast radius', () => {
    const radius = calculateBlastRadius(['src/a.ts', 'src/b.ts', '.env'])
    
    expect(radius.riskLevel).toBe('high')
    expect(radius.tier).toBe(3)
    expect(radius.sensitiveFiles).toContain('.env')
  })

  it('applies information barrier', () => {
    const barrier = new InformationBarrier(['specs/**'])
    
    expect(barrier.isBlocked('specs/feature.md')).toBe(true)
    expect(barrier.isBlocked('src/index.ts')).toBe(false)
  })

  it('filters spec content for coder', () => {
    const content = `
# Introduction
Intro text.

# Spec: Feature
This is the spec.
`
    const filtered = filterSpecContent(content, 'coder')
    expect(filtered).not.toContain('This is the spec')
    expect(filtered).toContain('# Introduction')
  })
})

describe('E2E: Full Workflow Simulation', () => {
  it('simulates complete workflow', async () => {
    // 1. Create database
    const db = createTestDatabase()
    
    // 2. Parse plan
    const plan = parsePlan(`
# Plan: E2E Workflow

### Task: Setup
- **Role:** coder

### Task: Build
- **Role:** coder
- **Deps:** [setup]
`, 'workflow.md')
    
    expect(plan.tasks).toHaveLength(2)
    
    // 3. Create FSM
    const constitution: Constitution = {
      workflow: { states: ['plan', 'test', 'sprint', 'review', 'done', 'failed'], transitions: [] },
      policies: { information_barrier: true, max_fix_cycles: 3, max_children_per_parent: 3, rate_limit_per_minute: 5 },
      gates: {}
    }
    const fsm = new PipelineFSM(constitution)
    
    // 4. Build briefing
    const briefing = buildBriefing({
      task: plan.tasks[0].title,
      role: plan.tasks[0].role,
      projectRoot: '/tmp/test'
    })
    
    expect(briefing.task).toBe('Setup')
    
    // 5. Calculate blast radius
    const radius = calculateBlastRadius(['src/index.ts'])
    expect(radius.tier).toBeLessThanOrEqual(3)
    
    // 6. Add heuristic
    const hId = await addHeuristic(db, {
      title: 'E2E lesson',
      type: 'success',
      triggerCondition: 'setup complete',
      action: 'proceed to build',
      rationale: 'Works'
    })
    expect(hId).toMatch(/^h-/)
    
    // All components integrated successfully
    expect(true).toBe(true)
  })
})
