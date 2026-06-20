import { randomUUID } from 'crypto'
import type { Issue, IssueState, IssuePriority, IssueType, IssueLink } from './types.js'

export interface IssueFilter {
  state?: IssueState | IssueState[]
  type?: IssueType | IssueType[]
  priority?: IssuePriority | IssuePriority[]
  assignee?: string
  labels?: string[]
  parent_id?: string
}

export interface IssueUpdate {
  title?: string
  description?: string
  type?: IssueType
  state?: IssueState
  priority?: IssuePriority
  assignee?: string
  labels?: string[]
  metadata?: Record<string, unknown>
}

const VALID_TRANSITIONS: Record<IssueState, IssueState[]> = {
  'open': ['in-progress', 'closed'],
  'in-progress': ['review', 'open', 'closed'],
  'review': ['done', 'in-progress', 'closed'],
  'done': ['closed'],
  'closed': ['open']
}

export class IssueStore {
  private issues: Map<string, Issue> = new Map()
  private links: Map<string, IssueLink[]> = new Map()
  private byTask: Map<string, Set<string>> = new Map()
  private byAgent: Map<string, Set<string>> = new Map()

  open(params: {
    title: string
    description: string
    type: IssueType
    priority?: IssuePriority
    assignee?: string
    labels?: string[]
    parent_id?: string
    metadata?: Record<string, unknown>
  }): Issue {
    const now = Math.floor(Date.now() / 1000)
    const issue: Issue = {
      id: `issue-${randomUUID().slice(0, 8)}`,
      title: params.title,
      description: params.description,
      type: params.type,
      state: 'open',
      priority: params.priority ?? 'medium',
      assignee: params.assignee,
      labels: params.labels ?? [],
      parent_id: params.parent_id,
      task_ids: [],
      agent_ids: [],
      created_at: now,
      updated_at: now,
      metadata: params.metadata ?? {}
    }

    this.issues.set(issue.id, issue)
    this.links.set(issue.id, [])
    return issue
  }

  get(id: string): Issue | undefined {
    return this.issues.get(id)
  }

  update(id: string, updates: IssueUpdate): Issue {
    const issue = this.issues.get(id)
    if (!issue) {
      throw new Error(`Issue not found: ${id}`)
    }

    if (updates.state && updates.state !== issue.state) {
      const validNext = VALID_TRANSITIONS[issue.state]
      if (!validNext.includes(updates.state)) {
        throw new Error(
          `Invalid transition: ${issue.state} → ${updates.state}. Valid: ${validNext.join(', ')}`
        )
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const updated: Issue = {
      ...issue,
      ...updates,
      updated_at: now,
      closed_at: updates.state === 'closed' && issue.state !== 'closed' ? now : issue.closed_at
    }

    this.issues.set(id, updated)
    return updated
  }

  close(id: string, reason?: string): Issue {
    const issue = this.issues.get(id)
    if (!issue) {
      throw new Error(`Issue not found: ${id}`)
    }

    const now = Math.floor(Date.now() / 1000)
    const closed: Issue = {
      ...issue,
      state: 'closed',
      updated_at: now,
      closed_at: now,
      metadata: { ...issue.metadata, close_reason: reason }
    }

    this.issues.set(id, closed)
    return closed
  }

  list(filter?: IssueFilter): Issue[] {
    let results = Array.from(this.issues.values())

    if (filter) {
      if (filter.state) {
        const states = Array.isArray(filter.state) ? filter.state : [filter.state]
        results = results.filter(i => states.includes(i.state))
      }
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type]
        results = results.filter(i => types.includes(i.type))
      }
      if (filter.priority) {
        const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority]
        results = results.filter(i => priorities.includes(i.priority))
      }
      if (filter.assignee) {
        results = results.filter(i => i.assignee === filter.assignee)
      }
      if (filter.labels && filter.labels.length > 0) {
        results = results.filter(i =>
          filter.labels!.every(label => i.labels.includes(label))
        )
      }
      if (filter.parent_id) {
        results = results.filter(i => i.parent_id === filter.parent_id)
      }
    }

    return results.sort((a, b) => b.updated_at - a.updated_at)
  }

  link(issueId: string, targetType: 'task' | 'agent' | 'issue', targetId: string, relation: IssueLink['relation']): IssueLink {
    const issue = this.issues.get(issueId)
    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`)
    }

    const link: IssueLink = {
      issue_id: issueId,
      target_type: targetType,
      target_id: targetId,
      relation
    }

    const links = this.links.get(issueId) ?? []
    links.push(link)
    this.links.set(issueId, links)

    if (targetType === 'task') {
      const taskIssues = this.byTask.get(targetId) ?? new Set()
      taskIssues.add(issueId)
      this.byTask.set(targetId, taskIssues)
      
      if (!issue.task_ids.includes(targetId)) {
        issue.task_ids.push(targetId)
        issue.updated_at = Math.floor(Date.now() / 1000)
      }
    }

    if (targetType === 'agent') {
      const agentIssues = this.byAgent.get(targetId) ?? new Set()
      agentIssues.add(issueId)
      this.byAgent.set(targetId, agentIssues)
      
      if (!issue.agent_ids.includes(targetId)) {
        issue.agent_ids.push(targetId)
        issue.updated_at = Math.floor(Date.now() / 1000)
      }
    }

    return link
  }

  unlink(issueId: string, targetType: 'task' | 'agent' | 'issue', targetId: string): void {
    const issue = this.issues.get(issueId)
    if (!issue) return

    const links = this.links.get(issueId) ?? []
    const filtered = links.filter(
      l => !(l.target_type === targetType && l.target_id === targetId)
    )
    this.links.set(issueId, filtered)

    if (targetType === 'task') {
      issue.task_ids = issue.task_ids.filter(id => id !== targetId)
      issue.updated_at = Math.floor(Date.now() / 1000)
      
      const taskIssues = this.byTask.get(targetId)
      if (taskIssues) {
        taskIssues.delete(issueId)
      }
    }

    if (targetType === 'agent') {
      issue.agent_ids = issue.agent_ids.filter(id => id !== targetId)
      issue.updated_at = Math.floor(Date.now() / 1000)
      
      const agentIssues = this.byAgent.get(targetId)
      if (agentIssues) {
        agentIssues.delete(issueId)
      }
    }
  }

  getLinks(issueId: string): IssueLink[] {
    return this.links.get(issueId) ?? []
  }

  findByTask(taskId: string): Issue[] {
    const issueIds = this.byTask.get(taskId)
    if (!issueIds) return []
    return Array.from(issueIds)
      .map(id => this.issues.get(id))
      .filter((i): i is Issue => i !== undefined)
  }

  findByAgent(agentId: string): Issue[] {
    const issueIds = this.byAgent.get(agentId)
    if (!issueIds) return []
    return Array.from(issueIds)
      .map(id => this.issues.get(id))
      .filter((i): i is Issue => i !== undefined)
  }

  getTransitions(state: IssueState): IssueState[] {
    return VALID_TRANSITIONS[state]
  }

  stats(): {
    total: number
    byState: Record<IssueState, number>
    byType: Record<IssueType, number>
    byPriority: Record<IssuePriority, number>
  } {
    const issues = Array.from(this.issues.values())
    
    const byState: Record<IssueState, number> = {
      'open': 0, 'in-progress': 0, 'review': 0, 'done': 0, 'closed': 0
    }
    const byType: Record<IssueType, number> = {
      'bug': 0, 'feature': 0, 'task': 0, 'epic': 0
    }
    const byPriority: Record<IssuePriority, number> = {
      'low': 0, 'medium': 0, 'high': 0, 'critical': 0
    }

    for (const issue of issues) {
      byState[issue.state]++
      byType[issue.type]++
      byPriority[issue.priority]++
    }

    return { total: issues.length, byState, byType, byPriority }
  }
}

export function createIssuePlugin() {
  const store = new IssueStore()
  
  return {
    name: 'issues',
    version: '1.0.0',
    store,
    commands: [
      {
        name: 'open',
        description: 'Open a new issue',
        async run(args: string[]) {
          const [title, type = 'task', priority = 'medium'] = args
          if (!title) throw new Error('Title required')
          return store.open({ title, description: '', type: type as IssueType, priority: priority as IssuePriority })
        }
      },
      {
        name: 'list',
        description: 'List issues',
        async run(args: string[]) {
          const [state] = args
          return store.list(state ? { state: state as IssueState } : undefined)
        }
      },
      {
        name: 'show',
        description: 'Show issue details',
        async run(args: string[]) {
          const [id] = args
          if (!id) throw new Error('Issue ID required')
          const issue = store.get(id)
          if (!issue) throw new Error(`Issue not found: ${id}`)
          return issue
        }
      },
      {
        name: 'close',
        description: 'Close an issue',
        async run(args: string[]) {
          const [id, reason] = args
          if (!id) throw new Error('Issue ID required')
          return store.close(id, reason)
        }
      }
    ]
  }
}
