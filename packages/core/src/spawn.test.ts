import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnAgentProcess, isAgentRunning, killAgent } from './spawn.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('Spawn', () => {
  let testDir: string

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'aw-spawn-test-'))
  })

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('spawnAgentProcess', () => {
    it('creates agent process with kiro adapter', () => {
      const agent = spawnAgentProcess({
        config: {
          agent: 'test-agent',
          task: 'Test task'
        },
        briefingContext: {
          task: 'Test task',
          role: 'coder',
          projectRoot: testDir
        },
        adapter: 'kiro'
      })
      
      expect(agent.id).toMatch(/^agent-/)
      expect(agent.adapter).toBe('kiro')
      expect(agent.briefingPath).toBeDefined()
      expect(agent.resultPath).toBeDefined()
      expect(agent.startedAt).toBeGreaterThan(0)
      
      killAgent(agent)
    })

    it('creates agent process with aider adapter', () => {
      const agent = spawnAgentProcess({
        config: {
          agent: 'test-agent',
          task: 'Test task',
          owned_files: ['src/index.ts']
        },
        briefingContext: {
          task: 'Test task',
          role: 'coder',
          projectRoot: testDir,
          ownedFiles: ['src/index.ts']
        },
        adapter: 'aider'
      })
      
      expect(agent.adapter).toBe('aider')
      killAgent(agent)
    })

    it('creates agent process with claude-code adapter', () => {
      const agent = spawnAgentProcess({
        config: {
          agent: 'test-agent',
          task: 'Test task'
        },
        briefingContext: {
          task: 'Test task',
          role: 'coder',
          projectRoot: testDir
        },
        adapter: 'claude-code'
      })
      
      expect(agent.adapter).toBe('claude-code')
      killAgent(agent)
    })

    it('sets environment variables', () => {
      const agent = spawnAgentProcess({
        config: {
          agent: 'test-agent',
          task: 'Test task',
          env: { CUSTOM_VAR: 'custom-value' }
        },
        briefingContext: {
          task: 'Test task',
          role: 'coder',
          projectRoot: testDir
        },
        adapter: 'kiro'
      })
      
      expect(agent.process).toBeDefined()
      killAgent(agent)
    })
  })

  describe('isAgentRunning', () => {
    it('returns true for running process', () => {
      const agent = spawnAgentProcess({
        config: { agent: 'test', task: 'test' },
        briefingContext: {
          task: 'test',
          role: 'coder',
          projectRoot: testDir
        },
        adapter: 'kiro'
      })
      
      const running = isAgentRunning(agent)
      expect(typeof running).toBe('boolean')
      
      killAgent(agent)
    })
  })

  describe('killAgent', () => {
    it('kills process gracefully', () => {
      const agent = spawnAgentProcess({
        config: { agent: 'test', task: 'test' },
        briefingContext: {
          task: 'test',
          role: 'coder',
          projectRoot: testDir
        },
        adapter: 'kiro'
      })
      
      killAgent(agent, 'SIGTERM')
    })

    it('kills process forcefully', () => {
      const agent = spawnAgentProcess({
        config: { agent: 'test', task: 'test' },
        briefingContext: {
          task: 'test',
          role: 'coder',
          projectRoot: testDir
        },
        adapter: 'kiro'
      })
      
      killAgent(agent, 'SIGKILL')
    })
  })
})
