import { defineCommand } from 'citty'
import { KnowledgeStore, formatContextPackage, createReviewRequest, dispatchReview } from '@agent-workstation/core'

const knowledgeStore = new KnowledgeStore()

export const knowledgeCommand = defineCommand({
  meta: {
    name: 'knowledge',
    description: 'Knowledge search'
  },
  subCommands: {
    search: defineCommand({
      meta: { name: 'search', description: 'Search knowledge base' },
      args: {
        query: {
          type: 'string',
          alias: 'q',
          description: 'Search query',
          required: true
        },
        limit: {
          type: 'string',
          alias: 'l',
          description: 'Limit results'
        },
        sources: {
          type: 'string',
          alias: 's',
          description: 'Sources to search (comma-separated: issue,heuristic,session)'
        }
      },
      async run({ args }) {
        const sources = (args.sources as string)
          ? (args.sources as string).split(',').map(s => s.trim() as 'issue' | 'heuristic' | 'session')
          : undefined
        
        const pkg = knowledgeStore.assembleContext(args.query as string, {
          query: args.query as string,
          limit: parseInt((args.limit as string) ?? '10', 10),
          sources
        })
        
        console.log(formatContextPackage(pkg))
      }
    }),
    
    context: defineCommand({
      meta: { name: 'context', description: 'Assemble context for briefing' },
      args: {
        query: {
          type: 'string',
          alias: 'q',
          description: 'Query',
          required: true
        },
        tokens: {
          type: 'string',
          alias: 't',
          description: 'Max tokens'
        }
      },
      async run({ args }) {
        const pkg = knowledgeStore.assembleContext(args.query as string, {
          query: args.query as string,
          limit: 20
        })
        
        const maxTokens = parseInt((args.tokens as string) ?? '4000', 10)
        if (pkg.total_tokens > maxTokens) {
          console.log(`Warning: Context exceeds ${maxTokens} tokens (${pkg.total_tokens})`)
        }
        
        console.log(`Context assembled: ${pkg.total_tokens} tokens`)
        console.log(`Sources: ${pkg.sources_used.join(', ')}`)
        console.log(`Results: ${pkg.results.length}`)
      }
    })
  }
})

export const reviewCommand = defineCommand({
  meta: {
    name: 'review',
    description: 'Manage reviews'
  },
  subCommands: {
    request: defineCommand({
      meta: { name: 'request', description: 'Create review request' },
      args: {
        agent: {
          type: 'string',
          alias: 'a',
          description: 'Agent ID',
          required: true
        },
        files: {
          type: 'string',
          alias: 'f',
          description: 'Changed files (comma-separated)',
          required: true
        },
        summary: {
          type: 'string',
          alias: 's',
          description: 'Change summary'
        }
      },
      async run({ args }) {
        const files = (args.files as string).split(',').map(f => f.trim())
        
        const request = createReviewRequest(files, args.agent as string)
        
        console.log(`Review request: ${request.id}`)
        console.log(`Status: ${request.status}`)
        console.log(`Blast radius: ${request.blastRadius.filesChanged.length} files`)
      }
    }),
    
    dispatch: defineCommand({
      meta: { name: 'dispatch', description: 'Dispatch review' },
      args: {
        request: {
          type: 'string',
          alias: 'r',
          description: 'Review request ID',
          required: true
        }
      },
      async run({ args }) {
        console.log(`Dispatching review: ${args.request}`)
        
        const result = dispatchReview({
          id: args.request as string,
          changes: [],
          blastRadius: { filesChanged: [], sensitiveFiles: [], riskLevel: 'low', tier: 1 },
          requestedBy: 'cli',
          requestedAt: Date.now(),
          status: 'pending'
        })
        
        console.log(`Reviewer Role: ${result.reviewerRole}`)
        console.log(`Priority: ${result.priority}`)
      }
    })
  }
})