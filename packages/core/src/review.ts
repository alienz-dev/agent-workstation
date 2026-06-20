/**
 * Review system and information barrier.
 */
import type { SpawnConfig } from './types.js'

export type ReviewTier = 1 | 2 | 3

export interface BlastRadius {
  filesChanged: string[]
  sensitiveFiles: string[]
  riskLevel: 'low' | 'medium' | 'high'
  tier: ReviewTier
}

/**
 * Sensitive file patterns.
 */
const SENSITIVE_PATTERNS = [
  /\.env$/,
  /credentials/i,
  /secrets/i,
  /auth/i,
  /password/i,
  /token/i,
  /api[_-]?key/i,
  /config.*\.yml$/,
  /constitution\.yml$/
]

/**
 * Calculate blast radius for a set of changed files.
 */
export function calculateBlastRadius(
  filesChanged: string[],
  options: { sensitivePatterns?: RegExp[] } = {}
): BlastRadius {
  const patterns = options.sensitivePatterns ?? SENSITIVE_PATTERNS
  
  const sensitiveFiles = filesChanged.filter(f =>
    patterns.some(p => p.test(f))
  )
  
  let riskLevel: 'low' | 'medium' | 'high'
  let tier: ReviewTier
  
  if (sensitiveFiles.length > 0) {
    riskLevel = 'high'
    tier = 3
  } else if (filesChanged.length > 10) {
    riskLevel = 'medium'
    tier = 2
  } else {
    riskLevel = 'low'
    tier = 1
  }
  
  return {
    filesChanged,
    sensitiveFiles,
    riskLevel,
    tier
  }
}

/**
 * Get reviewer role for tier.
 */
export function getReviewerForTier(tier: ReviewTier): string {
  switch (tier) {
    case 1: return 'reviewer-lite'
    case 2: return 'reviewer'
    case 3: return 'architect'
  }
}

/**
 * Information barrier filter.
 */
export class InformationBarrier {
  private deniedPaths: Set<string>
  private deniedPatterns: RegExp[]
  
  constructor(deniedPaths: string[] = [], deniedPatterns: RegExp[] = []) {
    this.deniedPaths = new Set(deniedPaths)
    // Convert glob patterns to regex
    this.deniedPatterns = [
      ...deniedPatterns,
      ...deniedPaths.map(p => globToRegex(p))
    ]
  }
  
  /**
   * Check if a path is blocked.
   */
  isBlocked(path: string): boolean {
    if (this.deniedPaths.has(path)) {
      return true
    }
    
    return this.deniedPatterns.some(p => p.test(path))
  }
  
  /**
   * Filter content to remove blocked sections.
   */
  filterContent(content: string, options: { specMarker?: string } = {}): string {
    const specMarker = options.specMarker ?? '# Spec'
    
    // If content contains spec marker, remove everything from that point
    const markerIndex = content.indexOf(specMarker)
    if (markerIndex >= 0) {
      return content.slice(0, markerIndex).trim()
    }
    
    return content
  }
  
  /**
   * Apply barrier to spawn config.
   */
  applyToConfig(config: SpawnConfig, role: string): SpawnConfig {
    const filtered = { ...config }
    
    // Add denied paths based on role
    const roleDeniedPaths = getDeniedPathsForRole(role)
    filtered.owned_files = filtered.owned_files?.filter(f => !this.isBlocked(f))
    
    return filtered
  }
}

/**
 * Convert glob pattern to regex.
 */
function globToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
  return new RegExp(regex)
}

/**
 * Get denied paths for a role.
 */
export function getDeniedPathsForRole(role: string): string[] {
  switch (role) {
    case 'coder':
      return ['specs/**', '*.spec.*', '*.test.*', 'constitution.yml']
    case 'test-manager':
      return ['specs/**', 'constitution.yml']
    case 'sprint-manager':
      return ['specs/**', 'constitution.yml']
    default:
      return []
  }
}

/**
 * Review request.
 */
export interface ReviewRequest {
  id: string
  changes: string[]
  blastRadius: BlastRadius
  requestedBy: string
  requestedAt: number
  status: 'pending' | 'in-progress' | 'approved' | 'rejected'
  reviewer?: string
  completedAt?: number
  feedback?: string
}

/**
 * Create a review request.
 */
export function createReviewRequest(
  changes: string[],
  requestedBy: string
): ReviewRequest {
  const blastRadius = calculateBlastRadius(changes)
  
  return {
    id: `review-${Date.now()}`,
    changes,
    blastRadius,
    requestedBy,
    requestedAt: Date.now(),
    status: 'pending'
  }
}

/**
 * Dispatch review to appropriate reviewer.
 */
export function dispatchReview(
  request: ReviewRequest
): { reviewerRole: string; priority: number } {
  const reviewerRole = getReviewerForTier(request.blastRadius.tier)
  const priority = 4 - request.blastRadius.tier // Higher tier = lower priority number
  
  return { reviewerRole, priority }
}

/**
 * Spec content filter for information barrier.
 */
export function filterSpecContent(
  content: string,
  role: string
): string {
  // Coders should not see spec content
  if (role === 'coder') {
    // Remove any sections that look like specs
    const lines = content.split('\n')
    const filtered: string[] = []
    let inSpec = false
    
    for (const line of lines) {
      if (line.match(/^#\s+Spec/) || line.match(/^##\s+Acceptance\s+Criteria/)) {
        inSpec = true
        continue
      }
      if (inSpec && line.match(/^#\s+/)) {
        inSpec = false
      }
      if (!inSpec) {
        filtered.push(line)
      }
    }
    
    return filtered.join('\n')
  }
  
  return content
}
