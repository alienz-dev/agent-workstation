#!/usr/bin/env node
/**
 * aw — Agent Workstation CLI
 */
import { defineCommand, runMain } from 'citty'

const main = defineCommand({
  meta: { name: 'aw', version: '0.1.0', description: 'Agent Workstation' },
  subCommands: {
    // TODO: init, doctor, spawn, status, plan, issue, heuristic, knowledge, review, send, session, daemon
  },
})

runMain(main)
