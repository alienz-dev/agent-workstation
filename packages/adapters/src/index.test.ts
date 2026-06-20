import { describe, it, expect } from 'vitest'
import { KiroAdapter, AiderAdapter, ClaudeCodeAdapter, GenericAdapter, getAdapter } from './index.js'
import type { SpawnConfig } from '@agent-workstation/core'

describe('Adapters', () => {
  const config: SpawnConfig = {
    agent: 'test-agent',
    task: 'Test task'
  }

  describe('KiroAdapter', () => {
    it('creates adapter', () => {
      const adapter = new KiroAdapter()
      expect(adapter.name).toBe('kiro')
      expect(adapter.completionStrategy).toBe('file-watch')
    })

    it('builds command', () => {
      const adapter = new KiroAdapter()
      const cmd = adapter.buildCommand(config, '/tmp/briefing.md')
      
      expect(cmd[0]).toBe('kiro-cli')
      expect(cmd[1]).toBe('chat')
      expect(cmd).toContain('--message-file')
      expect(cmd).toContain('/tmp/briefing.md')
    })

    it('gets env', () => {
      const adapter = new KiroAdapter()
      const env = adapter.getEnv(config)
      
      expect(env.AW_AGENT_ID).toBe('test-agent')
      expect(env.AW_TASK).toBe('Test task')
    })
  })

  describe('AiderAdapter', () => {
    it('creates adapter', () => {
      const adapter = new AiderAdapter()
      expect(adapter.name).toBe('aider')
      expect(adapter.completionStrategy).toBe('process-exit')
    })

    it('builds command', () => {
      const adapter = new AiderAdapter()
      const cmd = adapter.buildCommand(config, '/tmp/briefing.md')
      
      expect(cmd[0]).toBe('aider')
      expect(cmd).toContain('--message-file')
    })

    it('includes owned files', () => {
      const adapter = new AiderAdapter()
      const cmd = adapter.buildCommand({
        ...config,
        owned_files: ['src/index.ts', 'src/test.ts']
      }, '/tmp/briefing.md')
      
      expect(cmd).toContain('src/index.ts')
      expect(cmd).toContain('src/test.ts')
    })

    it('gets env', () => {
      const adapter = new AiderAdapter()
      const env = adapter.getEnv(config)
      
      expect(env.AIDER_NO_AUTO_COMMITS).toBe('1')
    })
  })

  describe('ClaudeCodeAdapter', () => {
    it('creates adapter', () => {
      const adapter = new ClaudeCodeAdapter()
      expect(adapter.name).toBe('claude-code')
      expect(adapter.completionStrategy).toBe('process-exit')
    })

    it('builds command', () => {
      const adapter = new ClaudeCodeAdapter()
      const cmd = adapter.buildCommand(config, '/tmp/briefing.md')
      
      expect(cmd[0]).toBe('claude')
      expect(cmd).toContain('--print')
      expect(cmd).toContain('--message-file')
    })

    it('gets env', () => {
      const adapter = new ClaudeCodeAdapter()
      const env = adapter.getEnv(config)
      
      expect(env.ANTHROPIC_DISABLE_PROMPT_CACHING).toBe('1')
    })
  })

  describe('GenericAdapter', () => {
    it('creates adapter with config', () => {
      const adapter = new GenericAdapter({
        command: 'my-agent',
        args: ['--task'],
        env: { CUSTOM: 'value' }
      })
      
      expect(adapter.name).toBe('generic')
      expect(adapter.completionStrategy).toBe('both')
    })

    it('builds command', () => {
      const adapter = new GenericAdapter({
        command: 'my-agent',
        args: ['--task'],
        env: {}
      })
      
      const cmd = adapter.buildCommand(config, '/tmp/briefing.md')
      
      expect(cmd[0]).toBe('my-agent')
      expect(cmd[1]).toBe('--task')
    })

    it('gets env with AW variables', () => {
      const adapter = new GenericAdapter({
        command: 'my-agent',
        args: [],
        env: { CUSTOM: 'value' }
      })
      
      const env = adapter.getEnv(config)
      
      expect(env.CUSTOM).toBe('value')
      expect(env.AW_AGENT_ID).toBe('test-agent')
      expect(env.AW_TASK).toBe('Test task')
      expect(env.AW_BRIEFING_PATH).toBeDefined()
      expect(env.AW_RESULT_PATH).toBeDefined()
    })
  })

  describe('getAdapter', () => {
    it('returns kiro adapter', () => {
      const adapter = getAdapter('kiro')
      expect(adapter.name).toBe('kiro')
    })

    it('returns aider adapter', () => {
      const adapter = getAdapter('aider')
      expect(adapter.name).toBe('aider')
    })

    it('returns claude-code adapter', () => {
      const adapter = getAdapter('claude-code')
      expect(adapter.name).toBe('claude-code')
    })

    it('returns claude adapter as claude-code', () => {
      const adapter = getAdapter('claude')
      expect(adapter.name).toBe('claude-code')
    })

    it('returns generic adapter with config', () => {
      const adapter = getAdapter('generic', {
        command: 'test',
        args: [],
        env: {}
      })
      expect(adapter.name).toBe('generic')
    })

    it('throws for unknown adapter', () => {
      expect(() => getAdapter('unknown')).toThrow('Unknown adapter: unknown')
    })

    it('throws for generic without config', () => {
      expect(() => getAdapter('generic')).toThrow('Generic adapter requires config')
    })
  })
})
