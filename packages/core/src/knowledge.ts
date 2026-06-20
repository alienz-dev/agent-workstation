import type { Issue } from './types.js'
import type { Heuristic } from './heuristics.js'

export interface KnowledgeResult {
  source: 'issue' | 'heuristic' | 'session'
  id: string
  title: string
  content: string
  score: number
  metadata: Record<string, unknown>
}

export interface KnowledgeSearchOptions {
  query: string
  limit?: number
  sources?: Array<'issue' | 'heuristic' | 'session'>
  filters?: {
    state?: string
    type?: string
    tags?: string[]
  }
}

export interface SessionRecord {
  id: string
  agent_id: string
  task: string
  result_status: string
  summary: string
  changes: Array<{ file: string; description: string }>
  started_at: number
  finished_at: number
  metadata: Record<string, unknown>
}

export interface ContextPackage {
  query: string
  results: KnowledgeResult[]
  assembled_at: number
  total_tokens: number
  sources_used: string[]
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  )
}

function bm25Score(
  queryTokens: Set<string>,
  docTokens: Set<string>,
  docLength: number,
  avgDocLength: number,
  k1: number = 1.5,
  b: number = 0.75
): number {
  let score = 0
  for (const term of queryTokens) {
    if (docTokens.has(term)) {
      const tf = 1
      const numerator = tf * (k1 + 1)
      const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength))
      score += numerator / denominator
    }
  }
  return score
}

export class KnowledgeStore {
  private sessions: Map<string, SessionRecord> = new Map()
  private avgSessionLength: number = 100

  addSession(record: SessionRecord): void {
    this.sessions.set(record.id, record)
    this.updateAvgLength()
  }

  private updateAvgLength(): void {
    const lengths = Array.from(this.sessions.values()).map(
      s => (s.task + s.summary).length
    )
    if (lengths.length > 0) {
      this.avgSessionLength = lengths.reduce((a, b) => a + b, 0) / lengths.length
    }
  }

  searchIssues(issues: Issue[], query: string, limit: number = 10): KnowledgeResult[] {
    const queryTokens = tokenize(query)
    const results: KnowledgeResult[] = []

    for (const issue of issues) {
      const text = `${issue.title} ${issue.description}`
      const docTokens = tokenize(text)
      const score = bm25Score(queryTokens, docTokens, text.length, this.avgSessionLength)

      if (score > 0) {
        results.push({
          source: 'issue',
          id: issue.id,
          title: issue.title,
          content: issue.description,
          score,
          metadata: { state: issue.state, type: issue.type, priority: issue.priority }
        })
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  searchHeuristics(heuristics: Heuristic[], query: string, limit: number = 10): KnowledgeResult[] {
    const queryTokens = tokenize(query)
    const results: KnowledgeResult[] = []

    for (const h of heuristics) {
      const text = `${h.triggerCondition} ${h.action}`
      const docTokens = tokenize(text)
      const score = bm25Score(queryTokens, docTokens, text.length, this.avgSessionLength)

      if (score > 0) {
        results.push({
          source: 'heuristic',
          id: h.id,
          title: h.triggerCondition,
          content: h.action,
          score,
          metadata: { confidence: h.confidence, timesRetrieved: h.timesRetrieved }
        })
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  searchSessions(query: string, limit: number = 10): KnowledgeResult[] {
    const queryTokens = tokenize(query)
    const results: KnowledgeResult[] = []

    for (const session of this.sessions.values()) {
      const text = `${session.task} ${session.summary}`
      const docTokens = tokenize(text)
      const score = bm25Score(queryTokens, docTokens, text.length, this.avgSessionLength)

      if (score > 0) {
        results.push({
          source: 'session',
          id: session.id,
          title: session.task,
          content: session.summary,
          score,
          metadata: {
            agent_id: session.agent_id,
            result_status: session.result_status,
            changes: session.changes.length
          }
        })
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  unifiedSearch(
    query: string,
    options: KnowledgeSearchOptions,
    issues?: Issue[],
    heuristics?: Heuristic[]
  ): KnowledgeResult[] {
    const limit = options.limit ?? 10
    const sources = options.sources ?? ['issue', 'heuristic', 'session']
    const results: KnowledgeResult[] = []

    if (sources.includes('issue') && issues) {
      results.push(...this.searchIssues(issues, query, limit))
    }

    if (sources.includes('heuristic') && heuristics) {
      results.push(...this.searchHeuristics(heuristics, query, limit))
    }

    if (sources.includes('session')) {
      results.push(...this.searchSessions(query, limit))
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  assembleContext(
    query: string,
    options: KnowledgeSearchOptions,
    issues?: Issue[],
    heuristics?: Heuristic[]
  ): ContextPackage {
    const results = this.unifiedSearch(query, options, issues, heuristics)
    
    const totalTokens = results.reduce((sum, r) => {
      return sum + Math.ceil((r.title.length + r.content.length) / 4)
    }, 0)

    const sourcesUsed = [...new Set(results.map(r => r.source))]

    return {
      query,
      results,
      assembled_at: Math.floor(Date.now() / 1000),
      total_tokens: totalTokens,
      sources_used: sourcesUsed
    }
  }

  getSession(id: string): SessionRecord | undefined {
    return this.sessions.get(id)
  }

  listSessions(filter?: { agent_id?: string; result_status?: string }): SessionRecord[] {
    let results = Array.from(this.sessions.values())

    if (filter) {
      if (filter.agent_id) {
        results = results.filter(s => s.agent_id === filter.agent_id)
      }
      if (filter.result_status) {
        results = results.filter(s => s.result_status === filter.result_status)
      }
    }

    return results.sort((a, b) => b.finished_at - a.finished_at)
  }

  stats(): {
    total_sessions: number
    by_status: Record<string, number>
    avg_summary_length: number
  } {
    const sessions = Array.from(this.sessions.values())
    const byStatus: Record<string, number> = {}

    for (const s of sessions) {
      byStatus[s.result_status] = (byStatus[s.result_status] ?? 0) + 1
    }

    const avgLength = sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.summary.length, 0) / sessions.length
      : 0

    return {
      total_sessions: sessions.length,
      by_status: byStatus,
      avg_summary_length: avgLength
    }
  }
}

export function formatContextPackage(pkg: ContextPackage): string {
  const lines: string[] = [
    `# Context Package`,
    ``,
    `Query: ${pkg.query}`,
    `Assembled: ${new Date(pkg.assembled_at * 1000).toISOString()}`,
    `Total tokens: ${pkg.total_tokens}`,
    `Sources: ${pkg.sources_used.join(', ')}`,
    ``,
    `## Results (${pkg.results.length})`,
    ``
  ]

  for (const r of pkg.results) {
    lines.push(`### [${r.source}] ${r.title}`)
    lines.push(`Score: ${r.score.toFixed(2)}`)
    lines.push(`ID: ${r.id}`)
    lines.push(``)
    lines.push(r.content)
    lines.push(``)
  }

  return lines.join('\n')
}
