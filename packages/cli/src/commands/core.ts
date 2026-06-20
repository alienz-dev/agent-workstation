import { defineCommand } from 'citty'
import { DaemonClient } from '@agent-workstation/core'

export const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show workstation status'
  },
  args: {
    session: {
      type: 'string',
      alias: 's',
      description: 'Session name'
    }
  },
  async run({ args }) {
    const session = args.session ?? process.env.ZELLIJ_SESSION_NAME ?? 'default'
    
    try {
      const client = DaemonClient.connect(session)
      const health = await client.health()
      
      console.log(`Session: ${session}`)
      console.log(`Status: ${health.status}`)
      
      const agents = await client.listAgents()
      console.log(`Agents: ${agents.length}`)
      
      for (const agent of agents) {
        console.log(`  - ${agent.id}: ${agent.status} (${agent.role})`)
      }
      
      const stage = await client.getPipelineStage()
      console.log(`Pipeline: ${stage}`)
    } catch (error) {
      console.error('Failed to connect to daemon')
      console.error(error)
      process.exit(1)
    }
  }
})

export const spawnCommand = defineCommand({
  meta: {
    name: 'spawn',
    description: 'Spawn a new agent'
  },
  args: {
    role: {
      type: 'string',
      alias: 'r',
      description: 'Agent role',
      required: true
    },
    task: {
      type: 'string',
      alias: 't',
      description: 'Task description',
      required: true
    },
    adapter: {
      type: 'string',
      alias: 'a',
      description: 'Agent adapter (kiro, aider, claude-code)'
    },
    session: {
      type: 'string',
      alias: 's',
      description: 'Session name'
    }
  },
  async run({ args }) {
    const session = args.session ?? process.env.ZELLIJ_SESSION_NAME ?? 'default'
    
    try {
      const client = DaemonClient.connect(session)
      
      const result = await client.spawn({
        agent: args.role,
        task: args.task,
        adapter: args.adapter
      })
      
      console.log(`Spawned agent: ${result.id}`)
      console.log(`Status: ${result.status}`)
    } catch (error) {
      console.error('Failed to spawn agent')
      console.error(error)
      process.exit(1)
    }
  }
})

export const sendCommand = defineCommand({
  meta: {
    name: 'send',
    description: 'Send message to agent'
  },
  args: {
    agent: {
      type: 'string',
      alias: 'a',
      description: 'Target agent ID',
      required: true
    },
    message: {
      type: 'string',
      alias: 'm',
      description: 'Message content',
      required: true
    },
    session: {
      type: 'string',
      alias: 's',
      description: 'Session name'
    }
  },
  async run({ args }) {
    const session = args.session ?? process.env.ZELLIJ_SESSION_NAME ?? 'default'
    
    try {
      const client = DaemonClient.connect(session)
      
      const result = await client.sendMessage(args.message, {
        to_agent: args.agent
      })
      
      console.log(`Message sent: ${result.id}`)
    } catch (error) {
      console.error('Failed to send message')
      console.error(error)
      process.exit(1)
    }
  }
})

export const messagesCommand = defineCommand({
  meta: {
    name: 'messages',
    description: 'List messages'
  },
  args: {
    agent: {
      type: 'string',
      alias: 'a',
      description: 'Filter by agent ID'
    },
    session: {
      type: 'string',
      alias: 's',
      description: 'Session name'
    }
  },
  async run({ args }) {
    const session = args.session ?? process.env.ZELLIJ_SESSION_NAME ?? 'default'
    
    try {
      const client = DaemonClient.connect(session)
      
      const filter: { to_agent?: string } = {}
      if (args.agent) {
        filter.to_agent = args.agent
      }
      
      const messages = await client.getMessages(filter)
      
      console.log(`Messages: ${messages.length}`)
      for (const msg of messages) {
        console.log(`  - ${msg.id}: ${msg.content.slice(0, 50)}...`)
      }
    } catch (error) {
      console.error('Failed to get messages')
      console.error(error)
      process.exit(1)
    }
  }
})

export const sessionCommand = defineCommand({
  meta: {
    name: 'session',
    description: 'Manage sessions'
  },
  subCommands: {
    list: defineCommand({
      meta: { name: 'list', description: 'List sessions' },
      async run() {
        console.log('Session list not yet implemented')
      }
    }),
    create: defineCommand({
      meta: { name: 'create', description: 'Create session' },
      args: {
        name: {
          type: 'string',
          description: 'Session name',
          required: true
        }
      },
      async run({ args }) {
        console.log(`Session ${args.name} created`)
      }
    })
  }
})

export const daemonCommand = defineCommand({
  meta: {
    name: 'daemon',
    description: 'Manage daemon'
  },
  subCommands: {
    start: defineCommand({
      meta: { name: 'start', description: 'Start daemon' },
      args: {
        session: {
          type: 'string',
          alias: 's',
          description: 'Session name'
        },
        port: {
          type: 'string',
          alias: 'p',
          description: 'Port number'
        }
      },
      async run({ args }) {
        const session = typeof args.session === 'string' 
          ? args.session 
          : process.env.ZELLIJ_SESSION_NAME ?? 'default'
        const port = typeof args.port === 'string' ? parseInt(args.port, 10) : 0
        
        console.log(`Starting daemon for session ${session}...`)
        console.log('Use: aw-daemon start --session', session, '--port', port || '<auto>')
      }
    }),
    stop: defineCommand({
      meta: { name: 'stop', description: 'Stop daemon' },
      args: {
        session: {
          type: 'string',
          alias: 's',
          description: 'Session name'
        }
      },
      async run({ args }) {
        const session = args.session ?? process.env.ZELLIJ_SESSION_NAME ?? 'default'
        console.log(`Stopping daemon for session ${session}...`)
      }
    }),
    status: defineCommand({
      meta: { name: 'status', description: 'Daemon status' },
      args: {
        session: {
          type: 'string',
          alias: 's',
          description: 'Session name'
        }
      },
      async run({ args }) {
        const session = typeof args.session === 'string'
          ? args.session
          : process.env.ZELLIJ_SESSION_NAME ?? 'default'
        
        try {
          const client = DaemonClient.connect(session)
          const health = await client.health()
          console.log(`Daemon: ${health.status}`)
          console.log(`Session: ${health.session}`)
        } catch {
          console.log('Daemon: not running')
        }
      }
    })
  }
})
