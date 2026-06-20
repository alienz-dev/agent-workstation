#!/usr/bin/env node
/**
 * aw — Agent Workstation CLI
 */
import { defineCommand, runMain } from 'citty'

import { statusCommand, spawnCommand, sendCommand, messagesCommand, sessionCommand, daemonCommand } from './commands/core.js'
import { planCommand } from './commands/plan.js'
import { issueCommand } from './commands/issue.js'
import { heuristicCommand } from './commands/heuristic.js'
import { knowledgeCommand, reviewCommand } from './commands/knowledge.js'
import { initCommand, doctorCommand } from './commands/init.js'
import { dbCommand } from './commands/db.js'

const main = defineCommand({
  meta: {
    name: 'aw',
    version: '0.1.0',
    description: 'Agent Workstation - Orchestration platform for AI coding agents'
  },
  subCommands: {
    init: initCommand,
    doctor: doctorCommand,
    status: statusCommand,
    spawn: spawnCommand,
    send: sendCommand,
    messages: messagesCommand,
    session: sessionCommand,
    daemon: daemonCommand,
    plan: planCommand,
    issue: issueCommand,
    heuristic: heuristicCommand,
    knowledge: knowledgeCommand,
    review: reviewCommand,
    db: dbCommand
  },
})

runMain(main)
