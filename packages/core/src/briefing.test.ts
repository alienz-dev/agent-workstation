import { describe, it, expect } from 'vitest'
import {
  buildBriefing,
  formatBriefing,
  parseResult,
  validateResult
} from './briefing.js'

describe('buildBriefing', () => {
  it('builds minimal briefing', () => {
    const briefing = buildBriefing({
      task: 'Fix the bug',
      role: 'coder',
      projectRoot: '/tmp/test'
    })
    
    expect(briefing.task).toBe('Fix the bug')
    expect(briefing.constraints.owned_files).toEqual([])
    expect(briefing.constraints.denied_paths).toEqual([])
  })

  it('includes role constraints', () => {
    const briefing = buildBriefing({
      task: 'Fix the bug',
      role: 'coder',
      projectRoot: '/tmp/test'
    }, {
      name: 'coder',
      description: 'Writes code',
      deniedPaths: ['specs/**'],
      allowedTools: ['read', 'write'],
      deniedCommands: []
    })
    
    expect(briefing.constraints.denied_paths).toContain('specs/**')
    expect(briefing.constraints.allowed_tools).toContain('read')
  })

  it('includes heuristics', () => {
    const briefing = buildBriefing({
      task: 'Fix the bug',
      role: 'coder',
      projectRoot: '/tmp/test',
      heuristics: [
        { id: 'h1', triggerCondition: 'permission denied', action: 'check perms', confidence: 'high', score: 1 }
      ]
    })
    
    expect(briefing.heuristics).toHaveLength(1)
    expect(briefing.heuristics?.[0].trigger).toBe('permission denied')
  })
})

describe('formatBriefing', () => {
  it('formats briefing as markdown', () => {
    const briefing = buildBriefing({
      task: 'Fix the bug',
      role: 'coder',
      projectRoot: '/tmp/test',
      context: 'This is the context'
    })
    
    const md = formatBriefing(briefing)
    
    expect(md).toContain('# Briefing')
    expect(md).toContain('## Task')
    expect(md).toContain('Fix the bug')
    expect(md).toContain('## Context')
    expect(md).toContain('This is the context')
  })

  it('includes verification command', () => {
    const briefing = buildBriefing({
      task: 'Fix the bug',
      role: 'coder',
      projectRoot: '/tmp/test',
      verificationCommand: 'npm run test'
    })
    
    const md = formatBriefing(briefing)
    expect(md).toContain('npm run test')
  })
})

describe('parseResult', () => {
  it('parses valid result', () => {
    const content = `
## Status: PASS
## Summary
Fixed the bug successfully.
`
    const result = parseResult(content)
    expect(result).not.toBeNull()
    expect(result?.status).toBe('PASS')
    expect(result?.summary).toContain('Fixed the bug')
  })

  it('returns null for missing status', () => {
    const content = `
## Summary
Some summary
`
    const result = parseResult(content)
    expect(result).toBeNull()
  })
})

describe('validateResult', () => {
  it('validates correct result', () => {
    const content = `
## Status: PASS
## Summary
Done
`
    const validation = validateResult(content)
    expect(validation.valid).toBe(true)
  })

  it('rejects missing status', () => {
    const content = '## Summary\nDone'
    const validation = validateResult(content)
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain('Missing')
  })

  it('rejects invalid status', () => {
    const content = '## Status: INVALID'
    const validation = validateResult(content)
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain('Invalid')
  })
})
