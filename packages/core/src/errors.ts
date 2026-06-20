/**
 * Error classification and retry logic.
 */
import type { AgentResult } from './types.js'

export type ErrorClass = 'transient' | 'permanent' | 'budget' | 'structural'

export interface ErrorContext {
  attempt: number
  maxRetries: number
  costExceeded?: boolean
  sameErrorRepeated?: boolean
  previousErrors?: string[]
}

/**
 * Classify an error based on result and context.
 */
export function classifyError(
  result: AgentResult,
  context: ErrorContext
): ErrorClass {
  // Budget exceeded
  if (context.costExceeded || result.issues?.some(i => i.includes('budget'))) {
    return 'budget'
  }

  // Structural (needs re-plan)
  if (result.status === 'BLOCKED' && result.issues?.some(i =>
    i.includes('impossible') ||
    i.includes('conflicting') ||
    i.includes('missing dependency')
  )) {
    return 'structural'
  }

  // Permanent (unrecoverable by retry)
  if (result.issues?.some(i =>
    i.includes('permission denied') ||
    i.includes('not found') ||
    i.includes('invalid spec')
  )) {
    return 'permanent'
  }

  // Transient (likely to succeed on retry)
  if (
    result.status === 'FAIL' &&
    context.attempt < context.maxRetries &&
    !context.sameErrorRepeated
  ) {
    return 'transient'
  }

  // Default to permanent after max retries
  return 'permanent'
}

/**
 * Get retry delay with exponential backoff.
 */
export function getRetryDelay(attempt: number, baseDelay: number = 30000): number {
  // 30s, 60s, 120s, ...
  return baseDelay * Math.pow(2, attempt - 1)
}

/**
 * Retry configuration.
 */
export interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
}

/**
 * Execute with retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: Error, attempt: number) => boolean,
  config: RetryConfig = { maxRetries: 3, baseDelay: 30000, maxDelay: 120000 }
): Promise<T> {
  let lastError: Error | undefined
  
  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      if (attempt <= config.maxRetries && shouldRetry(lastError, attempt)) {
        const delay = Math.min(getRetryDelay(attempt, config.baseDelay), config.maxDelay)
        await sleep(delay)
      } else {
        throw lastError
      }
    }
  }
  
  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Circuit breaker for preventing cascading failures.
 */
export class CircuitBreaker {
  private failures: Map<string, { count: number; lastFailure: number }>
  private cooldownMs: number
  private threshold: number

  constructor(options: { cooldownMs?: number; threshold?: number } = {}) {
    this.failures = new Map()
    this.cooldownMs = options.cooldownMs ?? 30000
    this.threshold = options.threshold ?? 3
  }

  /**
   * Check if circuit is open (should block).
   */
  isOpen(key: string): boolean {
    const record = this.failures.get(key)
    if (!record) return false

    // Check if cooldown has passed
    if (Date.now() - record.lastFailure > this.cooldownMs) {
      this.failures.delete(key)
      return false
    }

    return record.count >= this.threshold
  }

  /**
   * Record a failure.
   */
  recordFailure(key: string): void {
    const record = this.failures.get(key)
    if (record) {
      record.count++
      record.lastFailure = Date.now()
    } else {
      this.failures.set(key, { count: 1, lastFailure: Date.now() })
    }
  }

  /**
   * Record a success (reset).
   */
  recordSuccess(key: string): void {
    this.failures.delete(key)
  }

  /**
   * Get status for a key.
   */
  getStatus(key: string): { isOpen: boolean; failures: number; remainingCooldown: number } {
    const record = this.failures.get(key)
    if (!record) {
      return { isOpen: false, failures: 0, remainingCooldown: 0 }
    }

    const remainingCooldown = Math.max(0, this.cooldownMs - (Date.now() - record.lastFailure))
    return {
      isOpen: record.count >= this.threshold && remainingCooldown > 0,
      failures: record.count,
      remainingCooldown
    }
  }
}

/**
 * Error aggregator for detecting repeated errors.
 */
export class ErrorAggregator {
  private errors: Map<string, number>
  private windowMs: number
  private timestamps: Map<string, number[]>

  constructor(windowMs: number = 60000) {
    this.errors = new Map()
    this.windowMs = windowMs
    this.timestamps = new Map()
  }

  /**
   * Record an error.
   */
  record(error: Error): void {
    const key = error.message
    const now = Date.now()
    
    // Update count
    this.errors.set(key, (this.errors.get(key) ?? 0) + 1)
    
    // Update timestamps
    const timestamps = this.timestamps.get(key) ?? []
    timestamps.push(now)
    this.timestamps.set(key, timestamps.filter(t => now - t < this.windowMs))
  }

  /**
   * Check if an error is repeating.
   */
  isRepeating(error: Error, threshold: number = 3): boolean {
    const key = error.message
    const timestamps = this.timestamps.get(key) ?? []
    return timestamps.length >= threshold
  }

  /**
   * Get error frequency.
   */
  getFrequency(error: Error): number {
    const key = error.message
    const timestamps = this.timestamps.get(key) ?? []
    const now = Date.now()
    return timestamps.filter(t => now - t < this.windowMs).length
  }
}
