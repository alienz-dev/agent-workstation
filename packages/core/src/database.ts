/**
 * Database factory and connection management.
 */
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import * as schema from './schema.js'

export type AgentWorkstationDB = ReturnType<typeof createDatabase>

/**
 * Create or connect to the Agent Workstation database.
 * 
 * @param projectRoot - The project root directory
 * @returns Drizzle database instance
 */
export function createDatabase(projectRoot: string): ReturnType<typeof drizzle<typeof schema>> {
  const agentsDir = join(projectRoot, '.agents')
  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true })
  }
  
  const dbPath = join(agentsDir, 'workstation.db')
  const sqlite = new Database(dbPath)
  
  initializeSchema(sqlite)
  
  return drizzle(sqlite, { schema })
}

/**
 * Initialize the database schema with indexes.
 */
function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'initializing',
      adapter TEXT NOT NULL DEFAULT 'kiro',
      task TEXT NOT NULL,
      parent_id TEXT,
      spawn_config TEXT,
      result_path TEXT,
      result_status TEXT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      last_heartbeat INTEGER,
      pane_id TEXT,
      session_name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_id);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_name);
    
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_file TEXT,
      status TEXT NOT NULL DEFAULT 'loaded',
      created_at INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES plans(id),
      title TEXT NOT NULL,
      description TEXT,
      role TEXT NOT NULL,
      deps TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      wave INTEGER,
      agent_id TEXT,
      result_status TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_plan ON tasks(plan_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'bug',
      severity TEXT DEFAULT 'P2',
      status TEXT NOT NULL DEFAULT 'open',
      project TEXT,
      body TEXT,
      file_path TEXT,
      linked_task_id TEXT,
      linked_agent_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
    CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project);
    
    CREATE TABLE IF NOT EXISTS heuristics (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'failure',
      trigger_condition TEXT NOT NULL,
      action TEXT NOT NULL,
      rationale TEXT NOT NULL,
      scope TEXT DEFAULT 'briefing',
      confidence TEXT DEFAULT 'medium',
      times_retrieved INTEGER DEFAULT 0,
      times_relevant INTEGER DEFAULT 0,
      source_context TEXT,
      created_at INTEGER NOT NULL,
      archived INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_heuristics_archived ON heuristics(archived);
    
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      summary TEXT,
      agents_spawned INTEGER DEFAULT 0,
      tasks_completed INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT,
      agent_id TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    
    CREATE TABLE IF NOT EXISTS file_claims (
      path TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      claimed_at INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      from_agent TEXT,
      to_role TEXT,
      to_agent TEXT,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      delivered_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
    
    CREATE TABLE IF NOT EXISTS pipeline_state (
      session_name TEXT PRIMARY KEY,
      current_stage TEXT NOT NULL DEFAULT 'plan',
      updated_at INTEGER NOT NULL
    );
  `)
}

/**
 * Create an in-memory database for testing.
 */
export function createTestDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  const sqlite = new Database(':memory:')
  initializeSchema(sqlite)
  return drizzle(sqlite, { schema })
}
