/**
 * HTTP client for communicating with the session daemon.
 */
import { spawn } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { SpawnConfig } from './types.js'

export interface DaemonInfo {
  port: number
  token: string
  session: string
  pid: number
}

export interface SpawnResult {
  id: string
  status: string
  message?: string
}

export interface AgentInfo {
  id: string
  role: string
  status: string
  adapter: string
  task: string
  parent_id: string | null
  started_at: number
  finished_at: number | null
  last_heartbeat: number
  pane_id: string | null
  session_name: string
}

export interface ClaimInfo {
  path: string
  agent_id: string
  claimed_at: number
}

export interface MessageInfo {
  id: string
  from_agent: string | null
  to_role: string | null
  to_agent: string | null
  content: string
  status: string
  created_at: number
  delivered_at: number | null
}

export class DaemonClient {
  private baseUrl: string
  private token: string
  private session: string

  private constructor(baseUrl: string, token: string, session: string) {
    this.baseUrl = baseUrl
    this.token = token
    this.session = session
  }

  /**
   * Connect to an existing daemon or throw if not found.
   */
  static connect(session: string = 'default'): DaemonClient {
    const info = this.discover(session)
    return new DaemonClient(`http://127.0.0.1:${info.port}`, info.token, info.session)
  }

  /**
   * Connect to daemon or start it if not running.
   */
  static async connectOrStart(
    session: string = 'default',
    options: {
      maxRetries?: number
      initialDelay?: number
      maxDelay?: number
    } = {}
  ): Promise<DaemonClient> {
    const maxRetries = options.maxRetries ?? 10
    const initialDelay = options.initialDelay ?? 100
    const maxDelay = options.maxDelay ?? 5000
    
    // Try to connect first
    try {
      return this.connect(session)
    } catch {
      // Daemon not running, start it
      await this.startDaemon(session)
    }
    
    // Retry with exponential backoff
    let delay = initialDelay
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      await new Promise(resolve => setTimeout(resolve, delay))
      
      try {
        const client = this.connect(session)
        // Verify daemon is healthy
        await client.health()
        return client
      } catch {
        // Exponential backoff with jitter
        delay = Math.min(delay * 2 + Math.random() * 100, maxDelay)
      }
    }
    
    throw new Error(`Failed to connect to daemon after ${maxRetries} retries`)
  }

  /**
   * Discover daemon info from port file.
   */
  static discover(session: string = 'default'): DaemonInfo {
    const portFile = `/tmp/aw-daemon-${session}.json`
    if (!existsSync(portFile)) {
      throw new Error(`Daemon not running for session '${session}'. Port file not found: ${portFile}`)
    }
    const content = readFileSync(portFile, 'utf-8')
    return JSON.parse(content) as DaemonInfo
  }

  /**
   * Start the daemon process.
   */
  static async startDaemon(session: string = 'default'): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('aw-daemon', ['start', '--session', session], {
        detached: true,
        stdio: 'ignore'
      })
      proc.on('error', reject)
      proc.unref()
      resolve()
    })
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(`Daemon request failed: ${response.status} ${JSON.stringify(error)}`)
    }

    return response.json()
  }

  /**
   * Spawn a new agent.
   */
  async spawn(config: SpawnConfig & { id?: string }): Promise<SpawnResult> {
    const result = await this.request('POST', '/v1/spawn', {
      id: config.id,
      agent: config.agent,
      role: config.agent,
      task: config.task,
      adapter: config.adapter,
      parent_id: config.parent_id,
      workdir: config.workdir,
      model: config.model,
      skills: config.skills,
      owned_files: config.owned_files,
      timeout: config.timeout,
      subscribe: config.subscribe,
      headless: config.headless,
      topic: config.topic,
      context_file: config.context_file,
      env: config.env
    })
    return result as SpawnResult
  }

  /**
   * Send heartbeat for an agent.
   */
  async heartbeat(agentId: string): Promise<void> {
    await this.request('POST', '/v1/heartbeat', { id: agentId })
  }

  /**
   * List all agents in the session.
   */
  async listAgents(): Promise<AgentInfo[]> {
    const result = await this.request('GET', '/v1/agents') as { agents: AgentInfo[] }
    return result.agents
  }

  /**
   * Get a specific agent.
   */
  async getAgent(agentId: string): Promise<AgentInfo> {
    return this.request('GET', `/v1/agents/${agentId}`) as Promise<AgentInfo>
  }

  /**
   * Terminate an agent.
   */
  async terminate(agentId: string): Promise<void> {
    await this.request('POST', `/v1/agents/${agentId}/terminate`)
  }

  /**
   * Claim a file for exclusive access.
   */
  async claimFile(path: string, agentId: string): Promise<void> {
    await this.request('POST', '/v1/claim', { path, agent_id: agentId })
  }

  /**
   * Release a file claim.
   */
  async releaseFile(path: string): Promise<void> {
    await this.request('POST', '/v1/release', { path })
  }

  /**
   * List file claims.
   */
  async listClaims(agentId?: string): Promise<ClaimInfo[]> {
    const query = agentId ? `?agent_id=${agentId}` : ''
    const result = await this.request('GET', `/v1/claims${query}`) as { claims: ClaimInfo[] }
    return result.claims
  }

  /**
   * Send a message to an agent.
   */
  async sendMessage(content: string, options: {
    id?: string
    from_agent?: string
    to_agent?: string
    to_role?: string
  } = {}): Promise<{ id: string; status: string }> {
    return this.request('POST', '/v1/message', {
      id: options.id,
      content,
      from_agent: options.from_agent,
      to_agent: options.to_agent,
      to_role: options.to_role
    }) as Promise<{ id: string; status: string }>
  }

  /**
   * Get pending messages.
   */
  async getMessages(options: { to_agent?: string; to_role?: string } = {}): Promise<MessageInfo[]> {
    const params = new URLSearchParams()
    if (options.to_agent) params.set('to_agent', options.to_agent)
    if (options.to_role) params.set('to_role', options.to_role)
    const query = params.toString() ? `?${params.toString()}` : ''
    const result = await this.request('GET', `/v1/messages${query}`) as { messages: MessageInfo[] }
    return result.messages
  }

  /**
   * Acknowledge a message.
   */
  async ackMessage(messageId: string): Promise<void> {
    await this.request('POST', `/v1/messages/${messageId}/ack`)
  }

  /**
   * Get current pipeline stage.
   */
  async getPipelineStage(): Promise<string> {
    const result = await this.request('GET', '/v1/pipeline') as { stage: string }
    return result.stage
  }

  /**
   * Advance pipeline to a new stage.
   */
  async advancePipeline(stage: string): Promise<void> {
    await this.request('POST', '/v1/pipeline/advance', { stage })
  }

  /**
   * Health check.
   */
  async health(): Promise<{ status: string; session: string }> {
    return this.request('GET', '/v1/health') as Promise<{ status: string; session: string }>
  }
}
