import { describe, it, expect } from 'vitest'
import { DaemonClient } from './daemon-client.js'

describe('DaemonClient', () => {
  it('throws when daemon not running', () => {
    expect(() => DaemonClient.connect('nonexistent-session')).toThrow()
  })

  it('discover throws for missing port file', () => {
    expect(() => DaemonClient.discover('nonexistent-session')).toThrow()
  })
})
