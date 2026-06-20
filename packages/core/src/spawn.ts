import { spawn, type ChildProcess } from 'child_process'
import { writeFileSync, existsSync, readFileSync, mkdtempSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import type { SpawnConfig, AgentResult } from './types.js'
import { buildBriefing, formatBriefing } from './briefing.js'

export interface AgentProcess {
  id: string
  process: ChildProcess
  adapter: string
  briefingPath: string
  resultPath: string
  startedAt: number
  workdir: string
}

export interface SpawnOptions {
  config: SpawnConfig
  briefingContext: {
    task: string
    role: string
    projectRoot: string
    context?: string
    ownedFiles?: string[]
    deniedPaths?: string[]
  }
  adapter?: 'kiro' | 'aider' | 'claude-code' | 'generic'
}

const ADAPTER_COMMANDS = {
  'kiro': {
    command: 'kiro-cli',
    args: ['chat', '--json'],
    env: {}
  },
  'aider': {
    command: 'aider',
    args: [],
    env: { AIDER_NO_AUTO_COMMITS: '1' }
  },
  'claude-code': {
    command: 'claude',
    args: ['--print'],
    env: { ANTHROPIC_DISABLE_PROMPT_CACHING: '1' }
  },
  'generic': {
    command: 'node',
    args: [],
    env: {}
  }
}

/**
 * Spawn an agent process using the appropriate adapter.
 */
export function spawnAgentProcess(options: SpawnOptions): AgentProcess {
  const { config, briefingContext, adapter = 'kiro' } = options
  
  // Create temp directory for this agent
  const workdir = mkdtempSync(join(tmpdir(), `aw-agent-${config.agent}-`))
  const briefingPath = join(workdir, 'briefing.md')
  const resultPath = join(workdir, 'result.json')
  
  // Build and write briefing
  const briefing = buildBriefing(briefingContext)
  writeFileSync(briefingPath, formatBriefing(briefing))
  
  // Get adapter config
  const adapterConfig = ADAPTER_COMMANDS[adapter]
  
  // Build command
  const args = [...adapterConfig.args]
  
  if (adapter === 'kiro') {
    args.push('--message-file', briefingPath)
  } else if (adapter === 'aider') {
    args.push('--message-file', briefingPath)
    if (config.owned_files) {
      args.push(...config.owned_files)
    }
  } else if (adapter === 'claude-code') {
    args.push('--message-file', briefingPath)
  }
  
  // Build environment
  const env = {
    ...process.env,
    ...adapterConfig.env,
    ...config.env,
    AW_AGENT_ID: config.agent,
    AW_TASK: config.task,
    AW_BRIEFING_PATH: briefingPath,
    AW_RESULT_PATH: resultPath,
    AW_PROJECT_ROOT: briefingContext.projectRoot
  }
  
  // Spawn process
  const childProcess = spawn(adapterConfig.command, args, {
    cwd: config.workdir ?? briefingContext.projectRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  })
  
  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  
  return {
    id,
    process: childProcess,
    adapter,
    briefingPath,
    resultPath,
    startedAt: Date.now(),
    workdir
  }
}

/**
 * Wait for agent process to complete.
 */
export async function waitForAgent(
  agentProcess: AgentProcess,
  options: {
    timeout?: number
    onStdout?: (data: string) => void
    onStderr?: (data: string) => void
  } = {}
): Promise<AgentResult> {
  const { timeout = 300000, onStdout, onStderr } = options
  const { process, resultPath, workdir } = agentProcess
  
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    
    const timeoutId = setTimeout(() => {
      timedOut = true
      process.kill('SIGTERM')
    }, timeout)
    
    process.stdout?.on('data', (data: Buffer) => {
      const str = data.toString()
      stdout += str
      onStdout?.(str)
    })
    
    process.stderr?.on('data', (data: Buffer) => {
      const str = data.toString()
      stderr += str
      onStderr?.(str)
    })
    
    process.on('close', (code) => {
      clearTimeout(timeoutId)
      
      // Try to read result file
      if (existsSync(resultPath)) {
        try {
          const content = readFileSync(resultPath, 'utf-8')
          const result = JSON.parse(content) as AgentResult
          resolve(result)
          return
        } catch {
          // Fall through to default result
        }
      }
      
      // Build result from process output
      resolve({
        status: timedOut ? 'FAIL' : (code === 0 ? 'PASS' : 'FAIL'),
        summary: timedOut 
          ? 'Agent timed out'
          : (code === 0 
            ? 'Agent completed successfully'
            : `Agent exited with code ${code}`),
        changes: [],
        verification: {
          command: agentProcess.adapter,
          output: stdout,
          exit_code: code ?? 1
        },
        decisions: {},
        issues: stderr ? [stderr] : undefined
      })
      
      // Clean up workdir
      try {
        rmSync(workdir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    })
    
    process.on('error', (err) => {
      clearTimeout(timeoutId)
      reject(err)
    })
  })
}

/**
 * Kill an agent process.
 */
export function killAgent(agentProcess: AgentProcess, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): void {
  try {
    agentProcess.process.kill(signal)
  } catch {
    // Process may already be dead
  }
}

/**
 * Check if agent process is still running.
 */
export function isAgentRunning(agentProcess: AgentProcess): boolean {
  try {
    // Sending signal 0 checks if process is alive
    agentProcess.process.kill(0)
    return true
  } catch {
    return false
  }
}

/**
 * Spawn and wait for agent in one call.
 */
export async function runAgent(
  options: SpawnOptions,
  waitOptions?: {
    timeout?: number
    onStdout?: (data: string) => void
    onStderr?: (data: string) => void
  }
): Promise<{ process: AgentProcess; result: AgentResult }> {
  const agentProcess = spawnAgentProcess(options)
  
  try {
    const result = await waitForAgent(agentProcess, waitOptions)
    return { process: agentProcess, result }
  } catch (error) {
    killAgent(agentProcess)
    throw error
  }
}
