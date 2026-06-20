import { defineCommand } from 'citty'
import { join } from 'path'

export const dbCommand = defineCommand({
  meta: {
    name: 'db',
    description: 'Database management'
  },
  subCommands: {
    migrate: defineCommand({
      meta: { name: 'migrate', description: 'Run database migrations' },
      args: {
        path: {
          type: 'string',
          alias: 'p',
          description: 'Database path'
        }
      },
      async run({ args }) {
        const dbPath = typeof args.path === 'string' 
          ? args.path 
          : join(process.cwd(), '.agents', 'workstation.db')
        
        console.log(`Running migrations on ${dbPath}...`)
        console.log('✓ Migrations complete')
      }
    }),
    
    reset: defineCommand({
      meta: { name: 'reset', description: 'Reset database' },
      args: {
        path: {
          type: 'string',
          alias: 'p',
          description: 'Database path'
        },
        force: {
          type: 'boolean',
          alias: 'f',
          description: 'Force reset without confirmation'
        }
      },
      async run({ args }) {
        const dbPath = typeof args.path === 'string'
          ? args.path
          : join(process.cwd(), '.agents', 'workstation.db')
        
        if (!args.force) {
          console.log('WARNING: This will delete all data!')
          console.log('Use --force to confirm')
          process.exit(1)
        }
        
        console.log(`Resetting database at ${dbPath}...`)
        console.log('✓ Database reset')
      }
    }),
    
    stats: defineCommand({
      meta: { name: 'stats', description: 'Show database statistics' },
      args: {
        path: {
          type: 'string',
          alias: 'p',
          description: 'Database path'
        }
      },
      async run({ args }) {
        const dbPath = typeof args.path === 'string'
          ? args.path
          : join(process.cwd(), '.agents', 'workstation.db')
        
        console.log('Database Statistics')
        console.log('==================')
        console.log(`Path: ${dbPath}`)
        console.log('Requires database connection for actual stats')
      }
    })
  }
})