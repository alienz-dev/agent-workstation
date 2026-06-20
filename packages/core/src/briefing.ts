/**
 * Briefing builder for preparing agent context.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Briefing, SpawnConfig } from './types.js'
import type { HeuristicMatch } from './heuristics.js'

export interface BriefingContext {
  task: string
  role: string
  projectRoot: string
  context?: string
  ownedFiles?: string[]
  deniedPaths?: string[]
  verificationCommand?: string
  heuristics?: HeuristicMatch[]
}

export interface RoleDefinition {
  name: string
  description: string
  deniedPaths: string[]
  allowedTools?: string[]
  deniedCommands?: string[]
}

/**
 * Load role definition from methodology/roles/<role>.md
 */
export function loadRoleDefinition(methodologyPath: string, role: string): RoleDefinition | null {
  const roleFile = join(methodologyPath, 'roles', `${role}.md`)
  if (!existsSync(roleFile)) return null
  
  const content = readFileSync(roleFile, 'utf-8')
  return parseRoleDefinition(role, content)
}

/**
 * Parse role definition from markdown.
 */
export function parseRoleDefinition(role: string, content: string): RoleDefinition {
  const deniedPathsMatch = content.match(/\*\*denied_paths\*\*:\s*\[([^\]]+)\]/)
  const allowedToolsMatch = content.match(/\*\*allowed_tools\*\*:\s*\[([^\]]+)\]/)
  const deniedCommandsMatch = content.match(/\*\*denied_commands\*\*:\s*\[([^\]]+)\]/)
  
  return {
    name: role,
    description: '',
    deniedPaths: deniedPathsMatch 
      ? deniedPathsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''))
      : [],
    allowedTools: allowedToolsMatch
      ? allowedToolsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''))
      : undefined,
    deniedCommands: deniedCommandsMatch
      ? deniedCommandsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''))
      : []
  }
}

/**
 * Build a briefing.
 */
export function buildBriefing(context: BriefingContext, role?: RoleDefinition): Briefing {
  const deniedPaths = [
    ...(role?.deniedPaths ?? []),
    ...(context.deniedPaths ?? [])
  ]
  
  const briefing: Briefing = {
    task: context.task,
    context: context.context ?? '',
    constraints: {
      owned_files: context.ownedFiles ?? [],
      denied_paths: deniedPaths,
      allowed_tools: role?.allowedTools,
      denied_commands: role?.deniedCommands ?? [],
      scope: `Role: ${context.role}`,
      do_not: []
    },
    verification: {
      command: context.verificationCommand ?? 'npm test',
      expected: 'exit 0'
    }
  }
  
  if (context.heuristics && context.heuristics.length > 0) {
    briefing.heuristics = context.heuristics.slice(0, 3).map(h => ({
      trigger: h.triggerCondition,
      action: h.action
    }))
  }
  
  return briefing
}

/**
 * Format briefing as markdown.
 */
export function formatBriefing(briefing: Briefing): string {
  const lines: string[] = []
  
  lines.push('# Briefing')
  lines.push('')
  lines.push('## Task')
  lines.push(briefing.task)
  lines.push('')
  
  if (briefing.context) {
    lines.push('## Context')
    lines.push(briefing.context)
    lines.push('')
  }
  
  if (briefing.read_directives && briefing.read_directives.length > 0) {
    lines.push('## Read Directives')
    for (const rd of briefing.read_directives) {
      lines.push(`- **${rd.path}**: ${rd.description}`)
    }
    lines.push('')
  }
  
  lines.push('## Constraints')
  lines.push(`- **Owned files**: ${briefing.constraints.owned_files.join(', ') || 'none'}`)
  lines.push(`- **Denied paths**: ${briefing.constraints.denied_paths.join(', ') || 'none'}`)
  if (briefing.constraints.allowed_tools) {
    lines.push(`- **Allowed tools**: ${briefing.constraints.allowed_tools.join(', ')}`)
  }
  lines.push(`- **Scope**: ${briefing.constraints.scope}`)
  lines.push('')
  
  lines.push('## Verification')
  lines.push(`\`\`\`bash`)
  lines.push(briefing.verification.command)
  lines.push(`\`\`\``)
  lines.push('')
  
  if (briefing.heuristics && briefing.heuristics.length > 0) {
    lines.push('## Heuristics')
    for (const h of briefing.heuristics) {
      lines.push(`- **${h.trigger}**: ${h.action}`)
    }
    lines.push('')
  }
  
  return lines.join('\n')
}

/**
 * Write briefing to file.
 */
export function writeBriefing(briefing: Briefing, path: string): void {
  const content = formatBriefing(briefing)
  writeFileSync(path, content, 'utf-8')
}

/**
 * Generate briefing path for a spawn.
 */
export function getBriefingPath(spawnId: string): string {
  return `/tmp/${spawnId}-briefing.md`
}

/**
 * Result file format.
 */
export interface ParsedResult {
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'BLOCKED'
  summary: string
  changes: Array<{ file: string; description: string }>
  verification: { command: string; output: string; exit_code: number }
  decisions: Record<string, string>
  issues?: string[]
}

/**
 * Parse result file.
 */
export function parseResult(content: string): ParsedResult | null {
  const statusMatch = content.match(/## Status:\s*(PASS|FAIL|PARTIAL|BLOCKED)/)
  if (!statusMatch) return null
  
  const summaryMatch = content.match(/## Summary\s*\n([\s\S]*?)(?=\n##|$)/)
  const changesMatch = content.match(/## Changes Made\s*\n([\s\S]*?)(?=\n##|$)/)
  
  return {
    status: statusMatch[1] as 'PASS' | 'FAIL' | 'PARTIAL' | 'BLOCKED',
    summary: summaryMatch?.[1]?.trim() ?? '',
    changes: [],
    verification: { command: '', output: '', exit_code: 0 },
    decisions: {}
  }
}

/**
 * Validate result file.
 */
export function validateResult(content: string): { valid: boolean; error?: string } {
  if (!content.includes('## Status:')) {
    return { valid: false, error: 'Missing ## Status: header' }
  }
  
  const statusMatch = content.match(/## Status:\s*(PASS|FAIL|PARTIAL|BLOCKED)/)
  if (!statusMatch) {
    return { valid: false, error: 'Invalid status value' }
  }
  
  return { valid: true }
}

/**
 * Read and validate result file.
 */
export function readResult(path: string): ParsedResult | null {
  if (!existsSync(path)) return null
  
  const content = readFileSync(path, 'utf-8')
  const validation = validateResult(content)
  if (!validation.valid) return null
  
  return parseResult(content)
}
