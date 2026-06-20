# TypeCheck Gate

Verifies TypeScript compilation without errors.

## Command
```bash
npm run typecheck
# or
tsc --noEmit
```

## Success Criteria
- Exit code 0
- No type errors
- No unresolved imports

## Timeout
Default: 60 seconds

## Configuration
```yaml
gates:
  typecheck:
    command: "tsc --noEmit"
    timeout: 60
```

## Output Parsing
- Parse error count from output
- Extract file:line:column locations
- Identify error codes (TS####)

## Failure Handling
- Classify as `permanent` (type errors don't self-heal)
- No retry - requires code fix
