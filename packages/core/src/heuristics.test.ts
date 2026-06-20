import { describe, it, expect } from 'vitest'
import { createTestDatabase } from './database.js'
import {
  generateHeuristicId,
  addHeuristic,
  listHeuristics,
  getHeuristic,
  archiveHeuristic,
  matchHeuristics,
  proposeHeuristics
} from './heuristics.js'

describe('heuristics', () => {
  it('generates heuristic IDs', () => {
    const id = generateHeuristicId()
    expect(id).toMatch(/^h-\d{4}-\d{2}-\d{2}-\d{3}$/)
  })

  it('adds and retrieves heuristics', async () => {
    const db = createTestDatabase()
    
    const id = await addHeuristic(db, {
      title: 'Test heuristic',
      type: 'failure',
      triggerCondition: 'permission denied',
      action: 'check file permissions',
      rationale: 'Common cause of failures',
      scope: 'briefing',
      confidence: 'medium'
    })
    
    const heuristic = await getHeuristic(db, id)
    expect(heuristic).not.toBeNull()
    expect(heuristic?.title).toBe('Test heuristic')
    expect(heuristic?.type).toBe('failure')
  })

  it('lists heuristics', async () => {
    const db = createTestDatabase()
    
    await addHeuristic(db, {
      title: 'Heuristic 1',
      type: 'failure',
      triggerCondition: 'trigger 1',
      action: 'action 1',
      rationale: 'rationale 1'
    })
    
    await addHeuristic(db, {
      title: 'Heuristic 2',
      type: 'success',
      triggerCondition: 'trigger 2',
      action: 'action 2',
      rationale: 'rationale 2'
    })
    
    const list = await listHeuristics(db)
    expect(list).toHaveLength(2)
  })

  it('archives heuristics', async () => {
    const db = createTestDatabase()
    
    const id = await addHeuristic(db, {
      title: 'Test',
      type: 'failure',
      triggerCondition: 'trigger',
      action: 'action',
      rationale: 'rationale'
    })
    
    await archiveHeuristic(db, id)
    
    const list = await listHeuristics(db, { archived: false })
    expect(list).toHaveLength(0)
    
    const archivedList = await listHeuristics(db, { archived: true })
    expect(archivedList).toHaveLength(1)
  })

  it('matches heuristics', async () => {
    const db = createTestDatabase()
    
    await addHeuristic(db, {
      title: 'Permission fix',
      type: 'failure',
      triggerCondition: 'permission denied error',
      action: 'Check file permissions',
      rationale: 'Common issue'
    })
    
    await addHeuristic(db, {
      title: 'Network fix',
      type: 'failure',
      triggerCondition: 'network timeout connection',
      action: 'Retry with backoff',
      rationale: 'Network issues are transient'
    })
    
    const matches = await matchHeuristics(db, 'fix permission denied in file access')
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].triggerCondition).toContain('permission')
  })
})

describe('proposeHeuristics', () => {
  it('proposes from failures', () => {
    const reflection = {
      successes: [],
      failures: [
        { task: 'write to file', error: 'permission denied', attempted: 'direct write' }
      ]
    }
    
    const proposals = proposeHeuristics(reflection)
    expect(proposals).toHaveLength(1)
    expect(proposals[0].type).toBe('failure')
    expect(proposals[0].action).toContain('direct write')
  })

  it('proposes from successes', () => {
    const reflection = {
      successes: [
        { task: 'read config', approach: 'use JSON parser' }
      ],
      failures: []
    }
    
    const proposals = proposeHeuristics(reflection)
    expect(proposals).toHaveLength(1)
    expect(proposals[0].type).toBe('success')
    expect(proposals[0].action).toBe('use JSON parser')
  })
})
