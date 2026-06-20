import { defineCommand } from 'citty'
import { parsePlanFile, validateNoCycles, findReadyTasks, findBlockedTasks, buildTaskGraph, dispatchPlan } from '@agent-workstation/core'
import type { ParsedTask } from '@agent-workstation/core'

export const planCommand = defineCommand({
  meta: {
    name: 'plan',
    description: 'Manage plans'
  },
  subCommands: {
    load: defineCommand({
      meta: { name: 'load', description: 'Load a plan file' },
      args: {
        file: {
          type: 'string',
          alias: 'f',
          description: 'Plan file path',
          required: true
        }
      },
      async run({ args }) {
        try {
          const plan = parsePlanFile(args.file as string)
          
          console.log(`Plan: ${plan.title}`)
          console.log(`Tasks: ${plan.tasks.length}`)
          
          try {
            validateNoCycles(plan.tasks)
            console.log('✓ No cycles detected')
          } catch (error) {
            console.error('ERROR: Cycles detected!')
            console.error(error)
            process.exit(1)
          }
          
          const tasksWithStatus = plan.tasks.map(t => ({ ...t, status: 'pending' as const }))
          console.log(`Ready: ${findReadyTasks(tasksWithStatus).length}`)
          console.log(`Blocked: ${findBlockedTasks(tasksWithStatus).length}`)
        } catch (error) {
          console.error('Failed to load plan')
          console.error(error)
          process.exit(1)
        }
      }
    }),
    
    status: defineCommand({
      meta: { name: 'status', description: 'Show plan status' },
      args: {
        file: {
          type: 'string',
          alias: 'f',
          description: 'Plan file path',
          required: true
        }
      },
      async run({ args }) {
        try {
          const plan = parsePlanFile(args.file as string)
          
          const tasksWithStatus = plan.tasks.map(t => ({ ...t, status: 'pending' as const }))
          
          const ready = findReadyTasks(tasksWithStatus)
          const blocked = findBlockedTasks(tasksWithStatus)
          
          console.log(`Plan: ${plan.title}`)
          console.log(`Total: ${plan.tasks.length}`)
          console.log(`Ready: ${ready.length}`)
          console.log(`Blocked: ${blocked.length}`)
          console.log()
          
          if (ready.length > 0) {
            console.log('Ready:')
            for (const taskId of ready) {
              const task = plan.tasks.find(t => t.id === taskId)
              console.log(`  ✓ ${taskId}: ${task?.title ?? taskId}`)
            }
          }
          
          if (blocked.length > 0) {
            console.log('Blocked:')
            for (const b of blocked) {
              const task = plan.tasks.find(t => t.id === b.id)
              console.log(`  ✗ ${b.id}: ${task?.title ?? b.id}`)
              console.log(`    Waiting for: ${b.blockedBy.join(', ')}`)
            }
          }
        } catch (error) {
          console.error('Failed to get plan status')
          console.error(error)
          process.exit(1)
        }
      }
    }),
    
    dispatch: defineCommand({
      meta: { name: 'dispatch', description: 'Dispatch plan for execution' },
      args: {
        file: {
          type: 'string',
          alias: 'f',
          description: 'Plan file path',
          required: true
        },
        parallel: {
          type: 'boolean',
          alias: 'p',
          description: 'Allow parallel execution'
        }
      },
      async run({ args }) {
        try {
          const plan = parsePlanFile(args.file as string)
          const graph = buildTaskGraph(plan.tasks, {
            spawnAgent: async (task: ParsedTask) => {
              console.log(`  Spawning agent for: ${task.id}`)
              return task.id
            }
          })
          
          console.log(`Dispatching plan: ${plan.title}`)
          console.log(`Tasks: ${plan.tasks.length}`)
          console.log(`Parallel: ${args.parallel ?? false}`)
          
          const result = await dispatchPlan(plan.tasks, {
            spawnAgent: async (task: ParsedTask) => {
              console.log(`  Executing: ${task.id}`)
              return task.id
            }
          }, { concurrency: args.parallel ? 5 : 1 })
          
          console.log()
          console.log(`Completed: ${result.completed.length}`)
          console.log(`Failed: ${result.failed.length}`)
        } catch (error) {
          console.error('Failed to dispatch plan')
          console.error(error)
          process.exit(1)
        }
      }
    }),
    
    cancel: defineCommand({
      meta: { name: 'cancel', description: 'Cancel plan execution' },
      args: {
        plan: {
          type: 'string',
          alias: 'p',
          description: 'Plan ID',
          required: true
        }
      },
      async run({ args }) {
        console.log(`Cancelling plan: ${args.plan}`)
      }
    })
  }
})