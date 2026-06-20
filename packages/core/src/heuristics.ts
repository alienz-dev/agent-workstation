/**
 * Heuristic management for learning from experience.
 */
import type { AgentWorkstationDB } from './database.js'
import { heuristics } from './schema.js'
import { eq, desc, sql } from 'drizzle-orm'

export interface Heuristic {
  id: string
  title: string
  type: 'failure' | 'success'
  triggerCondition: string
  action: string
  rationale: string
  scope: string
  confidence: 'high' | 'medium' | 'low'
  timesRetrieved: number
  timesRelevant: number
  sourceContext?: string
  createdAt: number
  archived: boolean
}

export interface HeuristicMatch {
  id: string
  triggerCondition: string
  action: string
  confidence: string
  score: number
}

/**
 * Generate a heuristic ID.
 */
export function generateHeuristicId(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `h-${date}-${seq}`
}

/**
 * Add a heuristic.
 */
export async function addHeuristic(
  db: AgentWorkstationDB,
  heuristic: {
    title: string
    type: 'failure' | 'success'
    triggerCondition: string
    action: string
    rationale: string
    scope?: string
    confidence?: 'high' | 'medium' | 'low'
    sourceContext?: string
  }
): Promise<string> {
  const id = generateHeuristicId()
  const now = Date.now()
  
  await db.insert(heuristics).values({
    id,
    title: heuristic.title,
    type: heuristic.type,
    triggerCondition: heuristic.triggerCondition,
    action: heuristic.action,
    rationale: heuristic.rationale,
    scope: heuristic.scope ?? 'briefing',
    confidence: heuristic.confidence ?? 'medium',
    timesRetrieved: 0,
    timesRelevant: 0,
    sourceContext: heuristic.sourceContext,
    createdAt: now,
    archived: 0
  })
  
  return id
}

/**
 * List heuristics.
 */
export async function listHeuristics(
  db: AgentWorkstationDB,
  options: { archived?: boolean; limit?: number } = {}
): Promise<Heuristic[]> {
  const result = await db
    .select()
    .from(heuristics)
    .where(options.archived === true ? undefined : eq(heuristics.archived, 0))
    .orderBy(desc(heuristics.createdAt))
    .limit(options.limit ?? 100)
  
  return result.map(r => ({
    id: r.id,
    title: r.title,
    type: r.type as 'failure' | 'success',
    triggerCondition: r.triggerCondition,
    action: r.action,
    rationale: r.rationale,
    scope: r.scope ?? 'briefing',
    confidence: r.confidence as 'high' | 'medium' | 'low',
    timesRetrieved: r.timesRetrieved ?? 0,
    timesRelevant: r.timesRelevant ?? 0,
    sourceContext: r.sourceContext ?? undefined,
    createdAt: r.createdAt,
    archived: r.archived === 1
  }))
}

/**
 * Get a heuristic by ID.
 */
export async function getHeuristic(db: AgentWorkstationDB, id: string): Promise<Heuristic | null> {
  const result = await db
    .select()
    .from(heuristics)
    .where(eq(heuristics.id, id))
  
  if (result.length === 0) return null
  
  const r = result[0]
  return {
    id: r.id,
    title: r.title,
    type: r.type as 'failure' | 'success',
    triggerCondition: r.triggerCondition,
    action: r.action,
    rationale: r.rationale,
    scope: r.scope ?? 'briefing',
    confidence: r.confidence as 'high' | 'medium' | 'low',
    timesRetrieved: r.timesRetrieved ?? 0,
    timesRelevant: r.timesRelevant ?? 0,
    sourceContext: r.sourceContext ?? undefined,
    createdAt: r.createdAt,
    archived: r.archived === 1
  }
}

/**
 * Archive a heuristic.
 */
export async function archiveHeuristic(db: AgentWorkstationDB, id: string): Promise<void> {
  await db
    .update(heuristics)
    .set({ archived: 1 })
    .where(eq(heuristics.id, id))
}

/**
 * Record heuristic retrieval.
 */
export async function recordRetrieval(db: AgentWorkstationDB, id: string): Promise<void> {
  await db
    .update(heuristics)
    .set({ timesRetrieved: sql`${heuristics.timesRetrieved} + 1` })
    .where(eq(heuristics.id, id))
}

/**
 * Record heuristic relevance (user feedback).
 */
export async function recordRelevance(db: AgentWorkstationDB, id: string, relevant: boolean): Promise<void> {
  if (relevant) {
    await db
      .update(heuristics)
      .set({ timesRelevant: sql`${heuristics.timesRelevant} + 1` })
      .where(eq(heuristics.id, id))
  }
}

/**
 * Match heuristics against a task description.
 * Simple text matching - can be enhanced with FTS5.
 */
export async function matchHeuristics(
  db: AgentWorkstationDB,
  taskDescription: string,
  limit: number = 3
): Promise<HeuristicMatch[]> {
  const allHeuristics = await listHeuristics(db, { limit: 100 })
  
  const matches: HeuristicMatch[] = []
  const terms = taskDescription.toLowerCase().split(/\s+/)
  
  for (const h of allHeuristics) {
    const triggerTerms = h.triggerCondition.toLowerCase().split(/\s+/)
    const overlap = terms.filter(t => triggerTerms.some(tt => tt.includes(t) || t.includes(tt))).length
    
    if (overlap > 0) {
      const score = overlap / Math.sqrt(triggerTerms.length)
      matches.push({
        id: h.id,
        triggerCondition: h.triggerCondition,
        action: h.action,
        confidence: h.confidence,
        score
      })
    }
  }
  
  // Sort by score and return top N
  matches.sort((a, b) => b.score - a.score)
  return matches.slice(0, limit)
}

/**
 * Propose heuristics from session reflection.
 */
export interface SessionReflection {
  successes: Array<{ task: string; approach: string }>
  failures: Array<{ task: string; error: string; attempted: string }>
}

export function proposeHeuristics(reflection: SessionReflection): Array<{
  title: string
  type: 'failure' | 'success'
  triggerCondition: string
  action: string
  rationale: string
}> {
  const proposals: Array<{
    title: string
    type: 'failure' | 'success'
    triggerCondition: string
    action: string
    rationale: string
  }> = []
  
  // Learn from failures
  for (const f of reflection.failures) {
    proposals.push({
      title: `Avoid: ${f.error}`,
      type: 'failure',
      triggerCondition: f.task,
      action: `Don't: ${f.attempted}`,
      rationale: `Led to error: ${f.error}`
    })
  }
  
  // Learn from successes
  for (const s of reflection.successes) {
    proposals.push({
      title: `Success: ${s.approach}`,
      type: 'success',
      triggerCondition: s.task,
      action: s.approach,
      rationale: 'Successfully applied in similar context'
    })
  }
  
  return proposals
}
