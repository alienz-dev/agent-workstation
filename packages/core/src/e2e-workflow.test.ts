import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync, spawn } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const PROJECT_ROOT = join(import.meta.dirname, '..', '..', '..')

/**
 * E2E Test: Full Agent Workstation Workflow
 * 
 * This test simulates a complete user workflow:
 * 1. Initialize a new project
 * 2. Start the daemon
 * 3. Create a plan
 * 4. Spawn agents
 * 5. Execute tasks
 * 6. Review results
 * 7. Shutdown
 */

describe('E2E: Full Workflow', () => {
  let projectDir: string
  let daemonProcess: ReturnType<typeof spawn> | null = null
  let sessionName: string
  let daemonPort: number = 0
  let daemonToken: string = ''
  const cliPath = join(PROJECT_ROOT, 'packages/cli/dist/index.js')
  const daemonPath = join(PROJECT_ROOT, 'packages/daemon/.venv/bin/aw-daemon')

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), 'aw-e2e-'))
    sessionName = `e2e-${Date.now()}`
  })

  afterAll(async () => {
    if (daemonProcess) {
      daemonProcess.kill()
      await new Promise(r => setTimeout(r, 1000))
    }
    rmSync(projectDir, { recursive: true, force: true })
    
    const portFile = `/tmp/aw-daemon-${sessionName}.json`
    const dbFile = `/tmp/aw-daemon-${sessionName}.db`
    if (existsSync(portFile)) rmSync(portFile)
    if (existsSync(dbFile)) rmSync(dbFile)
  })

  describe('Step 1: Project Initialization', () => {
    it('initializes project with aw init', () => {
      const output = execSync(`node ${cliPath} init -p ${projectDir}`, {
        encoding: 'utf-8'
      })
      
      expect(output).toContain('Created .agents directory')
      expect(output).toContain('Created constitution.yml')
      expect(existsSync(join(projectDir, '.agents'))).toBe(true)
    })

    it('verifies setup with aw doctor', () => {
      // Doctor may exit with code 1 if some checks fail
      try {
        const output = execSync(`node ${cliPath} doctor`, {
          encoding: 'utf-8',
          cwd: projectDir
        })
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
  })

  describe('Step 2: Daemon Management', () => {
    it('starts daemon', async () => {
      daemonProcess = spawn(daemonPath, [
        'start',
        '--session', sessionName,
        '--port', '0'
      ], {
        cwd: projectDir,
        stdio: 'pipe'
      })
      
      // Wait for port file
      const portFile = `/tmp/aw-daemon-${sessionName}.json`
      let attempts = 0
      while (!existsSync(portFile) && attempts < 30) {
        await new Promise(r => setTimeout(r, 500))
        attempts++
      }
      
      expect(existsSync(portFile)).toBe(true)
      
      const portInfo = JSON.parse(readFileSync(portFile, 'utf-8'))
      daemonPort = portInfo.port
      daemonToken = portInfo.token
      expect(daemonPort).toBeGreaterThan(0)
    }, 30000)

    it('checks daemon health', async () => {
      const health = await fetch(`http://127.0.0.1:${daemonPort}/v1/health`)
      const data = await health.json()
      
      expect(data.status).toBe('healthy')
      expect(data.session).toBe(sessionName)
    })
  })

  describe('Step 3: Plan Management', () => {
    it('creates a plan file', () => {
      const planContent = `# Plan: E2E Test Plan

## Wave 1: Setup

### Task: Initialize project
- **Role:** planner
- **Deps:** []
- **Description:** Set up project structure

### Task: Write tests
- **Role:** coder
- **Deps:** [initialize-project]
- **Description:** Write unit tests

## Wave 2: Implementation

### Task: Implement feature
- **Role:** coder
- **Deps:** [write-tests]
- **Description:** Implement the main feature

### Task: Review code
- **Role:** reviewer
- **Deps:** [implement-feature]
- **Description:** Review implementation
`
      
      writeFileSync(join(projectDir, '.agents/plans/e2e-plan.md'), planContent)
      expect(existsSync(join(projectDir, '.agents/plans/e2e-plan.md'))).toBe(true)
    })

    it('loads and validates plan', () => {
      const output = execSync(
        `node ${cliPath} plan load -f .agents/plans/e2e-plan.md`,
        { encoding: 'utf-8', cwd: projectDir }
      )
      
      expect(output).toContain('Plan:')
      expect(output).toContain('Tasks: 4')
      expect(output).toContain('No cycles detected')
    })

    it('shows plan status', () => {
      const output = execSync(
        `node ${cliPath} plan status -f .agents/plans/e2e-plan.md`,
        { encoding: 'utf-8', cwd: projectDir }
      )
      
      expect(output).toContain('Ready:')
      expect(output).toContain('initialize-project')
    })
  })

  describe('Step 4: Agent Spawning', () => {
    it('spawns planner agent', async () => {
      const response = await fetch(`http://127.0.0.1:${daemonPort}/v1/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${daemonToken}`
        },
        body: JSON.stringify({
          role: 'planner',
          task: 'Initialize project structure'
        })
      })
      
      const data = await response.json()
      expect(data.id).toMatch(/^agent-/)
      expect(data.status).toBeDefined()
    })

    it('spawns coder agent', async () => {
      const response = await fetch(`http://127.0.0.1:${daemonPort}/v1/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${daemonToken}`
        },
        body: JSON.stringify({
          role: 'coder',
          task: 'Write unit tests',
          adapter: 'kiro'
        })
      })
      
      const data = await response.json()
      expect(data.id).toMatch(/^agent-/)
    })

    it('lists all agents', async () => {
      const response = await fetch(`http://127.0.0.1:${daemonPort}/v1/agents`, {
        headers: { 'Authorization': `Bearer ${daemonToken}` }
      })
      
      const data = await response.json()
      expect(data.agents.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Step 5: Issue Management', () => {
    it('opens an issue', () => {
      const output = execSync(
        `node ${cliPath} issue open -t "E2E test issue" -T bug -p high`,
        { encoding: 'utf-8', cwd: projectDir }
      )
      
      expect(output).toContain('Issue opened:')
      expect(output).toContain('Type: bug')
      expect(output).toContain('Priority: high')
    })

    it('lists issues', () => {
      const output = execSync(
        `node ${cliPath} issue list`,
        { encoding: 'utf-8', cwd: projectDir }
      )
      
      expect(output).toContain('Issues:')
    })
  })

  describe('Step 6: Pipeline Management', () => {
    it('gets current pipeline stage', async () => {
      const response = await fetch(`http://127.0.0.1:${daemonPort}/v1/pipeline`, {
        headers: { 'Authorization': `Bearer ${daemonToken}` }
      })
      
      const data = await response.json()
      expect(data.stage).toBeDefined()
    })

    it('advances pipeline', async () => {
      // Advance to test
      await fetch(`http://127.0.0.1:${daemonPort}/v1/pipeline/advance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${daemonToken}`
        },
        body: JSON.stringify({ stage: 'test' })
      })
      
      const response = await fetch(`http://127.0.0.1:${daemonPort}/v1/pipeline`, {
        headers: { 'Authorization': `Bearer ${daemonToken}` }
      })
      
      const data = await response.json()
      expect(data.stage).toBe('test')
    })
  })

  describe('Step 7: Message Passing', () => {
    let agentId: string

    beforeAll(async () => {
      const response = await fetch(`http://127.0.0.1:${daemonPort}/v1/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${daemonToken}`
        },
        body: JSON.stringify({
          role: 'coder',
          task: 'Message test'
        })
      })
      
      const data = await response.json()
      agentId = data.id
    })

    it('sends message to agent', async () => {
      const response = await fetch(`http://127.0.0.1:${daemonPort}/v1/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${daemonToken}`
        },
        body: JSON.stringify({
          content: 'Please implement the feature',
          to_agent: agentId
        })
      })
      
      const data = await response.json()
      expect(data.id).toMatch(/^msg-/)
      expect(data.status).toBe('queued')
    })

    it('retrieves messages', async () => {
      const response = await fetch(
        `http://127.0.0.1:${daemonPort}/v1/messages?to_agent=${agentId}`,
        { headers: { 'Authorization': `Bearer ${daemonToken}` } }
      )
      
      const data = await response.json()
      expect(data.messages.length).toBeGreaterThan(0)
    })
  })

  describe('Step 8: File Claims', () => {
    let agentId: string

    beforeAll(async () => {
      const response = await fetch(`http://127.0.0.1:${daemonPort}/v1/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${daemonToken}`
        },
        body: JSON.stringify({
          role: 'coder',
          task: 'File claim test'
        })
      })
      
      const data = await response.json()
      agentId = data.id
    })

    it('claims a file', async () => {
      const response = await fetch(`http://127.0.0.1:${daemonPort}/v1/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${daemonToken}`
        },
        body: JSON.stringify({
          path: '/src/feature.ts',
          agent_id: agentId
        })
      })
      
      const data = await response.json()
      expect(data.status).toBe('claimed')
    })

    it('lists claims', async () => {
      const response = await fetch(`http://127.0.0.1:${daemonPort}/v1/claims`, {
        headers: { 'Authorization': `Bearer ${daemonToken}` }
      })
      
      const data = await response.json()
      expect(data.claims.length).toBeGreaterThan(0)
    })
  })

  describe('Step 9: Knowledge Search', () => {
    it('searches knowledge base', () => {
      const output = execSync(
        `node ${cliPath} knowledge search -q "authentication"`,
        { encoding: 'utf-8', cwd: projectDir }
      )
      
      expect(output).toContain('Context Package')
    })
  })

  describe('Step 10: Cleanup', () => {
    it('stops daemon gracefully', async () => {
      if (daemonProcess) {
        daemonProcess.kill('SIGTERM')
        
        // Wait for process to exit
        await new Promise<void>(resolve => {
          daemonProcess!.on('exit', () => resolve())
          setTimeout(() => resolve(), 5000)
        })
        
        daemonProcess = null
      }
      
      // Verify daemon is stopped
      await expect(
        fetch(`http://127.0.0.1:${daemonPort}/v1/health`)
      ).rejects.toThrow()
    })
  })
})

describe('E2E: Error Scenarios', () => {
  it('handles missing project directory', () => {
    const cliPath = join(process.cwd(), 'packages/cli/dist/index.js')
    
    expect(() => {
      execSync(`node ${cliPath} status`, {
        encoding: 'utf-8',
        cwd: '/non/existent/path'
      })
    }).toThrow()
  })

  it('handles invalid plan file', () => {
    const testDir = mkdtempSync(join(tmpdir(), 'aw-error-test-'))
    const cliPath = join(process.cwd(), 'packages/cli/dist/index.js')
    
    try {
      writeFileSync(join(testDir, 'invalid-plan.md'), 'Not a valid plan')
      
      expect(() => {
        execSync(`node ${cliPath} plan load -f invalid-plan.md`, {
          encoding: 'utf-8',
          cwd: testDir
        })
      }).toThrow()
    } finally {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('handles daemon connection failure', async () => {
    const { DaemonClient } = await import('./index.js')
    
    // connect() throws immediately if port file doesn't exist
    expect(() => DaemonClient.connect('non-existent-session-xyz')).toThrow()
  })
})
