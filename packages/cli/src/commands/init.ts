import { defineCommand } from 'citty'
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, copyFileSync } from 'fs'
import { join, basename } from 'path'
import { execSync } from 'child_process'

function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) return
  
  mkdirSync(dest, { recursive: true })
  
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize agent workstation in project'
  },
  args: {
    path: {
      type: 'string',
      alias: 'p',
      description: 'Project path'
    },
    template: {
      type: 'string',
      alias: 't',
      description: 'Template to use'
    },
    'skip-methodology': {
      type: 'boolean',
      description: 'Skip copying methodology templates'
    }
  },
  async run({ args }) {
    const projectPath = typeof args.path === 'string' ? args.path : process.cwd()
    const agentsDir = join(projectPath, '.agents')
    
    console.log(`Initializing Agent Workstation in ${projectPath}`)
    
    if (existsSync(agentsDir)) {
      console.error('ERROR: .agents directory already exists')
      process.exit(1)
    }
    
    mkdirSync(agentsDir, { recursive: true })
    mkdirSync(join(agentsDir, 'roles'), { recursive: true })
    mkdirSync(join(agentsDir, 'workflow'), { recursive: true })
    mkdirSync(join(agentsDir, 'quality'), { recursive: true })
    mkdirSync(join(agentsDir, 'plans'), { recursive: true })
    
    const constitution = `# Agent Workstation Constitution
# See docs for configuration options

workflow:
  states:
    - plan
    - test
    - sprint
    - review
    - done
    - failed
  transitions:
    - from: plan
      to: test
      gate: lint
    - from: test
      to: sprint
      gate: test
    - from: sprint
      to: review
    - from: review
      to: done
      gate: review
    - from: review
      to: sprint
    - from: sprint
      to: failed
    - from: failed
      to: sprint

policies:
  information_barrier: true
  max_fix_cycles: 3
  max_children_per_parent: 5
  rate_limit_per_minute: 10

gates:
  lint:
    command: npm run lint
    timeout: 60000
  test:
    command: npm test
    timeout: 300000
  typecheck:
    command: npm run typecheck
    timeout: 120000
  review:
    command: echo "Review gate"
    timeout: 30000
`
    
    writeFileSync(join(agentsDir, 'constitution.yml'), constitution)
    
    const readme = `# Agent Workstation

This project is managed by Agent Workstation.

## Structure

- \`.agents/constitution.yml\` - Workflow configuration
- \`.agents/roles/\` - Role definitions
- \`.agents/workflow/\` - Workflow documentation
- \`.agents/quality/\` - Quality gates
- \`.agents/plans/\` - Plan files

## Commands

- \`aw status\` - Show workstation status
- \`aw spawn\` - Spawn an agent
- \`aw plan load\` - Load a plan
- \`aw issue open\` - Open an issue

## Documentation

See https://github.com/agent-workstation/aw for full documentation.
`
    
    writeFileSync(join(agentsDir, 'README.md'), readme)
    
    const plannerRole = `# Planner Role

## Purpose
Create implementation plans from specifications.

## Responsibilities
1. Read and understand spec
2. Break down into tasks
3. Identify dependencies
4. Assign roles to tasks
5. Create plan file

## Constraints
- Cannot modify code
- Cannot spawn agents
- Read-only access to spec

## Output
Plan file in .agents/plans/
`
    
    writeFileSync(join(agentsDir, 'roles', 'planner.md'), plannerRole)
    
    const coderRole = `# Coder Role

## Purpose
Implement tasks from plans.

## Responsibilities
1. Read task from plan
2. Read relevant context
3. Write code changes
4. Run verification
5. Write result file

## Constraints
- Information barrier active
- Cannot see spec content
- Limited file access

## Output
Result file with changes and verification
`
    
    writeFileSync(join(agentsDir, 'roles', 'coder.md'), coderRole)
    
    const reviewerRole = `# Reviewer Role

## Purpose
Review code changes for quality.

## Responsibilities
1. Read changes from result
2. Check code quality
3. Verify tests pass
4. Approve or request changes

## Constraints
- Read-only access
- Cannot modify code
- Can see full context

## Output
Review decision with feedback
`
    
    writeFileSync(join(agentsDir, 'roles', 'reviewer.md'), reviewerRole)
    
    if (!args['skip-methodology']) {
      const methodologyPath = join(projectPath, 'methodology')
      if (existsSync(methodologyPath)) {
        console.log('✓ Found methodology directory, copying templates...')
        
        const rolesSrc = join(methodologyPath, 'roles')
        const rolesDest = join(agentsDir, 'roles')
        if (existsSync(rolesSrc)) {
          copyDir(rolesSrc, rolesDest)
          console.log('  ✓ Copied role definitions')
        }
        
        const workflowSrc = join(methodologyPath, 'workflow')
        const workflowDest = join(agentsDir, 'workflow')
        if (existsSync(workflowSrc)) {
          copyDir(workflowSrc, workflowDest)
          console.log('  ✓ Copied workflow docs')
        }
        
        const qualitySrc = join(methodologyPath, 'quality')
        const qualityDest = join(agentsDir, 'quality')
        if (existsSync(qualitySrc)) {
          copyDir(qualitySrc, qualityDest)
          console.log('  ✓ Copied quality gates')
        }
      }
    }
    
    console.log('✓ Created .agents directory')
    console.log('✓ Created constitution.yml')
    console.log('✓ Created README.md')
    console.log('✓ Created role definitions')
    console.log()
    console.log('Next steps:')
    console.log('  1. Edit .agents/constitution.yml to configure your workflow')
    console.log('  2. Add role definitions to .agents/roles/')
    console.log('  3. Run `aw doctor` to verify setup')
    console.log('  4. Run `aw daemon start` to start the daemon')
  }
})

export const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check workstation setup'
  },
  args: {
    fix: {
      type: 'boolean',
      alias: 'f',
      description: 'Attempt to fix issues'
    }
  },
  async run({ args }) {
    console.log('Checking Agent Workstation setup...\n')
    
    const checks: { name: string; status: boolean; message: string }[] = []
    
    checks.push({
      name: 'Node.js',
      status: true,
      message: process.version
    })
    
    try {
      execSync('python3 --version', { stdio: 'pipe' })
      checks.push({
        name: 'Python',
        status: true,
        message: execSync('python3 --version', { encoding: 'utf-8' }).trim()
      })
    } catch {
      checks.push({
        name: 'Python',
        status: false,
        message: 'Not found'
      })
    }
    
    try {
      execSync('aw-daemon --version', { stdio: 'pipe' })
      checks.push({
        name: 'Daemon',
        status: true,
        message: 'Installed'
      })
    } catch {
      checks.push({
        name: 'Daemon',
        status: false,
        message: 'Not found (run: pip install aw-daemon)'
      })
    }
    
    const agentsDir = join(process.cwd(), '.agents')
    if (existsSync(agentsDir)) {
      checks.push({
        name: '.agents directory',
        status: true,
        message: 'Found'
      })
      
      const constitutionPath = join(agentsDir, 'constitution.yml')
      if (existsSync(constitutionPath)) {
        checks.push({
          name: 'Constitution',
          status: true,
          message: 'Found'
        })
      } else {
        checks.push({
          name: 'Constitution',
          status: false,
          message: 'Not found'
        })
      }
    } else {
      checks.push({
        name: '.agents directory',
        status: false,
        message: 'Not found (run: aw init)'
      })
      checks.push({
        name: 'Constitution',
        status: false,
        message: 'Not found'
      })
    }
    
    try {
      execSync('zellij --version', { stdio: 'pipe' })
      checks.push({
        name: 'Zellij',
        status: true,
        message: execSync('zellij --version', { encoding: 'utf-8' }).trim()
      })
    } catch {
      checks.push({
        name: 'Zellij',
        status: false,
        message: 'Not found (optional, for pane management)'
      })
    }
    
    let allPassed = true
    for (const check of checks) {
      const icon = check.status ? '✓' : '✗'
      console.log(`${icon} ${check.name}: ${check.message}`)
      if (!check.status) {
        allPassed = false
      }
    }
    
    console.log()
    if (allPassed) {
      console.log('All checks passed!')
    } else {
      console.log('Some checks failed. Fix the issues above.')
      if (args.fix) {
        console.log('\nAttempting fixes...')
      }
      process.exit(1)
    }
  }
})
