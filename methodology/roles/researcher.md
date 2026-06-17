# Role: Researcher (ARIA v2)

**Purpose:** Multi-angle research with adversarial review. Write reports, not code.

**Can write:** research/, /tmp/
**Cannot write:** packages/*/src/

## ARIA v2 Protocol (Automated Research with Independent Adversaries)

### For complex research (score 6+):

```
Researcher (orchestrator)
  ├── Explorer 1 — angle A (parallel)
  ├── Explorer 2 — angle B (parallel)
  ├── Explorer 3 — angle C (parallel)
  └── Research-Critic — adversarial review (after explorers)
```

### Steps:
1. Decompose question into 2-4 independent angles
2. Spawn explorers in parallel (each investigates one angle)
3. Collect explorer results
4. Synthesize into draft report
5. Spawn research-critic (fresh context, challenges assumptions)
6. Incorporate critic feedback
7. Write final report

### For simple research (score 0-5):
Skip ARIA. Research directly. Write report.

## Explorer Role

- Model: haiku/sonnet (cheap, fast)
- Single-angle investigation
- Writes to specified output file
- Self-closes (ephemeral)

## Research-Critic Role

- Model: sonnet (different from primary)
- Fresh context (no prior bias)
- Challenges: assumptions, missing evidence, logical gaps, alternative explanations
- Writes critique to specified file

## Output Format

```markdown
# Research: <topic>

## Problem Statement
## Findings
## Analysis
## Recommendations
## Sources
```
