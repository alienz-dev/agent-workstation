import { describe, it, expect } from 'vitest'
import {
  calculateBlastRadius,
  getReviewerForTier,
  InformationBarrier,
  getDeniedPathsForRole,
  createReviewRequest,
  dispatchReview,
  filterSpecContent
} from './review.js'

describe('calculateBlastRadius', () => {
  it('returns low risk for few files', () => {
    const result = calculateBlastRadius(['src/index.ts', 'src/utils.ts'])
    expect(result.riskLevel).toBe('low')
    expect(result.tier).toBe(1)
  })

  it('returns medium risk for many files', () => {
    const files = Array(15).fill(0).map((_, i) => `src/file${i}.ts`)
    const result = calculateBlastRadius(files)
    expect(result.riskLevel).toBe('medium')
    expect(result.tier).toBe(2)
  })

  it('returns high risk for sensitive files', () => {
    const result = calculateBlastRadius(['.env', 'config/secrets.yml'])
    expect(result.riskLevel).toBe('high')
    expect(result.tier).toBe(3)
    expect(result.sensitiveFiles).toHaveLength(2)
  })
})

describe('getReviewerForTier', () => {
  it('returns correct reviewer for each tier', () => {
    expect(getReviewerForTier(1)).toBe('reviewer-lite')
    expect(getReviewerForTier(2)).toBe('reviewer')
    expect(getReviewerForTier(3)).toBe('architect')
  })
})

describe('InformationBarrier', () => {
  it('blocks denied paths', () => {
    const barrier = new InformationBarrier(['specs/**', '*.test.*'])
    
    expect(barrier.isBlocked('specs/feature.md')).toBe(true)
    expect(barrier.isBlocked('src/index.test.ts')).toBe(true)
    expect(barrier.isBlocked('src/index.ts')).toBe(false)
  })

  it('filters spec content', () => {
    const barrier = new InformationBarrier()
    const content = `
# Introduction
Some intro text.

# Spec
This is the spec content.
It should be removed.

# Other
Other content.
`
    const filtered = barrier.filterContent(content)
    expect(filtered).not.toContain('This is the spec content')
    expect(filtered).toContain('# Introduction')
  })
})

describe('getDeniedPathsForRole', () => {
  it('returns paths for coder', () => {
    const paths = getDeniedPathsForRole('coder')
    expect(paths).toContain('specs/**')
    expect(paths).toContain('constitution.yml')
  })

  it('returns empty for unrestricted roles', () => {
    const paths = getDeniedPathsForRole('researcher')
    expect(paths).toHaveLength(0)
  })
})

describe('createReviewRequest', () => {
  it('creates review request with blast radius', () => {
    const request = createReviewRequest(['src/a.ts', 'src/b.ts'], 'agent-1')
    
    expect(request.id).toMatch(/^review-/)
    expect(request.changes).toHaveLength(2)
    expect(request.blastRadius).toBeDefined()
    expect(request.status).toBe('pending')
  })
})

describe('dispatchReview', () => {
  it('dispatches to correct reviewer based on tier', () => {
    const request = createReviewRequest(['.env'], 'agent-1')
    const dispatch = dispatchReview(request)
    
    expect(dispatch.reviewerRole).toBe('architect')
    expect(dispatch.priority).toBe(1) // High tier = low priority number
  })
})

describe('filterSpecContent', () => {
  it('filters spec for coder', () => {
    const content = `
# Introduction
Intro text.

# Spec: Feature
This is the spec.
## Acceptance Criteria
- Criteria 1

# Other
Other text.
`
    const filtered = filterSpecContent(content, 'coder')
    expect(filtered).not.toContain('This is the spec')
    expect(filtered).toContain('# Introduction')
    expect(filtered).toContain('# Other')
  })

  it('keeps spec for other roles', () => {
    const content = `
# Spec: Feature
This is the spec.
`
    const filtered = filterSpecContent(content, 'planner')
    expect(filtered).toContain('This is the spec')
  })
})
