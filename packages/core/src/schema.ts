/**
 * Drizzle-orm schema for Agent Workstation.
 * See research/feature-enrichment.md §2 for full documentation.
 */
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  role: text('role').notNull(),
  status: text('status').notNull().default('initializing'),
  adapter: text('adapter').notNull().default('kiro'),
  task: text('task').notNull(),
  parentId: text('parent_id'),
  spawnConfig: text('spawn_config'),
  resultPath: text('result_path'),
  resultStatus: text('result_status'),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  lastHeartbeat: integer('last_heartbeat'),
  paneId: text('pane_id'),
  sessionName: text('session_name').notNull()
})

export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  sourceFile: text('source_file'),
  status: text('status').notNull().default('loaded'),
  createdAt: integer('created_at').notNull()
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull().references(() => plans.id),
  title: text('title').notNull(),
  description: text('description'),
  role: text('role').notNull(),
  deps: text('deps').notNull().default('[]'),
  status: text('status').notNull().default('pending'),
  wave: integer('wave'),
  agentId: text('agent_id'),
  resultStatus: text('result_status'),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at')
})

export const issues = sqliteTable('issues', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  type: text('type').notNull().default('bug'),
  severity: text('severity').default('P2'),
  status: text('status').notNull().default('open'),
  project: text('project'),
  body: text('body'),
  filePath: text('file_path'),
  linkedTaskId: text('linked_task_id'),
  linkedAgentId: text('linked_agent_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at')
})

export const heuristics = sqliteTable('heuristics', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  type: text('type').notNull().default('failure'),
  triggerCondition: text('trigger_condition').notNull(),
  action: text('action').notNull(),
  rationale: text('rationale').notNull(),
  scope: text('scope').default('briefing'),
  confidence: text('confidence').default('medium'),
  timesRetrieved: integer('times_retrieved').default(0),
  timesRelevant: integer('times_relevant').default(0),
  sourceContext: text('source_context'),
  createdAt: integer('created_at').notNull(),
  archived: integer('archived').default(0)
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  summary: text('summary'),
  agentsSpawned: integer('agents_spawned').default(0),
  tasksCompleted: integer('tasks_completed').default(0)
})

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  payload: text('payload'),
  agentId: text('agent_id'),
  timestamp: integer('timestamp').notNull()
})

export const fileClaims = sqliteTable('file_claims', {
  path: text('path').primaryKey(),
  agentId: text('agent_id').notNull(),
  claimedAt: integer('claimed_at').notNull()
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  fromAgent: text('from_agent'),
  toRole: text('to_role'),
  toAgent: text('to_agent'),
  content: text('content').notNull(),
  status: text('status').default('pending'),
  createdAt: integer('created_at').notNull(),
  deliveredAt: integer('delivered_at')
})

export const pipelineState = sqliteTable('pipeline_state', {
  sessionName: text('session_name').primaryKey(),
  currentStage: text('current_stage').notNull().default('plan'),
  updatedAt: integer('updated_at').notNull()
})
