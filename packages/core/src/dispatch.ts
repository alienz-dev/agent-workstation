/**
 * DAG-based task dispatch using p-graph.
 */
import { PGraph, type DependencyList, type PGraphNodeRecord } from 'p-graph'
import type { ParsedTask } from './plan.js'

export interface DispatchContext {
  spawnAgent: (task: ParsedTask) => Promise<string>
  onTaskStart?: (taskId: string) => void
  onTaskDone?: (taskId: string, result: unknown) => void
  onTaskFail?: (taskId: string, error: Error) => void
}

export interface DispatchResult {
  completed: string[]
  failed: string[]
  skipped: string[]
}

/**
 * Build a p-graph from tasks.
 */
export function buildTaskGraph(
  tasks: ParsedTask[],
  context: DispatchContext
): { nodes: PGraphNodeRecord; deps: DependencyList } {
  const nodes: PGraphNodeRecord = {}
  const deps: DependencyList = []

  for (const task of tasks) {
    nodes[task.id] = {
      run: async () => {
        context.onTaskStart?.(task.id)
        try {
          const result = await context.spawnAgent(task)
          context.onTaskDone?.(task.id, result)
          return result
        } catch (error) {
          context.onTaskFail?.(task.id, error as Error)
          throw error
        }
      },
      priority: task.deps.length === 0 ? 10 : 0
    }

    for (const dep of task.deps) {
      deps.push([dep, task.id])
    }
  }

  return { nodes, deps }
}

/**
 * Dispatch all tasks in dependency order.
 */
export async function dispatchPlan(
  tasks: ParsedTask[],
  context: DispatchContext,
  options: { concurrency?: number } = {}
): Promise<DispatchResult> {
  const { nodes, deps } = buildTaskGraph(tasks, context)
  const completed: string[] = []
  const failed: string[] = []
  const skipped: string[] = []

  const wrappedContext: DispatchContext = {
    ...context,
    onTaskDone: (taskId, result) => {
      completed.push(taskId)
      context.onTaskDone?.(taskId, result)
    },
    onTaskFail: (taskId, error) => {
      failed.push(taskId)
      context.onTaskFail?.(taskId, error)
    }
  }

  const { nodes: wrappedNodes } = buildTaskGraph(tasks, wrappedContext)

  try {
    await new PGraph(wrappedNodes, deps).run({
      concurrency: options.concurrency ?? 3
    })
  } catch (error) {
    // Some tasks failed, but we continue to collect results
  }

  // Identify skipped tasks (deps of failed tasks)
  const failedSet = new Set(failed)
  for (const task of tasks) {
    if (!completed.includes(task.id) && !failed.includes(task.id)) {
      if (task.deps.some(d => failedSet.has(d))) {
        skipped.push(task.id)
      }
    }
  }

  return { completed, failed, skipped }
}

/**
 * Dispatch a single task (for event-driven dispatch).
 */
export async function dispatchTask(
  task: ParsedTask,
  context: DispatchContext
): Promise<string> {
  context.onTaskStart?.(task.id)
  try {
    const result = await context.spawnAgent(task)
    context.onTaskDone?.(task.id, result)
    return result
  } catch (error) {
    context.onTaskFail?.(task.id, error as Error)
    throw error
  }
}

/**
 * Cancel a running plan.
 * Marks remaining tasks as cancelled and terminates running agents.
 */
export async function cancelPlan(
  tasks: ParsedTask[],
  runningAgents: Map<string, string>,
  terminateAgent: (agentId: string) => Promise<void>
): Promise<{ terminated: string[]; cancelled: string[] }> {
  const terminated: string[] = []
  const cancelled: string[] = []

  for (const [taskId, agentId] of runningAgents) {
    await terminateAgent(agentId)
    terminated.push(taskId)
  }

  for (const task of tasks) {
    if (!runningAgents.has(task.id)) {
      cancelled.push(task.id)
    }
  }

  return { terminated, cancelled }
}

/**
 * Event-driven dispatcher.
 * Watches for task completion and dispatches newly-ready tasks.
 */
export class EventDispatcher {
  private tasks: Map<string, ParsedTask>
  private completed: Set<string>
  private running: Set<string>
  private failed: Set<string>
  private context: DispatchContext

  constructor(tasks: ParsedTask[], context: DispatchContext) {
    this.tasks = new Map(tasks.map(t => [t.id, t]))
    this.completed = new Set()
    this.running = new Set()
    this.failed = new Set()
    this.context = context
  }

  /**
   * Get tasks ready to dispatch.
   */
  getReadyTasks(): ParsedTask[] {
    const ready: ParsedTask[] = []
    for (const [id, task] of this.tasks) {
      if (this.running.has(id) || this.completed.has(id) || this.failed.has(id)) {
        continue
      }
      if (task.deps.every(d => this.completed.has(d))) {
        ready.push(task)
      }
    }
    return ready
  }

  /**
   * Mark a task as running.
   */
  markRunning(taskId: string): void {
    this.running.add(taskId)
  }

  /**
   * Mark a task as completed.
   */
  markCompleted(taskId: string): void {
    this.running.delete(taskId)
    this.completed.add(taskId)
  }

  /**
   * Mark a task as failed.
   */
  markFailed(taskId: string): void {
    this.running.delete(taskId)
    this.failed.add(taskId)
  }

  /**
   * Get current status.
   */
  getStatus(): {
    completed: number
    running: number
    failed: number
    pending: number
  } {
    return {
      completed: this.completed.size,
      running: this.running.size,
      failed: this.failed.size,
      pending: this.tasks.size - this.completed.size - this.running.size - this.failed.size
    }
  }

  /**
   * Dispatch all ready tasks.
   */
  async dispatchReady(): Promise<string[]> {
    const ready = this.getReadyTasks()
    const dispatched: string[] = []

    for (const task of ready) {
      this.markRunning(task.id)
      dispatchTask(task, this.context)
        .then(() => this.markCompleted(task.id))
        .catch(() => this.markFailed(task.id))
      dispatched.push(task.id)
    }

    return dispatched
  }
}
