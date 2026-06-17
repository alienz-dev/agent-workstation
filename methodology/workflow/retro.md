# Retro Protocol

Run at session end or when user invokes `aw retro`.

## Steps

1. **Summarize** — what worked, what went wrong, metrics (tasks completed, failures, time)
2. **Extract candidates** — name each pattern concisely
3. **Classify:**
   - **Heuristic** (agent behavior fix) → `aw heuristic add`
   - **Issue** (code/tooling bug) → `aw issue open`
   - **Drop** (too generic, one-off, already known)
4. **Present & confirm** — show table, execute on approval

## Heuristic Format

```
Title: <concise name>
Trigger: <when does this apply>
Action: <what to do differently>
Rationale: <why this works>
```

## Example

```
Session: Fixed auth middleware
What went wrong: Coder wrote tests after code (bypassed RED gate)
Classification: Heuristic

Title: "Coder must not write test files"
Trigger: "coder role writes to *.test.ts"
Action: "Block via deniedPaths — only test-manager writes tests"
Rationale: "Maintains TRIO iron law"
```

## Metrics to Track
- Tasks completed vs failed
- Retry count per gate
- Total tokens/cost
- Session duration
- Heuristics generated
