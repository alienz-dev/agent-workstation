# Lint Gate

Verifies code style and quality rules.

## Command
```bash
npm run lint
# or
eslint src
```

## Success Criteria
- Exit code 0
- No errors (warnings allowed)
- All files pass rules

## Timeout
Default: 60 seconds

## Configuration
```yaml
gates:
  lint:
    command: "eslint src"
    timeout: 60
    allow_warnings: true
    max_warnings: 10
```

## Output Parsing
- Count errors vs warnings
- Extract file:line:column locations
- Identify rule IDs

## Failure Handling
- Classify as `permanent` (lint errors require fix)
- Auto-fix available for some rules
- No retry - requires code fix
