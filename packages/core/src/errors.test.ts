import { describe, it, expect, vi } from 'vitest'
import {
  classifyError,
  getRetryDelay,
  withRetry,
  CircuitBreaker,
  ErrorAggregator
} from './errors.js'
import type { AgentResult } from './types.js'

describe('classifyError', () => {
  const makeResult = (status: AgentResult['status'], issues?: string[]): AgentResult => ({
    status,
    summary: '',
    changes: [],
    verification: { command: '', output: '', exit_code: 0 },
    decisions: {},
    issues
  })

  it('classifies budget errors', () => {
    const result = makeResult('FAIL', ['budget exceeded'])
    const context = { attempt: 1, maxRetries: 3 }
    expect(classifyError(result, context)).toBe('budget')
  })

  it('classifies structural errors', () => {
    const result = makeResult('BLOCKED', ['impossible to implement'])
    const context = { attempt: 1, maxRetries: 3 }
    expect(classifyError(result, context)).toBe('structural')
  })

  it('classifies permanent errors', () => {
    const result = makeResult('FAIL', ['permission denied'])
    const context = { attempt: 1, maxRetries: 3 }
    expect(classifyError(result, context)).toBe('permanent')
  })

  it('classifies transient errors', () => {
    const result = makeResult('FAIL')
    const context = { attempt: 1, maxRetries: 3, sameErrorRepeated: false }
    expect(classifyError(result, context)).toBe('transient')
  })

  it('classifies as permanent after max retries', () => {
    const result = makeResult('FAIL')
    const context = { attempt: 3, maxRetries: 3, sameErrorRepeated: false }
    expect(classifyError(result, context)).toBe('permanent')
  })

  it('classifies as permanent if same error repeated', () => {
    const result = makeResult('FAIL')
    const context = { attempt: 2, maxRetries: 3, sameErrorRepeated: true }
    expect(classifyError(result, context)).toBe('permanent')
  })
})

describe('getRetryDelay', () => {
  it('returns exponential backoff', () => {
    expect(getRetryDelay(1, 1000)).toBe(1000)
    expect(getRetryDelay(2, 1000)).toBe(2000)
    expect(getRetryDelay(3, 1000)).toBe(4000)
  })
})

describe('withRetry', () => {
  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await withRetry(fn, () => true)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success')
    
    const result = await withRetry(fn, () => true, { maxRetries: 3, baseDelay: 10, maxDelay: 100 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    
    await expect(
      withRetry(fn, () => true, { maxRetries: 2, baseDelay: 10, maxDelay: 100 })
    ).rejects.toThrow('fail')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('stops retrying if shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'))
    
    await expect(
      withRetry(fn, () => false, { maxRetries: 3, baseDelay: 10, maxDelay: 100 })
    ).rejects.toThrow('permanent')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('CircuitBreaker', () => {
  it('starts closed', () => {
    const breaker = new CircuitBreaker()
    expect(breaker.isOpen('test')).toBe(false)
  })

  it('opens after threshold failures', () => {
    const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 10000 })
    
    breaker.recordFailure('test')
    expect(breaker.isOpen('test')).toBe(false)
    
    breaker.recordFailure('test')
    expect(breaker.isOpen('test')).toBe(false)
    
    breaker.recordFailure('test')
    expect(breaker.isOpen('test')).toBe(true)
  })

  it('resets on success', () => {
    const breaker = new CircuitBreaker({ threshold: 2 })
    
    breaker.recordFailure('test')
    breaker.recordFailure('test')
    expect(breaker.isOpen('test')).toBe(true)
    
    breaker.recordSuccess('test')
    expect(breaker.isOpen('test')).toBe(false)
  })

  it('closes after cooldown', async () => {
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 10 })
    
    breaker.recordFailure('test')
    expect(breaker.isOpen('test')).toBe(true)
    
    await new Promise(r => setTimeout(r, 20))
    expect(breaker.isOpen('test')).toBe(false)
  })
})

describe('ErrorAggregator', () => {
  it('tracks error frequency', () => {
    const agg = new ErrorAggregator(60000)
    const error = new Error('test error')
    
    agg.record(error)
    agg.record(error)
    agg.record(error)
    
    expect(agg.getFrequency(error)).toBe(3)
  })

  it('detects repeating errors', () => {
    const agg = new ErrorAggregator(60000)
    const error = new Error('test error')
    
    agg.record(error)
    expect(agg.isRepeating(error, 3)).toBe(false)
    
    agg.record(error)
    agg.record(error)
    expect(agg.isRepeating(error, 3)).toBe(true)
  })
})
