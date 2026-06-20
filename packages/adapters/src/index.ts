import { spawn, type ChildProcess } from 'child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { SpawnConfig, AgentAdapter, AgentResult } from '@agent-workstation/core'

export interface AdapterConfig {
  command: string
  args: string[]
  env?: Record<string, string>
  resultPath?: string
}

export class KiroAdapter implements AgentAdapter {
  name = 'kiro'
  completionStrategy = 'file-watch' as const

  buildCommand(config: SpawnConfig, briefingPath: string): string[] {
    return [
      'kiro-cli',
      'chat',
      '--message-file', briefingPath,
      '--json'
    ]
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    return {
      ...config.env,
      AW_AGENT_ID: config.agent,
      AW_TASK: config.task
    }
  }

  parseResult(resultPath: string): AgentResult | null {
    try {
      const content = require('fs').readFileSync(resultPath, 'utf-8')
      return JSON.parse(content) as AgentResult
    } catch {
      return null
    }
  }
}

export class AiderAdapter implements AgentAdapter {
  name = 'aider'
  completionStrategy = 'process-exit' as const

  buildCommand(config: SpawnConfig, briefingPath: string): string[] {
    const args = ['aider', '--message-file', briefingPath]
    
    if (config.owned_files) {
      args.push(...config.owned_files)
    }
    
    return args
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    return {
      ...config.env,
      AIDER_NO_AUTO_COMMITS: '1'
    }
  }

  parseResult(resultPath: string): AgentResult | null {
    return {
      status: 'PASS',
      summary: 'Aider completed',
      changes: [],
      verification: { command: '', output: '', exit_code: 0 },
      decisions: {}
    }
  }
}

export class ClaudeCodeAdapter implements AgentAdapter {
  name = 'claude-code'
  completionStrategy = 'process-exit' as const

  buildCommand(config: SpawnConfig, briefingPath: string): string[] {
    return [
      'claude',
      '--print',
      '--message-file', briefingPath
    ]
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    return {
      ...config.env,
      ANTHROPIC_DISABLE_PROMPT_CACHING: '1'
    }
  }

  parseResult(resultPath: string): AgentResult | null {
    return {
      status: 'PASS',
      summary: 'Claude completed',
      changes: [],
      verification: { command: '', output: '', exit_code: 0 },
      decisions: {}
    }
  }
}

export class GenericAdapter implements AgentAdapter {
  name = 'generic'
  completionStrategy = 'both' as const
  private config: AdapterConfig

  constructor(config: AdapterConfig) {
    this.config = config
  }

  buildCommand(config: SpawnConfig, briefingPath: string): string[] {
    return [this.config.command, ...this.config.args]
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    return {
      ...this.config.env,
      ...config.env,
      AW_BRIEFING_PATH: '',
      AW_RESULT_PATH: this.config.resultPath ?? '',
      AW_AGENT_ID: config.agent,
      AW_TASK: config.task
    }
  }

  parseResult(resultPath: string): AgentResult | null {
    const path = this.config.resultPath ?? resultPath
    try {
      const content = require('fs').readFileSync(path, 'utf-8')
      return JSON.parse(content) as AgentResult
    } catch {
      return null
    }
  }
}

export function getAdapter(name: string, config?: AdapterConfig): AgentAdapter {
  switch (name) {
    case 'kiro':
      return new KiroAdapter()
    case 'aider':
      return new AiderAdapter()
    case 'claude-code':
    case 'claude':
      return new ClaudeCodeAdapter()
    case 'generic':
      if (!config) {
        throw new Error('Generic adapter requires config')
      }
      return new GenericAdapter(config)
    default:
      throw new Error(`Unknown adapter: ${name}`)
  }
}

export interface SpawnResult {
  process: ChildProcess
  briefingPath: string
  resultPath: string
}

export function spawnAgent(
  adapter: AgentAdapter,
  spawnConfig: SpawnConfig,
  briefingContent: string
): SpawnResult {
  const tmpDir = mkdtempSync(join(tmpdir(), 'aw-agent-'))
  const briefingPath = join(tmpDir, 'briefing.md')
  const resultPath = join(tmpDir, 'result.json')
  
  writeFileSync(briefingPath, briefingContent)
  
  const command = adapter.buildCommand(spawnConfig, briefingPath)
  const env = {
    ...process.env,
    ...adapter.getEnv(spawnConfig),
    AW_RESULT_PATH: resultPath
  }
  
  const [cmd, ...args] = command
  const childProcess = spawn(cmd, args, {
    cwd: spawnConfig.workdir ?? process.cwd(),
    env,
    stdio: 'inherit'
  })
  
  return {
    process: childProcess,
    briefingPath,
    resultPath
  }
}

export async function waitForCompletion(
  adapter: AgentAdapter,
  spawnResult: SpawnResult,
  timeout: number = 300000
): Promise<AgentResult | null> {
  return new Promise((resolve) => {
    const { process, resultPath } = spawnResult
    let timeoutId: NodeJS.Timeout | null = null
    let checkIntervalId: NodeJS.Timeout | null = null
    
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (checkIntervalId) clearInterval(checkIntervalId)
    }
    
    const checkResult = () => {
      const result = adapter.parseResult(resultPath)
      if (result) {
        cleanup()
        resolve(result)
      }
    }
    
    if (adapter.completionStrategy === 'process-exit' || adapter.completionStrategy === 'both') {
      process.on('exit', (code) => {
        cleanup()
        if (code === 0) {
          resolve(adapter.parseResult(resultPath) ?? {
            status: 'PASS',
            summary: 'Process exited successfully',
            changes: [],
            verification: { command: '', output: '', exit_code: 0 },
            decisions: {}
          })
        } else {
          resolve({
            status: 'FAIL',
            summary: `Process exited with code ${code}`,
            changes: [],
            verification: { command: '', output: '', exit_code: code ?? 1 },
            decisions: {}
          })
        }
      })
      
      process.on('error', (err) => {
        cleanup()
        resolve({
          status: 'FAIL',
          summary: err.message,
          changes: [],
          verification: { command: '', output: err.message, exit_code: 1 },
          decisions: {}
        })
      })
    }
    
    if (adapter.completionStrategy === 'file-watch' || adapter.completionStrategy === 'both') {
      checkIntervalId = setInterval(checkResult, 1000)
    }
    
    timeoutId = setTimeout(() => {
      cleanup()
      resolve({
        status: 'FAIL',
        summary: 'Timeout waiting for completion',
        changes: [],
        verification: { command: '', output: 'Timeout', exit_code: 1 },
        decisions: {}
      })
    }, timeout)
  })
}
