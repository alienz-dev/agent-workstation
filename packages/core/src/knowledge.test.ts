import { describe, it, expect } from 'vitest'
import { KnowledgeStore, formatContextPackage } from './knowledge.js'
import type { Issue } from './types.js'
import type { Heuristic } from './heuristics.js'

describe('KnowledgeStore', () => {
  describe('Session management', () => {
    it('adds a session record', () => {
      const store = new KnowledgeStore()
      store.addSession({
        id: 'session-1',
        agent_id: 'agent-1',
        task: 'Fix login bug',
        result_status: 'PASS',
        summary: 'Fixed the SSO login issue by updating the token validation',
        changes: [{ file: 'src/auth.ts', description: 'Updated token check' }],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })

      const session = store.getSession('session-1')
      expect(session).toBeDefined()
      expect(session?.task).toBe('Fix login bug')
    })

    it('lists sessions', () => {
      const store = new KnowledgeStore()
      store.addSession({
        id: 's1',
        agent_id: 'agent-1',
        task: 'Task 1',
        result_status: 'PASS',
        summary: 'Summary 1',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })
      store.addSession({
        id: 's2',
        agent_id: 'agent-2',
        task: 'Task 2',
        result_status: 'FAIL',
        summary: 'Summary 2',
        changes: [],
        started_at: 1000,
        finished_at: 3000,
        metadata: {}
      })

      const all = store.listSessions()
      expect(all).toHaveLength(2)
      expect(all[0].id).toBe('s2')
    })

    it('filters sessions by agent', () => {
      const store = new KnowledgeStore()
      store.addSession({
        id: 's1',
        agent_id: 'agent-1',
        task: 'Task 1',
        result_status: 'PASS',
        summary: 'Summary',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })
      store.addSession({
        id: 's2',
        agent_id: 'agent-2',
        task: 'Task 2',
        result_status: 'PASS',
        summary: 'Summary',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })

      const filtered = store.listSessions({ agent_id: 'agent-1' })
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('s1')
    })

    it('filters sessions by status', () => {
      const store = new KnowledgeStore()
      store.addSession({
        id: 's1',
        agent_id: 'agent-1',
        task: 'Task 1',
        result_status: 'PASS',
        summary: 'Summary',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })
      store.addSession({
        id: 's2',
        agent_id: 'agent-1',
        task: 'Task 2',
        result_status: 'FAIL',
        summary: 'Summary',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })

      const passed = store.listSessions({ result_status: 'PASS' })
      expect(passed).toHaveLength(1)
    })
  })

  describe('Search', () => {
    it('searches issues', () => {
      const store = new KnowledgeStore()
      const issues: Issue[] = [
        {
          id: 'issue-1',
          title: 'Login button not working',
          description: 'The login button does not respond to clicks on mobile',
          type: 'bug',
          state: 'open',
          priority: 'high',
          labels: [],
          task_ids: [],
          agent_ids: [],
          created_at: 1000,
          updated_at: 1000,
          metadata: {}
        },
        {
          id: 'issue-2',
          title: 'Add dark mode',
          description: 'Implement dark mode theme for the UI',
          type: 'feature',
          state: 'open',
          priority: 'medium',
          labels: [],
          task_ids: [],
          agent_ids: [],
          created_at: 1000,
          updated_at: 1000,
          metadata: {}
        }
      ]

      const results = store.searchIssues(issues, 'login')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].source).toBe('issue')
      expect(results[0].id).toBe('issue-1')
    })

    it('searches heuristics', () => {
      const store = new KnowledgeStore()
      const heuristics: Heuristic[] = [
        {
          id: 'h1',
          title: 'Login heuristic',
          type: 'failure',
          triggerCondition: 'When login fails with 401',
          action: 'Check token expiration and refresh',
          rationale: 'Common auth issue',
          scope: 'auth',
          confidence: 'high',
          timesRetrieved: 5,
          timesRelevant: 4,
          createdAt: 1000,
          archived: false
        },
        {
          id: 'h2',
          title: 'UI heuristic',
          type: 'failure',
          triggerCondition: 'When UI is slow',
          action: 'Check for unnecessary re-renders',
          rationale: 'Performance issue',
          scope: 'ui',
          confidence: 'medium',
          timesRetrieved: 3,
          timesRelevant: 2,
          createdAt: 1000,
          archived: false
        }
      ]

      const results = store.searchHeuristics(heuristics, 'login fails')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].source).toBe('heuristic')
      expect(results[0].id).toBe('h1')
    })

    it('searches sessions', () => {
      const store = new KnowledgeStore()
      store.addSession({
        id: 's1',
        agent_id: 'agent-1',
        task: 'Fix authentication bug',
        result_status: 'PASS',
        summary: 'Updated the auth middleware to handle expired tokens',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })
      store.addSession({
        id: 's2',
        agent_id: 'agent-2',
        task: 'Update documentation',
        result_status: 'PASS',
        summary: 'Added API docs for new endpoints',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })

      const results = store.searchSessions('authentication token')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].source).toBe('session')
      expect(results[0].id).toBe('s1')
    })

    it('performs unified search', () => {
      const store = new KnowledgeStore()
      store.addSession({
        id: 's1',
        agent_id: 'agent-1',
        task: 'Fix login bug',
        result_status: 'PASS',
        summary: 'Fixed login by updating token validation',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })

      const issues: Issue[] = [{
        id: 'issue-1',
        title: 'Login broken',
        description: 'Login fails with 401 error',
        type: 'bug',
        state: 'open',
        priority: 'high',
        labels: [],
        task_ids: [],
        agent_ids: [],
        created_at: 1000,
        updated_at: 1000,
        metadata: {}
      }]

      const results = store.unifiedSearch('login', { query: 'login', limit: 10 }, issues)
      expect(results.length).toBeGreaterThan(0)
      
      const sources = new Set(results.map(r => r.source))
      expect(sources.has('issue') || sources.has('session')).toBe(true)
    })

    it('respects source filter', () => {
      const store = new KnowledgeStore()
      store.addSession({
        id: 's1',
        agent_id: 'agent-1',
        task: 'Login task',
        result_status: 'PASS',
        summary: 'Fixed login',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })

      const issues: Issue[] = [{
        id: 'issue-1',
        title: 'Login issue',
        description: 'Login problem',
        type: 'bug',
        state: 'open',
        priority: 'high',
        labels: [],
        task_ids: [],
        agent_ids: [],
        created_at: 1000,
        updated_at: 1000,
        metadata: {}
      }]

      const results = store.unifiedSearch('login', { query: 'login', sources: ['issue'] }, issues)
      expect(results.every(r => r.source === 'issue')).toBe(true)
    })

    it('respects limit', () => {
      const store = new KnowledgeStore()
      
      for (let i = 0; i < 20; i++) {
        store.addSession({
          id: `s${i}`,
          agent_id: 'agent-1',
          task: `Task ${i} about login authentication`,
          result_status: 'PASS',
          summary: 'Summary',
          changes: [],
          started_at: 1000,
          finished_at: 2000 + i,
          metadata: {}
        })
      }

      const results = store.searchSessions('login', 5)
      expect(results.length).toBeLessThanOrEqual(5)
    })
  })

  describe('Context assembly', () => {
    it('assembles context package', () => {
      const store = new KnowledgeStore()
      store.addSession({
        id: 's1',
        agent_id: 'agent-1',
        task: 'Fix login',
        result_status: 'PASS',
        summary: 'Updated auth logic',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })

      const pkg = store.assembleContext('login', { query: 'login', limit: 5 })

      expect(pkg.query).toBe('login')
      expect(pkg.results.length).toBeGreaterThan(0)
      expect(pkg.assembled_at).toBeGreaterThan(0)
      expect(pkg.total_tokens).toBeGreaterThan(0)
      expect(pkg.sources_used).toContain('session')
    })

    it('formats context package', () => {
      const store = new KnowledgeStore()
      store.addSession({
        id: 's1',
        agent_id: 'agent-1',
        task: 'Fix login',
        result_status: 'PASS',
        summary: 'Updated auth',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })

      const pkg = store.assembleContext('login', { query: 'login', limit: 5 })
      const formatted = formatContextPackage(pkg)

      expect(formatted).toContain('# Context Package')
      expect(formatted).toContain('Query: login')
      expect(formatted).toContain('Total tokens:')
    })
  })

  describe('Statistics', () => {
    it('computes stats', () => {
      const store = new KnowledgeStore()
      store.addSession({
        id: 's1',
        agent_id: 'agent-1',
        task: 'Task 1',
        result_status: 'PASS',
        summary: 'Summary 1',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })
      store.addSession({
        id: 's2',
        agent_id: 'agent-1',
        task: 'Task 2',
        result_status: 'FAIL',
        summary: 'Summary 2',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })

      const stats = store.stats()

      expect(stats.total_sessions).toBe(2)
      expect(stats.by_status.PASS).toBe(1)
      expect(stats.by_status.FAIL).toBe(1)
    })
  })
})
