import { spawn, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: string[]
  unstaged: string[]
  untracked: string[]
  conflicts: string[]
}

export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
}

export interface CommitInfo {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
}

export interface CIResult {
  command: string
  status: 'PASS' | 'FAIL' | 'ERROR'
  output: string
  duration: number
  timestamp: number
}

export class GitOperations {
  private cwd: string

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd
  }

  async status(): Promise<GitStatus> {
    const { stdout } = await execAsync('git status --porcelain=v2 --branch', { cwd: this.cwd })
    
    const lines = stdout.trim().split('\n')
    let branch = ''
    let ahead = 0
    let behind = 0
    const staged: string[] = []
    const unstaged: string[] = []
    const untracked: string[] = []
    const conflicts: string[] = []

    for (const line of lines) {
      if (line.startsWith('# branch.head ')) {
        branch = line.slice(14)
      } else if (line.startsWith('# branch.ab +')) {
        const match = line.match(/# branch.ab \+(\d+) -(\d+)/)
        if (match) {
          ahead = parseInt(match[1], 10)
          behind = parseInt(match[2], 10)
        }
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        const parts = line.split(' ')
        const xy = parts[1]
        const file = parts[parts.length - 1]
        
        if (xy.includes('U')) {
          conflicts.push(file)
        } else if (xy[0] !== '.' && xy[0] !== ' ') {
          staged.push(file)
        } else if (xy[1] !== '.' && xy[1] !== ' ') {
          unstaged.push(file)
        }
      } else if (line.startsWith('? ')) {
        untracked.push(line.slice(2))
      }
    }

    return { branch, ahead, behind, staged, unstaged, untracked, conflicts }
  }

  async branch(name: string, startPoint?: string): Promise<string> {
    let cmd = `git branch ${name}`
    if (startPoint) {
      cmd += ` ${startPoint}`
    }
    await execAsync(cmd, { cwd: this.cwd })
    return name
  }

  async checkout(target: string): Promise<void> {
    await execAsync(`git checkout ${target}`, { cwd: this.cwd })
  }

  async createWorktree(path: string, branch?: string): Promise<WorktreeInfo> {
    let cmd = `git worktree add ${path}`
    if (branch) {
      cmd += ` -b ${branch}`
    }
    await execAsync(cmd, { cwd: this.cwd })
    
    const { stdout } = await execAsync(`git -C ${path} rev-parse --abbrev-ref HEAD`)
    const worktreeBranch = stdout.trim()
    
    const { stdout: commitOut } = await execAsync(`git -C ${path} rev-parse --short HEAD`)
    const commit = commitOut.trim()
    
    return { path, branch: worktreeBranch, commit }
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', { cwd: this.cwd })
      const lines = stdout.trim().split('\n')
      const worktrees: WorktreeInfo[] = []
      
      let current: Partial<WorktreeInfo> = {}
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (current.path) {
            worktrees.push(current as WorktreeInfo)
          }
          current = { path: line.slice(9) }
        } else if (line.startsWith('HEAD ')) {
          current.commit = line.slice(5).slice(0, 7)
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7)
        }
      }
      if (current.path) {
        worktrees.push(current as WorktreeInfo)
      }
      
      return worktrees
    } catch {
      return []
    }
  }

  async removeWorktree(path: string, force: boolean = false): Promise<void> {
    let cmd = `git worktree remove ${path}`
    if (force) {
      cmd += ' --force'
    }
    await execAsync(cmd, { cwd: this.cwd })
  }

  async commit(message: string, files?: string[]): Promise<CommitInfo> {
    if (files && files.length > 0) {
      await execAsync(`git add ${files.join(' ')}`, { cwd: this.cwd })
    }
    
    await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: this.cwd })
    
    const { stdout } = await execAsync('git log -1 --format="%H%n%h%n%s%n%an%n%ai"', { cwd: this.cwd })
    const [hash, shortHash, commitMessage, author, date] = stdout.trim().split('\n')
    
    return { hash, shortHash, message: commitMessage, author, date }
  }

  async log(limit: number = 10): Promise<CommitInfo[]> {
    const { stdout } = await execAsync(
      `git log -${limit} --format="%H%n%h%n%s%n%an%n%ai%n---"`,
      { cwd: this.cwd }
    )
    
    const commits: CommitInfo[] = []
    const blocks = stdout.trim().split('---\n')
    
    for (const block of blocks) {
      if (!block.trim()) continue
      const [hash, shortHash, message, author, date] = block.trim().split('\n')
      if (hash) {
        commits.push({ hash, shortHash, message, author, date })
      }
    }
    
    return commits
  }

  async isClean(): Promise<boolean> {
    const status = await this.status()
    return status.staged.length === 0 &&
           status.unstaged.length === 0 &&
           status.untracked.length === 0 &&
           status.conflicts.length === 0
  }

  async getCurrentBranch(): Promise<string> {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: this.cwd })
    return stdout.trim()
  }

  async getRoot(): Promise<string> {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd: this.cwd })
    return stdout.trim()
  }
}

export class CIMode {
  private cwd: string

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd
  }

  async runTest(): Promise<CIResult> {
    return this.runCommand('test', 'npm test')
  }

  async runLint(): Promise<CIResult> {
    return this.runCommand('lint', 'npm run lint')
  }

  async runTypecheck(): Promise<CIResult> {
    return this.runCommand('typecheck', 'npm run typecheck || npx tsc --noEmit')
  }

  async runBuild(): Promise<CIResult> {
    return this.runCommand('build', 'npm run build')
  }

  async runAll(): Promise<CIResult[]> {
    const results = await Promise.all([
      this.runLint(),
      this.runTypecheck(),
      this.runTest(),
      this.runBuild()
    ])
    return results
  }

  private async runCommand(name: string, command: string): Promise<CIResult> {
    const start = Date.now()
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.cwd,
        timeout: 300000
      })
      
      return {
        command: name,
        status: 'PASS',
        output: stdout + stderr,
        duration: Date.now() - start,
        timestamp: Math.floor(start / 1000)
      }
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; message?: string }
      const output = (err.stdout ?? '') + (err.stderr ?? '')
      
      if (output) {
        return {
          command: name,
          status: 'FAIL',
          output,
          duration: Date.now() - start,
          timestamp: Math.floor(start / 1000)
        }
      }
      
      return {
        command: name,
        status: 'ERROR',
        output: err.message ?? 'Unknown error',
        duration: Date.now() - start,
        timestamp: Math.floor(start / 1000)
      }
    }
  }

  formatJSON(results: CIResult | CIResult[]): string {
    return JSON.stringify(results, null, 2)
  }

  formatSummary(results: CIResult[]): string {
    const lines: string[] = []
    
    for (const r of results) {
      const icon = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '⚠'
      const duration = `${(r.duration / 1000).toFixed(2)}s`
      lines.push(`${icon} ${r.command}: ${r.status} (${duration})`)
    }
    
    const passed = results.filter(r => r.status === 'PASS').length
    const total = results.length
    lines.push('')
    lines.push(`Summary: ${passed}/${total} passed`)
    
    return lines.join('\n')
  }
}
