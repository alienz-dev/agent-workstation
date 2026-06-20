/**
 * Plan parser and management.
 * Parses markdown plans into tasks with dependencies.
 */
import { readFileSync } from 'fs'
import { basename } from 'path'

export interface ParsedTask {
  id: string
  title: string
  description: string
  role: string
  deps: string[]
  wave: number | null
}

export interface ParsedPlan {
  id: string
  title: string
  tasks: ParsedTask[]
}

/**
 * Parse a plan markdown file.
 * 
 * Format:
 * ```markdown
 * # Plan: <title>
 * 
 * ## Wave 1: <wave-name>
 * 
 * ### Task: <task-title>
 * - **Role:** coder
 * - **Deps:** [task-id-1, task-id-2]
 * - **Description:** What this task does
 * ```
 */
export function parsePlan(content: string, sourceFile: string): ParsedPlan {
  const lines = content.split('\n')
  const tasks: ParsedTask[] = []
  let planTitle = basename(sourceFile, '.md')
  let currentWave: number | null = null
  let currentTask: Partial<ParsedTask> | null = null
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Plan title: # Plan: <title>
    if (line.startsWith('# Plan:')) {
      planTitle = line.slice(7).trim()
      continue
    }
    
    // Wave header: ## Wave N: <name>
    const waveMatch = line.match(/^## Wave (\d+):/)
    if (waveMatch) {
      // Save previous task
      if (currentTask && currentTask.title && currentTask.role) {
        tasks.push(finalizeTask(currentTask, currentWave))
      }
      currentTask = null
      currentWave = parseInt(waveMatch[1], 10)
      continue
    }
    
    // Task header: ### Task: <title>
    if (line.startsWith('### Task:')) {
      // Save previous task
      if (currentTask && currentTask.title && currentTask.role) {
        tasks.push(finalizeTask(currentTask, currentWave))
      }
      currentTask = {
        title: line.slice(9).trim(),
        id: slugify(line.slice(9).trim()),
        role: 'coder',
        deps: [],
        description: ''
      }
      continue
    }
    
    // Task properties
    if (currentTask) {
      // Role: - **Role:** <role>
      const roleMatch = line.match(/^-\s*\*\*Role:\*\*\s*(\S+)/)
      if (roleMatch) {
        currentTask.role = roleMatch[1]
        continue
      }
      
      // Deps: - **Deps:** [id1, id2]
      const depsMatch = line.match(/^-\s*\*\*Deps:\*\*\s*\[([^\]]+)\]/)
      if (depsMatch) {
        currentTask.deps = depsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''))
        continue
      }
      
      // Description: - **Description:** <text>
      const descMatch = line.match(/^-\s*\*\*Description:\*\*\s*(.+)/)
      if (descMatch) {
        currentTask.description = descMatch[1].trim()
        continue
      }
      
      // Multi-line description (indented text after task header)
      if (line && !line.startsWith('#') && !line.startsWith('- **')) {
        if (currentTask.description) {
          currentTask.description += ' ' + line
        } else {
          currentTask.description = line
        }
      }
    }
  }
  
  // Save last task
  if (currentTask && currentTask.title && currentTask.role) {
    tasks.push(finalizeTask(currentTask, currentWave))
  }
  
  // Validate no cycles
  validateNoCycles(tasks)
  
  return {
    id: slugify(planTitle),
    title: planTitle,
    tasks
  }
}

function finalizeTask(task: Partial<ParsedTask>, wave: number | null): ParsedTask {
  return {
    id: task.id || slugify(task.title || ''),
    title: task.title || '',
    description: task.description || '',
    role: task.role || 'coder',
    deps: task.deps || [],
    wave
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

/**
 * Validate that the task graph has no cycles.
 */
export function validateNoCycles(tasks: ParsedTask[]): void {
  const taskMap = new Map(tasks.map(t => [t.id, t]))
  const visited = new Set<string>()
  const stack = new Set<string>()
  
  function visit(id: string): void {
    if (visited.has(id)) return
    if (stack.has(id)) {
      throw new Error(`Cycle detected in task dependencies: ${id}`)
    }
    
    stack.add(id)
    const task = taskMap.get(id)
    if (task) {
      for (const dep of task.deps) {
        visit(dep)
      }
    }
    stack.delete(id)
    visited.add(id)
  }
  
  for (const task of tasks) {
    visit(task.id)
  }
}

/**
 * Parse a plan file from disk.
 */
export function parsePlanFile(filePath: string): ParsedPlan {
  const content = readFileSync(filePath, 'utf-8')
  return parsePlan(content, filePath)
}

/**
 * Get task status summary.
 */
export function getPlanStatus(tasks: Array<{ status: string }>): {
  total: number
  pending: number
  running: number
  done: number
  failed: number
  completion: number
} {
  const total = tasks.length
  const pending = tasks.filter(t => t.status === 'pending').length
  const running = tasks.filter(t => t.status === 'running').length
  const done = tasks.filter(t => t.status === 'done').length
  const failed = tasks.filter(t => t.status === 'failed').length
  const completion = total > 0 ? Math.round((done / total) * 100) : 0
  
  return { total, pending, running, done, failed, completion }
}

/**
 * Find tasks ready to dispatch (all deps satisfied).
 */
export function findReadyTasks(
  tasks: Array<{ id: string; status: string; deps: string[] }>
): string[] {
  const done = new Set(tasks.filter(t => t.status === 'done').map(t => t.id))
  
  return tasks
    .filter(t => t.status === 'pending')
    .filter(t => t.deps.every(d => done.has(d)))
    .map(t => t.id)
}

/**
 * Find blocked tasks (deps not satisfied).
 */
export function findBlockedTasks(
  tasks: Array<{ id: string; status: string; deps: string[] }>
): Array<{ id: string; blockedBy: string[] }> {
  const done = new Set(tasks.filter(t => t.status === 'done').map(t => t.id))
  
  return tasks
    .filter(t => t.status === 'pending')
    .filter(t => !t.deps.every(d => done.has(d)))
    .map(t => ({
      id: t.id,
      blockedBy: t.deps.filter(d => !done.has(d))
    }))
}
