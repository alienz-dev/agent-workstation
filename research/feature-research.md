# Feature Research: Implementation Best Practices

**Date:** 2026-06-17
**Status:** complete
**Scope:** Concrete recommendations for DAG dispatch, heuristic matching, FTS5 knowledge search, and agent adapter contracts.
**Target:** TypeScript on Node 22, SQLite via better-sqlite3, local only

---

## 1. DAG-Based Task Dispatch

### Recommendation: Use `p-graph` (Microsoft, MIT, v2.0.0, 0 deps)

**Why:** p-graph is purpose-built for DAG execution in TypeScript with concurrency control, priority scheduling, and cycle detection. 23K weekly downloads, maintained by Microsoft. Zero dependencies. Our use case (plan tasks with explicit deps) maps 1:1 to its API.

**Don't roll your own.** You'd reimplement topological sort, concurrency limiting, error propagation, and cycle detection — all of which p-graph handles in ~500 LOC.

### Data Structure

p-graph uses adjacency list internally (edge list externally via `DependencyList`). This is the correct choice for sparse DAGs (plan tasks have 1-3 deps each, not N²).

### Code

```typescript
import { PGraph, type DependencyList, type PGraphNodeRecord } from 'p-graph';

interface PlanTask {
  id: string;
  description: string;
  deps: string[];
  status: 'pending' | 'running' | 'done' | 'failed';
}

function buildGraph(tasks: PlanTask[]): { nodes: PGraphNodeRecord; deps: DependencyList } {
  const nodes: PGraphNodeRecord = {};
  const deps: DependencyList = [];

  for (const task of tasks) {
    nodes[task.id] = {
      run: async () => { await executeTask(task); },
      priority: task.deps.length === 0 ? 10 : 0, // roots first
    };
    for (const dep of task.deps) {
      deps.push([dep, task.id]);
    }
  }
  return { nodes, deps };
}

async function runPlan(tasks: PlanTask[], concurrency = 3): Promise<void> {
  const { nodes, deps } = buildGraph(tasks);
  await new PGraph(nodes, deps).run({ concurrency });
}
```

### Event-Driven Dispatch

**Don't use EventEmitter or RxJS for this.** p-graph already handles "dispatch when unblocked" internally. If you need notifications for UI updates, wrap the `run` callback:

```typescript
import { EventEmitter } from 'node:events';

const bus = new EventEmitter();

nodes[task.id] = {
  run: async () => {
    bus.emit('task:started', task.id);
    await executeTask(task);
    bus.emit('task:done', task.id);
  },
};
```

### Concurrency Control

p-graph's `concurrency` option uses a semaphore pattern — limits parallel `run()` calls without blocking the event loop. Set to 3 for agent spawns (matches our max-children policy).

### How CI/CD Systems Do It

| System | DAG Representation | Execution |
|--------|-------------------|-----------|
| GitHub Actions | `needs:` array per job | Parallel jobs, semaphore for concurrency |
| Tekton | `runAfter:` array per task | Controller watches task completion, dispatches ready tasks |
| Argo | DAG template with `dependencies:` array | Go controller, topological dispatch |

All use adjacency list (dependencies-per-node). All dispatch immediately when deps resolve. Our p-graph approach matches this pattern exactly.

### Rejected Alternatives

| Option | Why Not |
|--------|---------|
| `toposort` npm | Just sorts — no execution, no concurrency control |
| `async-dependency-graph` | Last update 2021, no TypeScript, no concurrency |
| Roll our own | 200+ LOC for what p-graph does in 1 import |
| RxJS Observable DAG | Massive dependency, overkill for task dispatch |

---

## 2. Heuristic Matching (Task → Stored Triggers)

### Recommendation: BM25+TF-IDF hybrid via SQLite FTS5

**Why:** At <200 items with <100ms latency requirement, FTS5 BM25 is sub-millisecond and requires zero external dependencies. The BM25+TF-IDF hybrid improves Top-1 accuracy by 55% over pure BM25 (StackOne benchmark, Feb 2026: 13.7% → 21.3% on tool discovery). For our smaller corpus (50-200 items with short trigger strings), pure FTS5 BM25 is likely sufficient and simpler.

### Why NOT Embeddings

| Approach | Top-1 Accuracy | Latency | Dependencies |
|----------|:-----------:|:-------:|:----------:|
| FTS5 BM25 | ~80%* | <1ms | None (built into SQLite) |
| BM25+TF-IDF hybrid | ~85%* | <1ms | ~200 LOC custom |
| Embeddings (MiniLM-L6) | ~90% | 50-200ms | onnxruntime-node (300MB) |

*Accuracy estimates for our corpus — short trigger strings with domain-specific terms have much higher keyword overlap than the 916-tool benchmark. BM25 excels when corpus items are short and domain-specific.

**Verdict:** Start with FTS5 BM25. If accuracy is insufficient after real-world testing, add TF-IDF weighting (~200 LOC). Only consider embeddings if keyword matching fails on semantic paraphrases (unlikely for developer-authored trigger_conditions).

### Code

```typescript
import Database from 'better-sqlite3';

function setupHeuristicSearch(db: Database.Database): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS heuristic_fts
    USING fts5(trigger_condition, content='heuristics', content_rowid='rowid');

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS heuristic_ai AFTER INSERT ON heuristics BEGIN
      INSERT INTO heuristic_fts(rowid, trigger_condition) VALUES (new.rowid, new.trigger_condition);
    END;
    CREATE TRIGGER IF NOT EXISTS heuristic_ad AFTER DELETE ON heuristics BEGIN
      INSERT INTO heuristic_fts(heuristic_fts, rowid, trigger_condition) VALUES('delete', old.rowid, old.trigger_condition);
    END;
    CREATE TRIGGER IF NOT EXISTS heuristic_au AFTER UPDATE ON heuristics BEGIN
      INSERT INTO heuristic_fts(heuristic_fts, rowid, trigger_condition) VALUES('delete', old.rowid, old.trigger_condition);
      INSERT INTO heuristic_fts(rowid, trigger_condition) VALUES (new.rowid, new.trigger_condition);
    END;
  `);
}

interface HeuristicMatch {
  id: string;
  trigger_condition: string;
  rank: number;
}

function matchHeuristics(db: Database.Database, taskDescription: string, limit = 3): HeuristicMatch[] {
  // Tokenize and build FTS5 query (OR between terms for recall)
  const terms = taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 2);

  if (terms.length === 0) return [];

  const query = terms.join(' OR ');

  return db.prepare(`
    SELECT h.id, h.trigger_condition, rank
    FROM heuristic_fts
    JOIN heuristics h ON h.rowid = heuristic_fts.rowid
    WHERE heuristic_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as HeuristicMatch[];
}
```

### Optional: TF-IDF Boost Layer

If FTS5 BM25 ranking is insufficient, add a re-ranking step:

```typescript
function tfidfRerank(results: HeuristicMatch[], query: string, allDocs: string[]): HeuristicMatch[] {
  const docFreq = new Map<string, number>();
  const N = allDocs.length;

  // Build IDF
  for (const doc of allDocs) {
    const terms = new Set(doc.toLowerCase().split(/\s+/));
    for (const term of terms) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const queryTerms = query.toLowerCase().split(/\s+/);

  // Score each result by TF-IDF
  for (const result of results) {
    const docTerms = result.trigger_condition.toLowerCase().split(/\s+/);
    let tfidfScore = 0;
    for (const qt of queryTerms) {
      const tf = docTerms.filter(t => t === qt).length / docTerms.length;
      const df = docFreq.get(qt) ?? 0;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      tfidfScore += tf * idf;
    }
    // Hybrid: 20% BM25 (rank), 80% TF-IDF
    (result as any).hybridScore = 0.2 * (1 / -result.rank) + 0.8 * tfidfScore;
  }

  return results.sort((a, b) => (b as any).hybridScore - (a as any).hybridScore);
}
```

---

## 3. Local Knowledge Search (SQLite FTS5, Multi-Table)

### Recommendation: Unified FTS virtual table with source_type discriminator

**Why:** Searching each table separately and merging results requires manual rank normalization (BM25 scores aren't comparable across tables with different document lengths). A single unified FTS table gives consistent ranking across all content types.

### Architecture

```
┌─────────────────┐     ┌──────────────────────────────┐
│ issues          │────▶│                              │
│ heuristics      │────▶│  knowledge_fts (FTS5)        │
│ session_history │────▶│  source_type + source_id +   │
│ events          │────▶│  title + body                │
└─────────────────┘     └──────────────────────────────┘
```

### Code

```typescript
import Database from 'better-sqlite3';

function setupKnowledgeSearch(db: Database.Database): void {
  // Unified search index
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_index (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,  -- 'issue' | 'heuristic' | 'session' | 'event'
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      UNIQUE(source_type, source_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts
    USING fts5(
      title,
      body,
      content='knowledge_index',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    -- Keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS ki_ai AFTER INSERT ON knowledge_index BEGIN
      INSERT INTO knowledge_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
    END;
    CREATE TRIGGER IF NOT EXISTS ki_ad AFTER DELETE ON knowledge_index BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
    END;
    CREATE TRIGGER IF NOT EXISTS ki_au AFTER UPDATE ON knowledge_index BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
      INSERT INTO knowledge_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
    END;
  `);
}

interface SearchResult {
  source_type: string;
  source_id: string;
  title: string;
  snippet: string;
  rank: number;
}

function search(db: Database.Database, query: string, opts?: {
  source_type?: string;
  limit?: number;
}): SearchResult[] {
  const limit = opts?.limit ?? 10;
  const typeFilter = opts?.source_type ? 'AND ki.source_type = ?' : '';
  const params: any[] = [query, limit];
  if (opts?.source_type) params.splice(1, 0, opts.source_type);

  return db.prepare(`
    SELECT
      ki.source_type,
      ki.source_id,
      ki.title,
      snippet(knowledge_fts, 1, '<b>', '</b>', '...', 32) as snippet,
      rank
    FROM knowledge_fts
    JOIN knowledge_index ki ON ki.rowid = knowledge_fts.rowid
    WHERE knowledge_fts MATCH ?
    ${typeFilter}
    ORDER BY rank
    LIMIT ?
  `).all(...params) as SearchResult[];
}
```

### Indexing Strategy

Populate `knowledge_index` when source tables change:

```typescript
function indexIssue(db: Database.Database, issue: { id: string; title: string; body: string }): void {
  db.prepare(`
    INSERT OR REPLACE INTO knowledge_index (source_type, source_id, title, body)
    VALUES ('issue', ?, ?, ?)
  `).run(issue.id, issue.title, issue.body);
}

function indexHeuristic(db: Database.Database, h: { id: string; trigger_condition: string; lesson: string }): void {
  db.prepare(`
    INSERT OR REPLACE INTO knowledge_index (source_type, source_id, title, body)
    VALUES ('heuristic', ?, ?, ?)
  `).run(h.id, h.trigger_condition, h.lesson);
}

function indexSession(db: Database.Database, s: { id: string; summary: string; details: string }): void {
  db.prepare(`
    INSERT OR REPLACE INTO knowledge_index (source_type, source_id, title, body)
    VALUES ('session', ?, ?, ?)
  `).run(s.id, s.summary, s.details);
}
```

### Why Not Alternatives

| Option | Why Not |
|--------|---------|
| Tantivy (via napi-rs) | Native binary, complex build, overkill for 1000 items |
| MeiliSearch | Separate process, HTTP overhead, operational complexity |
| Search tables separately + merge | BM25 scores not comparable across tables |
| Embeddings + vector search | 200ms latency, 300MB dependency, unnecessary at this scale |

### Performance at Scale

FTS5 benchmarks for our scale:
- 1,000 documents: <1ms query time
- 10,000 documents: ~2ms query time
- Index size: ~2x original text (acceptable for local SQLite)
- `tokenize='porter unicode61'`: stemming ("running" matches "run") + unicode support

---

## 4. Agent Adapter Contracts

### Recommendation: File-based contract with adapter-specific launch commands

Every adapter implements the same interface:

```typescript
interface AgentAdapter {
  /** Build the shell command to launch the agent */
  buildCommand(config: SpawnConfig, briefingPath: string): string[];

  /** Environment variables to inject */
  getEnv(config: SpawnConfig): Record<string, string>;

  /** How to detect completion */
  completionStrategy: 'process-exit' | 'file-watch' | 'both';

  /** Parse result from agent output */
  parseResult(resultPath: string): AgentResult | null;
}
```

### Adapter: kiro-cli

```typescript
const kiroAdapter: AgentAdapter = {
  buildCommand(config, briefingPath) {
    const args = ['kiro', 'chat'];
    if (config.headless) args.push('--headless');
    args.push('--initial-prompt', `$(cat ${briefingPath})`);
    if (config.model) args.push('--model', config.model);
    if (config.workdir) args.push('--cwd', config.workdir);
    return args;
  },

  getEnv(config) {
    return {
      KIRO_RESULT_PATH: config.resultPath,
      KIRO_SESSION_ID: config.sessionId,
      ...(config.env ?? {}),
    };
  },

  completionStrategy: 'both', // process exit + result file

  parseResult(resultPath) {
    // Reads the standard result format (## Status / ## Summary / etc.)
    return parseStandardResult(resultPath);
  },
};
```

**kiro-cli launch pattern** (from kiro-sub.sh patterns):
```bash
kiro chat --headless --initial-prompt "$(cat /tmp/briefing.md)" --cwd /project
```

### Adapter: aider

```typescript
const aiderAdapter: AgentAdapter = {
  buildCommand(config, briefingPath) {
    // aider --message mode: processes one instruction then exits
    const args = ['aider', '--message-file', briefingPath, '--yes', '--no-stream'];
    if (config.model) args.push('--model', config.model);
    // Add files from owned_files
    for (const f of config.owned_files ?? []) args.push(f);
    return args;
  },

  getEnv(config) {
    return {
      AIDER_AUTO_COMMITS: 'true',
      ...(config.env ?? {}),
    };
  },

  completionStrategy: 'process-exit', // aider --message exits when done

  parseResult(resultPath) {
    // aider doesn't write structured results — we generate from git diff
    return parseGitDiffResult(config.workdir);
  },
};
```

**Key facts about aider:**
- `--message` / `-m`: single instruction, processes then exits (exit 0 = success)
- `--message-file` / `-f`: same but reads from file
- `--yes`: auto-approve all changes
- `--no-stream`: faster for scripting (no streaming overhead)
- No structured output format — detect success via exit code + git log

### Adapter: claude-code

```typescript
const claudeCodeAdapter: AgentAdapter = {
  buildCommand(config, briefingPath) {
    // claude CLI in headless/print mode for automation
    const args = ['claude', '--print', '--output-format', 'json'];
    if (config.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }
    // Pass prompt via stdin or --prompt
    args.push('--prompt', `$(cat ${briefingPath})`);
    if (config.workdir) args.push('--cwd', config.workdir);
    if (config.model) args.push('--model', config.model);
    return args;
  },

  getEnv(config) {
    return {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
      ...(config.env ?? {}),
    };
  },

  completionStrategy: 'process-exit', // --print exits after response

  parseResult(resultPath) {
    // claude --print --output-format json outputs JSON with result field
    const raw = readFileSync(resultPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { status: 'PASS', summary: parsed.result, changes: [], verification: {} };
  },
};
```

**Key facts about claude-code:**
- `--print` / `-p`: non-interactive, outputs response then exits
- `--output-format json`: structured JSON output with `result` field
- `--dangerously-skip-permissions`: auto-approves all tool use (use in sandboxed environments)
- Exit codes: 0 = success, 1 = error
- **Agent SDK** (TypeScript/Python): programmatic alternative — `query()` returns async iterator of messages. Better for long-running integration.

### Adapter: Generic (any CLI agent)

```typescript
const genericAdapter: AgentAdapter = {
  buildCommand(config, briefingPath) {
    // Expects agent to read AW_BRIEFING_PATH env var
    return [config.command ?? config.agent, ...config.args ?? []];
  },

  getEnv(config) {
    return {
      AW_BRIEFING_PATH: config.briefingPath,
      AW_RESULT_PATH: config.resultPath,
      AW_TASK: config.task,
      AW_SESSION_ID: config.sessionId,
      AW_WORKDIR: config.workdir ?? process.cwd(),
      ...(config.env ?? {}),
    };
  },

  completionStrategy: 'both',

  parseResult(resultPath) {
    return parseStandardResult(resultPath);
  },
};
```

**Generic contract for unknown agents:**
- Read task from `AW_BRIEFING_PATH` (markdown file)
- Write result to `AW_RESULT_PATH` (standard format)
- Working directory set via `AW_WORKDIR`
- Session identified by `AW_SESSION_ID`

### Completion Detection

```typescript
import { watch } from 'node:fs';

interface CompletionWatcher {
  waitForCompletion(paneId: string, resultPath: string, timeout: number): Promise<AgentResult>;
}

async function waitForCompletion(
  paneId: string,
  resultPath: string,
  timeout: number
): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Agent timeout after ${timeout}ms`));
    }, timeout);

    // Strategy 1: Watch for result file creation
    const watcher = watch(dirname(resultPath), (event, filename) => {
      if (filename === basename(resultPath)) {
        cleanup();
        resolve(parseStandardResult(resultPath));
      }
    });

    // Strategy 2: Subscribe to pane exit via Zellij
    const sub = subscribeToPane(paneId, (event) => {
      if (event.type === 'pane_closed') {
        // Give 500ms for file flush, then check result
        setTimeout(() => {
          cleanup();
          if (existsSync(resultPath)) {
            resolve(parseStandardResult(resultPath));
          } else {
            reject(new Error('Agent exited without writing result'));
          }
        }, 500);
      }
    });

    function cleanup() {
      clearTimeout(timer);
      watcher.close();
      sub.unsubscribe();
    }
  });
}
```

### Zellij Pane Monitoring (via `zellij subscribe`)

```typescript
import { spawn } from 'node:child_process';

function subscribeToPane(paneId: string, onEvent: (e: any) => void) {
  // zellij subscribe --pane-id terminal_N --format json
  // Emits: {"event":"pane_update",...} and {"event":"pane_closed","pane_id":"terminal_N"}
  const proc = spawn('zellij', ['subscribe', '--pane-id', paneId, '--format', 'json']);

  let buffer = '';
  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.trim()) {
        try { onEvent(JSON.parse(line)); } catch {}
      }
    }
  });

  return {
    unsubscribe() { proc.kill(); },
  };
}
```

### Timeout + Force-Kill Pattern

```typescript
async function spawnWithTimeout(config: SpawnConfig): Promise<AgentResult> {
  const timeout = (config.timeout ?? 1800) * 1000; // default 30min

  try {
    return await waitForCompletion(config.paneId, config.resultPath, timeout);
  } catch (err) {
    if (err.message.includes('timeout')) {
      // Force-kill the pane
      execSync(`zellij action close-pane --pane-id ${config.paneId}`);
      return {
        status: 'FAIL',
        summary: `Agent timed out after ${config.timeout}s`,
        changes: [],
        verification: { command: 'timeout', output: '', exit_code: 124 },
        decisions: {},
      };
    }
    throw err;
  }
}
```

---

## Summary of Recommendations

| Feature | Recommendation | Dependency | Latency |
|---------|---------------|-----------|---------|
| DAG dispatch | `p-graph` (Microsoft) | 1 npm package, 0 transitive deps | <1ms dispatch |
| Heuristic matching | SQLite FTS5 BM25 | None (built into better-sqlite3) | <1ms |
| Knowledge search | Unified FTS5 virtual table | None | <5ms for 1000 docs |
| Agent adapters | File-based contract + adapter pattern | None | N/A |

### Key Decisions

1. **p-graph over custom DAG** — Microsoft-maintained, TypeScript-native, handles concurrency + priority + error propagation
2. **FTS5 BM25 over embeddings** — Sub-ms latency, zero dependencies, sufficient accuracy for short domain-specific triggers
3. **Unified FTS table over per-table search** — Consistent BM25 ranking across content types, single query path
4. **File-based adapter contract** — `AW_BRIEFING_PATH` / `AW_RESULT_PATH` env vars work for any agent, known agents get optimized adapters
5. **Dual completion detection** — File watch + pane exit subscription covers both well-behaved (writes result) and crashed (pane exits without result) agents
