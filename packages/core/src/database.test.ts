import { describe, it, expect } from 'vitest'
import { createTestDatabase } from './database.js'
import { agents, plans, tasks, issues, heuristics } from './schema.js'
import { eq } from 'drizzle-orm'

describe('database', () => {
  it('creates in-memory database', () => {
    const db = createTestDatabase()
    expect(db).toBeDefined()
  })

  it('can insert and query agents', async () => {
    const db = createTestDatabase()
    
    await db.insert(agents).values({
      id: 'test-1',
      role: 'coder',
      status: 'initializing',
      adapter: 'kiro',
      task: 'fix bug',
      startedAt: Date.now(),
      sessionName: 'default'
    })
    
    const result = await db.select().from(agents).where(eq(agents.id, 'test-1'))
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('coder')
  })

  it('can insert and query plans', async () => {
    const db = createTestDatabase()
    
    await db.insert(plans).values({
      id: 'plan-1',
      title: 'Test Plan',
      status: 'loaded',
      createdAt: Date.now()
    })
    
    const result = await db.select().from(plans).where(eq(plans.id, 'plan-1'))
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Test Plan')
  })

  it('can insert and query tasks', async () => {
    const db = createTestDatabase()
    
    await db.insert(plans).values({
      id: 'plan-1',
      title: 'Test Plan',
      status: 'loaded',
      createdAt: Date.now()
    })
    
    await db.insert(tasks).values({
      id: 'task-1',
      planId: 'plan-1',
      title: 'Test Task',
      role: 'coder',
      status: 'pending',
      createdAt: Date.now()
    })
    
    const result = await db.select().from(tasks).where(eq(tasks.id, 'task-1'))
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Test Task')
  })

  it('can insert and query issues', async () => {
    const db = createTestDatabase()
    
    await db.insert(issues).values({
      id: 'issue-1',
      title: 'Bug Report',
      type: 'bug',
      status: 'open',
      createdAt: Date.now()
    })
    
    const result = await db.select().from(issues).where(eq(issues.id, 'issue-1'))
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Bug Report')
  })

  it('can insert and query heuristics', async () => {
    const db = createTestDatabase()
    
    await db.insert(heuristics).values({
      id: 'h-1',
      title: 'Test Heuristic',
      type: 'failure',
      triggerCondition: 'error contains "permission denied"',
      action: 'check file permissions',
      rationale: 'Common cause of failures',
      createdAt: Date.now()
    })
    
    const result = await db.select().from(heuristics).where(eq(heuristics.id, 'h-1'))
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Test Heuristic')
  })
})
