import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GitOperations, CIMode } from './devops.js'
import { execSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { realpathSync } from 'fs'

describe('GitOperations', () => {
  let testDir: string

  beforeAll(() => {
    testDir = realpathSync(mkdtempSync(join(tmpdir(), 'git-test-')))
    execSync('git init', { cwd: testDir })
    execSync('git config user.email "test@test.com"', { cwd: testDir })
    execSync('git config user.name "Test"', { cwd: testDir })
    execSync('echo "init" > README.md && git add README.md && git commit -m "init"', { cwd: testDir })
  })

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('status', () => {
    it('returns git status', async () => {
      const git = new GitOperations(testDir)
      const status = await git.status()

      expect(status.branch).toBeDefined()
      expect(Array.isArray(status.staged)).toBe(true)
      expect(Array.isArray(status.unstaged)).toBe(true)
      expect(Array.isArray(status.untracked)).toBe(true)
    })

    it('detects untracked files', async () => {
      execSync('touch untracked.txt', { cwd: testDir })
      const git = new GitOperations(testDir)
      const status = await git.status()

      expect(status.untracked).toContain('untracked.txt')
      execSync('rm untracked.txt', { cwd: testDir })
    })
  })

  describe('branch operations', () => {
    it('creates a branch', async () => {
      const git = new GitOperations(testDir)
      const name = await git.branch('test-branch')
      expect(name).toBe('test-branch')
    })

    it('gets current branch', async () => {
      const git = new GitOperations(testDir)
      const branch = await git.getCurrentBranch()
      expect(branch).toBeDefined()
    })
  })

  describe('commit', () => {
    it('commits changes', async () => {
      execSync('echo "test" > file.txt', { cwd: testDir })
      const git = new GitOperations(testDir)
      const commit = await git.commit('Test commit', ['file.txt'])

      expect(commit.shortHash).toBeDefined()
      expect(commit.message).toBe('Test commit')
      expect(commit.author).toBe('Test')
    })

    it('gets commit log', async () => {
      const git = new GitOperations(testDir)
      const log = await git.log(5)

      expect(log.length).toBeGreaterThan(0)
      expect(log[0].shortHash).toBeDefined()
      expect(log[0].message).toBeDefined()
    })
  })

  describe('worktree', () => {
    it('lists worktrees', async () => {
      const git = new GitOperations(testDir)
      const worktrees = await git.listWorktrees()

      expect(Array.isArray(worktrees)).toBe(true)
      expect(worktrees.length).toBeGreaterThan(0)
    })
  })

  describe('isClean', () => {
    it('checks if repo is clean', async () => {
      const git = new GitOperations(testDir)
      const clean = await git.isClean()
      expect(typeof clean).toBe('boolean')
    })
  })

  describe('getRoot', () => {
    it('gets git root', async () => {
      const git = new GitOperations(testDir)
      const root = await git.getRoot()
      expect(root).toBe(testDir)
    })
  })
})

describe('CIMode', () => {
  let testDir: string

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'ci-test-'))
    execSync('npm init -y', { cwd: testDir })
  })

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('formatJSON', () => {
    it('formats single result as JSON', () => {
      const ci = new CIMode(testDir)
      const result = {
        command: 'test',
        status: 'PASS' as const,
        output: 'All tests passed',
        duration: 1000,
        timestamp: 1000000
      }

      const json = ci.formatJSON(result)
      const parsed = JSON.parse(json)

      expect(parsed.command).toBe('test')
      expect(parsed.status).toBe('PASS')
    })

    it('formats multiple results as JSON', () => {
      const ci = new CIMode(testDir)
      const results = [
        { command: 'lint', status: 'PASS' as const, output: '', duration: 500, timestamp: 1000000 },
        { command: 'test', status: 'FAIL' as const, output: '1 failed', duration: 2000, timestamp: 1000500 }
      ]

      const json = ci.formatJSON(results)
      const parsed = JSON.parse(json)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(2)
    })
  })

  describe('formatSummary', () => {
    it('formats summary', () => {
      const ci = new CIMode(testDir)
      const results = [
        { command: 'lint', status: 'PASS' as const, output: '', duration: 500, timestamp: 1000000 },
        { command: 'test', status: 'FAIL' as const, output: '1 failed', duration: 2000, timestamp: 1000500 },
        { command: 'build', status: 'PASS' as const, output: '', duration: 3000, timestamp: 1002500 }
      ]

      const summary = ci.formatSummary(results)

      expect(summary).toContain('✓ lint: PASS')
      expect(summary).toContain('✗ test: FAIL')
      expect(summary).toContain('✓ build: PASS')
      expect(summary).toContain('Summary: 2/3 passed')
    })
  })

  describe('runCommand', () => {
    it('handles missing command gracefully', async () => {
      const ci = new CIMode(testDir)
      const result = await ci.runTest()

      expect(result.command).toBe('test')
      expect(['PASS', 'FAIL', 'ERROR']).toContain(result.status)
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })
  })
})
