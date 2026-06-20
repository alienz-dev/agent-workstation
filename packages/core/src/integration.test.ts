import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, execSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DaemonClient, IssueStore, KnowledgeStore, parsePlan, validateNoCycles } from './index.js'

const PROJECT_ROOT = join(import.meta.dirname, '..', '..', '..')

describe('Integration: Core Functionality', () => {
  describe('Issue Management', () => {
    const store = new IssueStore()

    it('manages full issue lifecycle', () => {
      const issue = store.open({
        title: 'Test issue',
        description: 'Testing lifecycle',
        type: 'bug',
        priority: 'high'
      })
      expect(issue.state).toBe('open')
      
      const inProgress = store.update(issue.id, { state: 'in-progress' })
      expect(inProgress.state).toBe('in-progress')
      
      const inReview = store.update(issue.id, { state: 'review' })
      expect(inReview.state).toBe('review')
      
      const done = store.update(issue.id, { state: 'done' })
      expect(done.state).toBe('done')
      
      const closed = store.close(issue.id, 'Completed')
      expect(closed.state).toBe('closed')
    })

    it('prevents invalid transitions', () => {
      const issue = store.open({ title: 'Test', description: '', type: 'task' })
      expect(() => store.update(issue.id, { state: 'done' })).toThrow()
    })

    it('links issues to tasks and agents', () => {
      const issue = store.open({ title: 'Linked issue', description: '', type: 'bug' })
      
      store.link(issue.id, 'task', 'task-123', 'related')
      store.link(issue.id, 'agent', 'agent-456', 'blocks')
      
      const updated = store.get(issue.id)
      expect(updated?.task_ids).toContain('task-123')
      expect(updated?.agent_ids).toContain('agent-456')
    })
  })

  describe('Knowledge Search', () => {
    const store = new KnowledgeStore()

    beforeAll(() => {
      store.addSession({
        id: 's1',
        agent_id: 'a1',
        task: 'Implement authentication',
        result_status: 'PASS',
        summary: 'Added JWT auth',
        changes: [],
        started_at: 1000,
        finished_at: 2000,
        metadata: {}
      })
    })

    it('searches sessions', () => {
      const results = store.searchSessions('authentication')
      expect(results.length).toBeGreaterThan(0)
    })

    it('assembles context', () => {
      const pkg = store.assembleContext('auth', { query: 'auth', limit: 5 })
      expect(pkg.results.length).toBeGreaterThan(0)
      expect(pkg.total_tokens).toBeGreaterThan(0)
    })
  })

  describe('Plan Parsing', () => {
    it('parses valid plan', () => {
      const content = `# Plan: Test

### Task: First
- **Role:** coder
- **Deps:** []

### Task: Second
- **Role:** coder
- **Deps:** [first]
`
      const plan = parsePlan(content, 'test.md')
      expect(plan.tasks.length).toBe(2)
      expect(() => validateNoCycles(plan.tasks)).not.toThrow()
    })

    it('detects cycles', () => {
      const content = `### Task: A
- **Role:** coder
- **Deps:** [b]

### Task: B
- **Role:** coder
- **Deps:** [a]
`
      // parsePlan calls validateNoCycles internally and throws on cycles
      expect(() => parsePlan(content, 'cycle.md')).toThrow('Cycle detected')
    })
  })
})

describe('Integration: Daemon Communication', () => {
  let testDir: string
  let daemonProcess: ReturnType<typeof spawn> | null = null
  let sessionName: string
  let daemonPort: number = 0
  let daemonToken: string = ''

  beforeAll(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'aw-daemon-test-'))
    sessionName = `daemon-${Date.now()}`
    
    const daemonPath = join(PROJECT_ROOT, 'packages/daemon/.venv/bin/aw-daemon')
    daemonProcess = spawn(daemonPath, ['start', '--session', sessionName, '--port', '0'], {
      cwd: testDir,
      stdio: 'pipe'
    })
    
    const portFile = `/tmp/aw-daemon-${sessionName}.json`
    for (let i = 0; i < 30 && !existsSync(portFile); i++) {
      await new Promise(r => setTimeout(r, 500))
    }
    
    if (existsSync(portFile)) {
      const info = JSON.parse(readFileSync(portFile, 'utf-8'))
      daemonPort = info.port
      daemonToken = info.token
    }
  }, 30000)

  afterAll(async () => {
    if (daemonProcess) {
      daemonProcess.kill()
      await new Promise(r => setTimeout(r, 1000))
    }
    rmSync(testDir, { recursive: true, force: true })
    
    const portFile = `/tmp/aw-daemon-${sessionName}.json`
    const dbFile = `/tmp/aw-daemon-${sessionName}.db`
    if (existsSync(portFile)) rmSync(portFile)
    if (existsSync(dbFile)) rmSync(dbFile)
  })

  it('daemon starts and responds to health', async () => {
    expect(daemonPort).toBeGreaterThan(0)
    
    const client = DaemonClient.connect(sessionName)
    const health = await client.health()
    
    expect(health.status).toBe('healthy')
  })

  it('spawns and lists agents', async () => {
    const client = DaemonClient.connect(sessionName)
    
    const result = await client.spawn({
      agent: 'coder',
      task: 'Test task',
      adapter: 'kiro'
    })
    
    expect(result.id).toMatch(/^agent-/)
    
    const agents = await client.listAgents()
    expect(agents.length).toBeGreaterThan(0)
  })

  it('manages pipeline', async () => {
    const client = DaemonClient.connect(sessionName)
    
    const initial = await client.getPipelineStage()
    await client.advancePipeline('test')
    const updated = await client.getPipelineStage()
    
    expect(updated).toBe('test')
  })

  it('handles messages', async () => {
    const client = DaemonClient.connect(sessionName)
    
    const agent = await client.spawn({ agent: 'coder', task: 'Msg test' })
    const msg = await client.sendMessage('Hello', { to_agent: agent.id })
    
    expect(msg.id).toMatch(/^msg-/)
    
    const messages = await client.getMessages({ to_agent: agent.id })
    expect(messages.length).toBeGreaterThan(0)
  })

  it('manages file claims', async () => {
    const client = DaemonClient.connect(sessionName)
    
    const agent = await client.spawn({ agent: 'coder', task: 'Claim test' })
    await client.claimFile('/src/test.ts', agent.id)
    
    const claims = await client.listClaims()
    expect(claims.length).toBeGreaterThan(0)
  })
})

describe('Integration: CLI Commands', () => {
  let testDir: string
  const cliPath = join(PROJECT_ROOT, 'packages/cli/dist/index.js')

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'aw-cli-test-'))
  })

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('initializes project', () => {
    const output = execSync(`node ${cliPath} init -p ${testDir}`, { encoding: 'utf-8' })
    expect(output).toContain('Created .agents directory')
    expect(existsSync(join(testDir, '.agents'))).toBe(true)
  })

  it('runs doctor', () => {
    // Doctor may exit with code 1 if some checks fail, which is expected
    try {
      const output = execSync(`node ${cliPath} doctor`, { encoding: 'utf-8', cwd: testDir })
      expect(output).toContain('Node.js')
      expect(output).toContain('.agents directory')
    } catch (error: unknown) {
      const err = error as { stdout?: string }
      if (err.stdout) {
        expect(err.stdout).toContain('Node.js')
        expect(err.stdout).toContain('.agents directory')
      } else {
        throw error
      }
    }
  })

  it('manages issues', () => {
    const openOutput = execSync(
      `node ${cliPath} issue open -t "CLI test" -T bug -p high`,
      { encoding: 'utf-8', cwd: testDir }
    )
    expect(openOutput).toContain('Issue opened:')
    
    const listOutput = execSync(`node ${cliPath} issue list`, { encoding: 'utf-8', cwd: testDir })
    expect(listOutput).toContain('Issues:')
  })
})

describe('Integration: Adapters', () => {
  it('imports adapters package', async () => {
    const adaptersPath = join(PROJECT_ROOT, 'packages/adapters/dist/index.js')
    const { getAdapter, KiroAdapter, AiderAdapter, ClaudeCodeAdapter } = await import(adaptersPath)
    
    const kiro = getAdapter('kiro')
    expect(kiro.name).toBe('kiro')
    
    const aider = getAdapter('aider')
    expect(aider.name).toBe('aider')
    
    const claude = getAdapter('claude-code')
    expect(claude.name).toBe('claude-code')
  })

  it('builds commands correctly', async () => {
    const adaptersPath = join(PROJECT_ROOT, 'packages/adapters/dist/index.js')
    const { KiroAdapter } = await import(adaptersPath)
    
    const adapter = new KiroAdapter()
    const cmd = adapter.buildCommand(
      { agent: 'test', task: 'Test' },
      '/tmp/briefing.md'
    )
    
    expect(cmd[0]).toBe('kiro-cli')
    expect(cmd).toContain('chat')
  })

  it('sets environment variables', async () => {
    const adaptersPath = join(PROJECT_ROOT, 'packages/adapters/dist/index.js')
    const { AiderAdapter } = await import(adaptersPath)
    
    const adapter = new AiderAdapter()
    const env = adapter.getEnv({ agent: 'test', task: 'Test' })
    
    expect(env.AIDER_NO_AUTO_COMMITS).toBe('1')
  })
})
