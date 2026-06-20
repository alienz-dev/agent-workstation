# Test Gate

Verifies that tests pass before allowing pipeline advancement.

## Command
```bash
npm test
```

## Success Criteria
- Exit code 0
- No test failures
- No skipped tests (unless explicitly allowed)

## Timeout
Default: 120 seconds

## Configuration
```yaml
gates:
  test:
    command: "npm test"
    timeout: 120
    allow_skipped: false
```

## Output Parsing
- Look for "passed" in output
- Check for "failed" or "skipped"
- Parse test count

## Failure Handling
- Classify as `transient` if test runner crashed
- Classify as `permanent` if tests are broken
- Retry up to `max_fix_cycles`
