import { describe, it, expect } from 'vitest'
import { IssueStore, createIssuePlugin } from './issues.js'
import type { IssueState, IssueType, IssuePriority } from './types.js'

describe('IssueStore', () => {
  describe('CRUD operations', () => {
    it('opens an issue', () => {
      const store = new IssueStore()
      const issue = store.open({
        title: 'Fix login bug',
        description: 'Users cannot login with SSO',
        type: 'bug',
        priority: 'high',
        labels: ['auth', 'urgent']
      })

      expect(issue.id).toMatch(/^issue-/)
      expect(issue.title).toBe('Fix login bug')
      expect(issue.state).toBe('open')
      expect(issue.type).toBe('bug')
      expect(issue.priority).toBe('high')
      expect(issue.labels).toEqual(['auth', 'urgent'])
      expect(issue.created_at).toBeGreaterThan(0)
      expect(issue.updated_at).toBe(issue.created_at)
    })

    it('gets an issue by id', () => {
      const store = new IssueStore()
      const created = store.open({
        title: 'Test issue',
        description: 'Test',
        type: 'task'
      })

      const found = store.get(created.id)
      expect(found).toBeDefined()
      expect(found?.title).toBe('Test issue')
    })

    it('returns undefined for non-existent issue', () => {
      const store = new IssueStore()
      expect(store.get('issue-nonexistent')).toBeUndefined()
    })

    it('updates an issue', () => {
      const store = new IssueStore()
      const issue = store.open({
        title: 'Original title',
        description: 'Original',
        type: 'task'
      })

      const updated = store.update(issue.id, {
        title: 'Updated title',
        description: 'Updated description',
        priority: 'high'
      })

      expect(updated.title).toBe('Updated title')
      expect(updated.description).toBe('Updated description')
      expect(updated.priority).toBe('high')
      expect(updated.updated_at).toBeGreaterThanOrEqual(issue.created_at)
    })

    it('closes an issue', () => {
      const store = new IssueStore()
      const issue = store.open({
        title: 'To close',
        description: 'Will be closed',
        type: 'task'
      })

      const closed = store.close(issue.id, 'Fixed in PR #123')

      expect(closed.state).toBe('closed')
      expect(closed.closed_at).toBeDefined()
      expect(closed.metadata.close_reason).toBe('Fixed in PR #123')
    })

    it('lists all issues', () => {
      const store = new IssueStore()
      store.open({ title: 'Issue 1', description: '', type: 'bug' })
      store.open({ title: 'Issue 2', description: '', type: 'feature' })
      store.open({ title: 'Issue 3', description: '', type: 'task' })

      const all = store.list()
      expect(all).toHaveLength(3)
    })

    it('filters issues by state', () => {
      const store = new IssueStore()
      const i1 = store.open({ title: 'Open issue', description: '', type: 'bug' })
      const i2 = store.open({ title: 'To progress', description: '', type: 'task' })
      store.update(i2.id, { state: 'in-progress' })

      const openIssues = store.list({ state: 'open' })
      expect(openIssues).toHaveLength(1)
      expect(openIssues[0].id).toBe(i1.id)
    })

    it('filters issues by type', () => {
      const store = new IssueStore()
      store.open({ title: 'Bug 1', description: '', type: 'bug' })
      store.open({ title: 'Feature 1', description: '', type: 'feature' })
      store.open({ title: 'Bug 2', description: '', type: 'bug' })

      const bugs = store.list({ type: 'bug' })
      expect(bugs).toHaveLength(2)
    })

    it('filters issues by priority', () => {
      const store = new IssueStore()
      store.open({ title: 'Low', description: '', type: 'task', priority: 'low' })
      store.open({ title: 'High', description: '', type: 'task', priority: 'high' })
      store.open({ title: 'Critical', description: '', type: 'task', priority: 'critical' })

      const urgent = store.list({ priority: ['high', 'critical'] })
      expect(urgent).toHaveLength(2)
    })

    it('filters issues by assignee', () => {
      const store = new IssueStore()
      store.open({ title: 'Assigned', description: '', type: 'task', assignee: 'agent-1' })
      store.open({ title: 'Unassigned', description: '', type: 'task' })

      const assigned = store.list({ assignee: 'agent-1' })
      expect(assigned).toHaveLength(1)
    })

    it('filters issues by labels', () => {
      const store = new IssueStore()
      store.open({ title: 'Auth', description: '', type: 'bug', labels: ['auth', 'urgent'] })
      store.open({ title: 'UI', description: '', type: 'bug', labels: ['ui'] })
      store.open({ title: 'Auth UI', description: '', type: 'bug', labels: ['auth', 'ui'] })

      const authIssues = store.list({ labels: ['auth'] })
      expect(authIssues).toHaveLength(2)
    })

    it('filters by parent_id', () => {
      const store = new IssueStore()
      const parent = store.open({ title: 'Epic', description: '', type: 'epic' })
      store.open({ title: 'Child 1', description: '', type: 'task', parent_id: parent.id })
      store.open({ title: 'Child 2', description: '', type: 'task', parent_id: parent.id })
      store.open({ title: 'Standalone', description: '', type: 'task' })

      const children = store.list({ parent_id: parent.id })
      expect(children).toHaveLength(2)
    })
  })

  describe('Lifecycle FSM', () => {
    it('validates state transitions', () => {
      const store = new IssueStore()
      const issue = store.open({
        title: 'Test',
        description: '',
        type: 'task'
      })

      expect(store.getTransitions('open')).toEqual(['in-progress', 'closed'])
      expect(store.getTransitions('in-progress')).toEqual(['review', 'open', 'closed'])
      expect(store.getTransitions('review')).toEqual(['done', 'in-progress', 'closed'])
      expect(store.getTransitions('done')).toEqual(['closed'])
      expect(store.getTransitions('closed')).toEqual(['open'])
    })

    it('allows valid transitions', () => {
      const store = new IssueStore()
      const issue = store.open({
        title: 'Test',
        description: '',
        type: 'task'
      })

      const inProgress = store.update(issue.id, { state: 'in-progress' })
      expect(inProgress.state).toBe('in-progress')

      const inReview = store.update(issue.id, { state: 'review' })
      expect(inReview.state).toBe('review')

      const done = store.update(issue.id, { state: 'done' })
      expect(done.state).toBe('done')

      const closed = store.update(issue.id, { state: 'closed' })
      expect(closed.state).toBe('closed')
    })

    it('rejects invalid transitions', () => {
      const store = new IssueStore()
      const issue = store.open({
        title: 'Test',
        description: '',
        type: 'task'
      })

      expect(() => {
        store.update(issue.id, { state: 'done' })
      }).toThrow('Invalid transition: open → done')
    })

    it('allows reopening closed issues', () => {
      const store = new IssueStore()
      const issue = store.open({
        title: 'Test',
        description: '',
        type: 'task'
      })

      const closed = store.close(issue.id)
      expect(closed.state).toBe('closed')

      const reopened = store.update(issue.id, { state: 'open' })
      expect(reopened.state).toBe('open')
    })
  })

  describe('Linking', () => {
    it('links issue to task', () => {
      const store = new IssueStore()
      const issue = store.open({
        title: 'Bug in task',
        description: '',
        type: 'bug'
      })

      const link = store.link(issue.id, 'task', 'task-123', 'related')

      expect(link.issue_id).toBe(issue.id)
      expect(link.target_type).toBe('task')
      expect(link.target_id).toBe('task-123')
      expect(link.relation).toBe('related')

      const updated = store.get(issue.id)
      expect(updated?.task_ids).toContain('task-123')
    })

    it('links issue to agent', () => {
      const store = new IssueStore()
      const issue = store.open({
        title: 'Agent issue',
        description: '',
        type: 'bug'
      })

      store.link(issue.id, 'agent', 'agent-456', 'blocks')

      const updated = store.get(issue.id)
      expect(updated?.agent_ids).toContain('agent-456')
    })

    it('links issue to another issue', () => {
      const store = new IssueStore()
      const parent = store.open({ title: 'Parent', description: '', type: 'epic' })
      const child = store.open({ title: 'Child', description: '', type: 'task' })

      const link = store.link(child.id, 'issue', parent.id, 'parent')

      expect(link.target_type).toBe('issue')
      expect(link.target_id).toBe(parent.id)
    })

    it('gets links for an issue', () => {
      const store = new IssueStore()
      const issue = store.open({ title: 'Test', description: '', type: 'bug' })

      store.link(issue.id, 'task', 'task-1', 'related')
      store.link(issue.id, 'agent', 'agent-1', 'blocks')

      const links = store.getLinks(issue.id)
      expect(links).toHaveLength(2)
    })

    it('unlinks issue from target', () => {
      const store = new IssueStore()
      const issue = store.open({ title: 'Test', description: '', type: 'bug' })

      store.link(issue.id, 'task', 'task-1', 'related')
      store.unlink(issue.id, 'task', 'task-1')

      const updated = store.get(issue.id)
      expect(updated?.task_ids).not.toContain('task-1')
      expect(store.getLinks(issue.id)).toHaveLength(0)
    })

    it('finds issues by task', () => {
      const store = new IssueStore()
      const i1 = store.open({ title: 'Issue 1', description: '', type: 'bug' })
      const i2 = store.open({ title: 'Issue 2', description: '', type: 'bug' })

      store.link(i1.id, 'task', 'task-123', 'related')
      store.link(i2.id, 'task', 'task-123', 'blocks')

      const issues = store.findByTask('task-123')
      expect(issues).toHaveLength(2)
    })

    it('finds issues by agent', () => {
      const store = new IssueStore()
      const i1 = store.open({ title: 'Issue 1', description: '', type: 'bug' })
      const i2 = store.open({ title: 'Issue 2', description: '', type: 'bug' })

      store.link(i1.id, 'agent', 'agent-456', 'blocks')
      store.link(i2.id, 'agent', 'agent-456', 'related')

      const issues = store.findByAgent('agent-456')
      expect(issues).toHaveLength(2)
    })
  })

  describe('Statistics', () => {
    it('computes stats', () => {
      const store = new IssueStore()
      
      store.open({ title: 'Bug 1', description: '', type: 'bug', priority: 'high' })
      store.open({ title: 'Bug 2', description: '', type: 'bug', priority: 'medium' })
      store.open({ title: 'Feature', description: '', type: 'feature', priority: 'low' })
      
      const i4 = store.open({ title: 'Task', description: '', type: 'task', priority: 'critical' })
      store.update(i4.id, { state: 'in-progress' })

      const stats = store.stats()

      expect(stats.total).toBe(4)
      expect(stats.byState.open).toBe(3)
      expect(stats.byState['in-progress']).toBe(1)
      expect(stats.byType.bug).toBe(2)
      expect(stats.byType.feature).toBe(1)
      expect(stats.byType.task).toBe(1)
      expect(stats.byPriority.high).toBe(1)
      expect(stats.byPriority.critical).toBe(1)
    })
  })
})

describe('Issue Plugin', () => {
  it('creates plugin with commands', () => {
    const plugin = createIssuePlugin()

    expect(plugin.name).toBe('issues')
    expect(plugin.version).toBe('1.0.0')
    expect(plugin.commands).toHaveLength(4)
    expect(plugin.commands.map(c => c.name)).toEqual(['open', 'list', 'show', 'close'])
  })
})
