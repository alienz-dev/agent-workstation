import { describe, it, expect } from 'vitest'
import {
  parsePlan,
  validateNoCycles,
  getPlanStatus,
  findReadyTasks,
  findBlockedTasks
} from './plan.js'

describe('plan parser', () => {
  it('parses plan title', () => {
    const content = `# Plan: Build Feature X`
    const plan = parsePlan(content, 'test.md')
    expect(plan.title).toBe('Build Feature X')
  })

  it('parses tasks', () => {
    const content = `
# Plan: Test Plan

### Task: Write tests
- **Role:** test-manager
- **Description:** Write unit tests
`
    const plan = parsePlan(content, 'test.md')
    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0].title).toBe('Write tests')
    expect(plan.tasks[0].role).toBe('test-manager')
  })

  it('parses task dependencies', () => {
    const content = `
# Plan: Test Plan

### Task: Task A
- **Role:** coder

### Task: Task B
- **Role:** coder
- **Deps:** [task-a]
`
    const plan = parsePlan(content, 'test.md')
    expect(plan.tasks).toHaveLength(2)
    expect(plan.tasks[1].deps).toEqual(['task-a'])
  })

  it('parses waves', () => {
    const content = `
# Plan: Test Plan

## Wave 1: Foundation

### Task: Task A
- **Role:** coder

## Wave 2: Features

### Task: Task B
- **Role:** coder
`
    const plan = parsePlan(content, 'test.md')
    expect(plan.tasks).toHaveLength(2)
    expect(plan.tasks[0].wave).toBe(1)
    expect(plan.tasks[1].wave).toBe(2)
  })

  it('generates slug ids', () => {
    const content = `
### Task: This is a Complex Task Name
- **Role:** coder
`
    const plan = parsePlan(content, 'test.md')
    expect(plan.tasks[0].id).toBe('this-is-a-complex-task-name')
  })

  it('detects cycles', () => {
    const tasks = [
      { id: 'a', title: 'A', role: 'coder', deps: ['b'], wave: null, description: '' },
      { id: 'b', title: 'B', role: 'coder', deps: ['a'], wave: null, description: '' }
    ]
    expect(() => validateNoCycles(tasks)).toThrow('Cycle detected')
  })

  it('accepts valid deps', () => {
    const tasks = [
      { id: 'a', title: 'A', role: 'coder', deps: [], wave: null, description: '' },
      { id: 'b', title: 'B', role: 'coder', deps: ['a'], wave: null, description: '' }
    ]
    expect(() => validateNoCycles(tasks)).not.toThrow()
  })
})

describe('plan status', () => {
  it('calculates completion', () => {
    const tasks = [
      { status: 'done' },
      { status: 'done' },
      { status: 'pending' },
      { status: 'running' }
    ]
    const status = getPlanStatus(tasks)
    expect(status.total).toBe(4)
    expect(status.done).toBe(2)
    expect(status.pending).toBe(1)
    expect(status.running).toBe(1)
    expect(status.completion).toBe(50)
  })
})

describe('task dispatch', () => {
  it('finds ready tasks', () => {
    const tasks = [
      { id: 'a', status: 'pending', deps: [] },
      { id: 'b', status: 'pending', deps: ['a'] },
      { id: 'c', status: 'done', deps: [] }
    ]
    const ready = findReadyTasks(tasks)
    expect(ready).toEqual(['a'])
  })

  it('finds ready tasks with satisfied deps', () => {
    const tasks = [
      { id: 'a', status: 'done', deps: [] },
      { id: 'b', status: 'pending', deps: ['a'] },
      { id: 'c', status: 'pending', deps: ['a', 'b'] }
    ]
    const ready = findReadyTasks(tasks)
    expect(ready).toEqual(['b'])
  })

  it('finds blocked tasks', () => {
    const tasks = [
      { id: 'a', status: 'done', deps: [] },
      { id: 'b', status: 'pending', deps: ['a'] },
      { id: 'c', status: 'pending', deps: ['a', 'b'] }
    ]
    const blocked = findBlockedTasks(tasks)
    expect(blocked).toHaveLength(1)
    expect(blocked[0].id).toBe('c')
    expect(blocked[0].blockedBy).toEqual(['b'])
  })
})
