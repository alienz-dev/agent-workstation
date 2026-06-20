import { describe, it, expect, vi } from 'vitest'
import {
  buildTaskGraph,
  dispatchPlan,
  dispatchTask,
  EventDispatcher
} from './dispatch.js'
import type { ParsedTask } from './plan.js'

const makeTask = (id: string, deps: string[] = []): ParsedTask => ({
  id,
  title: id,
  description: '',
  role: 'coder',
  deps,
  wave: null
})

describe('buildTaskGraph', () => {
  it('builds graph from tasks', () => {
    const tasks = [
      makeTask('a'),
      makeTask('b', ['a'])
    ]
    const context = {
      spawnAgent: vi.fn().mockResolvedValue('agent-1')
    }
    const { nodes, deps } = buildTaskGraph(tasks, context)
    
    expect(Object.keys(nodes)).toEqual(['a', 'b'])
    expect(deps).toEqual([['a', 'b']])
  })

  it('assigns higher priority to root tasks', () => {
    const tasks = [
      makeTask('a'),
      makeTask('b', ['a'])
    ]
    const context = {
      spawnAgent: vi.fn().mockResolvedValue('agent-1')
    }
    const { nodes } = buildTaskGraph(tasks, context)
    
    expect(nodes['a'].priority).toBe(10)
    expect(nodes['b'].priority).toBe(0)
  })
})

describe('dispatchPlan', () => {
  it('dispatches tasks in order', async () => {
    const tasks = [
      makeTask('a'),
      makeTask('b', ['a'])
    ]
    const order: string[] = []
    const context = {
      spawnAgent: vi.fn().mockImplementation(async (task) => {
        order.push(task.id)
        return `agent-${task.id}`
      })
    }
    
    const result = await dispatchPlan(tasks, context)
    
    expect(order).toEqual(['a', 'b'])
    expect(result.completed).toEqual(['a', 'b'])
    expect(result.failed).toEqual([])
  })

  it('handles failures', async () => {
    const tasks = [
      makeTask('a'),
      makeTask('b', ['a'])
    ]
    const context = {
      spawnAgent: vi.fn()
        .mockResolvedValueOnce('agent-a')
        .mockRejectedValueOnce(new Error('failed'))
    }
    
    const result = await dispatchPlan(tasks, context)
    
    expect(result.completed).toEqual(['a'])
    expect(result.failed).toEqual(['b'])
  })
})

describe('dispatchTask', () => {
  it('dispatches single task', async () => {
    const task = makeTask('a')
    const context = {
      spawnAgent: vi.fn().mockResolvedValue('agent-1')
    }
    
    const result = await dispatchTask(task, context)
    
    expect(result).toBe('agent-1')
    expect(context.spawnAgent).toHaveBeenCalledWith(task)
  })
})

describe('EventDispatcher', () => {
  it('finds ready tasks', () => {
    const tasks = [
      makeTask('a'),
      makeTask('b', ['a'])
    ]
    const context = {
      spawnAgent: vi.fn().mockResolvedValue('agent-1')
    }
    const dispatcher = new EventDispatcher(tasks, context)
    
    const ready = dispatcher.getReadyTasks()
    expect(ready).toHaveLength(1)
    expect(ready[0].id).toBe('a')
  })

  it('updates ready tasks after completion', () => {
    const tasks = [
      makeTask('a'),
      makeTask('b', ['a'])
    ]
    const context = {
      spawnAgent: vi.fn().mockResolvedValue('agent-1')
    }
    const dispatcher = new EventDispatcher(tasks, context)
    
    dispatcher.markCompleted('a')
    const ready = dispatcher.getReadyTasks()
    expect(ready).toHaveLength(1)
    expect(ready[0].id).toBe('b')
  })

  it('tracks status', () => {
    const tasks = [
      makeTask('a'),
      makeTask('b', ['a']),
      makeTask('c', ['b'])
    ]
    const context = {
      spawnAgent: vi.fn().mockResolvedValue('agent-1')
    }
    const dispatcher = new EventDispatcher(tasks, context)
    
    dispatcher.markRunning('a')
    dispatcher.markCompleted('a')
    dispatcher.markRunning('b')
    
    const status = dispatcher.getStatus()
    expect(status.completed).toBe(1)
    expect(status.running).toBe(1)
    expect(status.pending).toBe(1)
  })
})
