/**
 * @agent-workstation/core
 * Types, state management, orchestration, and briefing construction.
 */

export * from './types.js'
export { DaemonClient } from './daemon-client.js'
export type { DaemonInfo, SpawnResult, AgentInfo, ClaimInfo, MessageInfo } from './daemon-client.js'
export * as schema from './schema.js'
export { createDatabase, createTestDatabase } from './database.js'
export type { AgentWorkstationDB } from './database.js'
export {
  createPluginRegistry,
  registerPlugin,
  getPlugin,
  getPlugins,
  getCommand,
  getCommands,
  initializePlugins,
  notifySessionStart,
  notifySessionEnd,
  notifyAgentDone
} from './plugins.js'
export type { PluginRegistry } from './plugins.js'
export {
  parsePlan,
  parsePlanFile,
  validateNoCycles,
  getPlanStatus,
  findReadyTasks,
  findBlockedTasks
} from './plan.js'
export type { ParsedTask, ParsedPlan } from './plan.js'
export {
  buildTaskGraph,
  dispatchPlan,
  dispatchTask,
  cancelPlan,
  EventDispatcher
} from './dispatch.js'
export type { DispatchContext, DispatchResult } from './dispatch.js'
export {
  classifyError,
  getRetryDelay,
  withRetry,
  CircuitBreaker,
  ErrorAggregator
} from './errors.js'
export type { ErrorClass, ErrorContext, RetryConfig } from './errors.js'
export {
  generateHeuristicId,
  addHeuristic,
  listHeuristics,
  getHeuristic,
  archiveHeuristic,
  recordRetrieval,
  recordRelevance,
  matchHeuristics,
  proposeHeuristics
} from './heuristics.js'
export type { Heuristic, HeuristicMatch, SessionReflection } from './heuristics.js'
export {
  buildBriefing,
  formatBriefing,
  writeBriefing,
  getBriefingPath,
  parseResult,
  validateResult,
  readResult,
  loadRoleDefinition
} from './briefing.js'
export type { BriefingContext, RoleDefinition, ParsedResult } from './briefing.js'
export {
  parseConstitution,
  buildDefaultTransitions,
  loadConstitution,
  PipelineFSM,
  SpawnPolicy
} from './pipeline.js'
export type { FSMState, FSMResult } from './pipeline.js'
export {
  runGate,
  runGates,
  BUILTIN_GATES,
  getGateConfig,
  allGatesPassed,
  getFailedGates,
  checkTimingBudget,
  DEFAULT_TIMING_BUDGET
} from './gates.js'
export type { GateType, GateConfig, GateResult, GateRunnerOptions, TimingBudget } from './gates.js'
export {
  calculateBlastRadius,
  getReviewerForTier,
  InformationBarrier,
  getDeniedPathsForRole,
  createReviewRequest,
  dispatchReview,
  filterSpecContent
} from './review.js'
export type { ReviewTier, BlastRadius, ReviewRequest } from './review.js'
export {
  IssueStore,
  createIssuePlugin
} from './issues.js'
export type { IssueFilter, IssueUpdate } from './issues.js'
export type { Issue, IssueState, IssuePriority, IssueType, IssueLink } from './types.js'
export {
  KnowledgeStore,
  formatContextPackage
} from './knowledge.js'
export type { KnowledgeResult, KnowledgeSearchOptions, SessionRecord, ContextPackage } from './knowledge.js'
export {
  GitOperations,
  CIMode
} from './devops.js'
export type { GitStatus, WorktreeInfo, CommitInfo, CIResult } from './devops.js'
export {
  CDPWrapper,
  BrowserController,
  createBrowserPlugin
} from './browser.js'
export type { BrowserTab, ElementInfo, ScreenshotResult, NavigationResult, CDPCommand, CDPResponse } from './browser.js'
export {
  loadConfig,
  findConfigFile,
  resolveDatabasePath,
  createDefaultConfig
} from './config.js'
export type { Config } from './config.js'
export {
  spawnAgentProcess,
  waitForAgent,
  killAgent,
  isAgentRunning,
  runAgent
} from './spawn.js'
export type { AgentProcess, SpawnOptions } from './spawn.js'
