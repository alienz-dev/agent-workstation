import { defineCommand } from 'citty'
import { IssueStore } from '@agent-workstation/core'
import type { IssueState, IssueType, IssuePriority } from '@agent-workstation/core'

const store = new IssueStore()

function asString(value: string | boolean | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

export const issueCommand = defineCommand({
  meta: {
    name: 'issue',
    description: 'Manage issues'
  },
  subCommands: {
    open: defineCommand({
      meta: { name: 'open', description: 'Open a new issue' },
      args: {
        title: {
          type: 'string',
          alias: 't',
          description: 'Issue title',
          required: true
        },
        type: {
          type: 'string',
          alias: 'T',
          description: 'Issue type (bug, feature, task, epic)'
        },
        priority: {
          type: 'string',
          alias: 'p',
          description: 'Priority (low, medium, high, critical)'
        },
        description: {
          type: 'string',
          alias: 'd',
          description: 'Issue description'
        },
        labels: {
          type: 'string',
          alias: 'l',
          description: 'Labels (comma-separated)'
        }
      },
      async run({ args }) {
        const labelsStr = asString(args.labels)
        const issue = store.open({
          title: asString(args.title) ?? '',
          description: asString(args.description) ?? '',
          type: (asString(args.type) ?? 'task') as IssueType,
          priority: (asString(args.priority) ?? 'medium') as IssuePriority,
          labels: labelsStr?.split(',').map(l => l.trim()) ?? []
        })
        
        console.log(`Issue opened: ${issue.id}`)
        console.log(`Title: ${issue.title}`)
        console.log(`Type: ${issue.type}`)
        console.log(`Priority: ${issue.priority}`)
      }
    }),
    
    show: defineCommand({
      meta: { name: 'show', description: 'Show issue details' },
      args: {
        id: {
          type: 'string',
          alias: 'i',
          description: 'Issue ID',
          required: true
        }
      },
      async run({ args }) {
        const issue = store.get(asString(args.id) ?? '')
        
        if (!issue) {
          console.error(`Issue not found: ${asString(args.id)}`)
          process.exit(1)
        }
        
        console.log(`Issue: ${issue.id}`)
        console.log(`Title: ${issue.title}`)
        console.log(`Type: ${issue.type}`)
        console.log(`Status: ${issue.state}`)
        console.log(`Priority: ${issue.priority}`)
        console.log(`Created: ${new Date(issue.created_at * 1000).toISOString()}`)
        
        if (issue.description) {
          console.log()
          console.log(issue.description)
        }
        
        if (issue.labels.length > 0) {
          console.log()
          console.log(`Labels: ${issue.labels.join(', ')}`)
        }
        
        if (issue.task_ids.length > 0) {
          console.log(`Tasks: ${issue.task_ids.join(', ')}`)
        }
        
        if (issue.agent_ids.length > 0) {
          console.log(`Agents: ${issue.agent_ids.join(', ')}`)
        }
      }
    }),
    
    list: defineCommand({
      meta: { name: 'list', description: 'List issues' },
      args: {
        state: {
          type: 'string',
          alias: 's',
          description: 'Filter by state'
        },
        type: {
          type: 'string',
          alias: 't',
          description: 'Filter by type'
        },
        priority: {
          type: 'string',
          alias: 'p',
          description: 'Filter by priority'
        }
      },
      async run({ args }) {
        const filter: {
          state?: IssueState
          type?: IssueType
          priority?: IssuePriority
        } = {}
        
        const stateStr = asString(args.state)
        const typeStr = asString(args.type)
        const priorityStr = asString(args.priority)
        
        if (stateStr) filter.state = stateStr as IssueState
        if (typeStr) filter.type = typeStr as IssueType
        if (priorityStr) filter.priority = priorityStr as IssuePriority
        
        const issues = store.list(filter)
        
        console.log(`Issues: ${issues.length}`)
        console.log()
        
        for (const issue of issues) {
          const statusIcon = issue.state === 'closed' ? '✗' :
                            issue.state === 'done' ? '✓' :
                            issue.state === 'in-progress' ? '►' : '○'
          console.log(`${statusIcon} ${issue.id}: ${issue.title}`)
          console.log(`  Type: ${issue.type} | Priority: ${issue.priority} | State: ${issue.state}`)
        }
      }
    }),
    
    close: defineCommand({
      meta: { name: 'close', description: 'Close an issue' },
      args: {
        id: {
          type: 'string',
          alias: 'i',
          description: 'Issue ID',
          required: true
        },
        reason: {
          type: 'string',
          alias: 'r',
          description: 'Close reason'
        }
      },
      async run({ args }) {
        try {
          const issue = store.close(asString(args.id) ?? '', asString(args.reason))
          console.log(`Issue closed: ${issue.id}`)
        } catch (error) {
          console.error(error)
          process.exit(1)
        }
      }
    }),
    
    edit: defineCommand({
      meta: { name: 'edit', description: 'Edit an issue' },
      args: {
        id: {
          type: 'string',
          alias: 'i',
          description: 'Issue ID',
          required: true
        },
        title: {
          type: 'string',
          alias: 't',
          description: 'New title'
        },
        state: {
          type: 'string',
          alias: 's',
          description: 'New state'
        },
        priority: {
          type: 'string',
          alias: 'p',
          description: 'New priority'
        }
      },
      async run({ args }) {
        const updates: {
          title?: string
          state?: IssueState
          priority?: IssuePriority
        } = {}
        
        const titleStr = asString(args.title)
        const stateStr = asString(args.state)
        const priorityStr = asString(args.priority)
        
        if (titleStr) updates.title = titleStr
        if (stateStr) updates.state = stateStr as IssueState
        if (priorityStr) updates.priority = priorityStr as IssuePriority
        
        try {
          const issue = store.update(asString(args.id) ?? '', updates)
          console.log(`Issue updated: ${issue.id}`)
          console.log(`State: ${issue.state}`)
        } catch (error) {
          console.error(error)
          process.exit(1)
        }
      }
    })
  }
})