# Pipeline Definition

The pipeline enforces workflow progression and quality gates.

## States

| State | Description |
|-------|-------------|
| `plan` | Spec being written |
| `test` | Tests being written |
| `sprint` | Implementation in progress |
| `review` | Awaiting review |
| `done` | Complete |
| `failed` | Blocked or unrecoverable error |

## Transitions

```yaml
transitions:
  - from: plan
    to: test
    signal: plan_ready
    gate: spec_has_criteria
    
  - from: test
    to: sprint
    signal: tests_ready
    gate: tests_exist_and_fail
    
  - from: sprint
    to: review
    signal: sprint_done
    gate: tests_pass
    
  - from: review
    to: done
    signal: review_approved
    gate: review_passed
    
  - from: sprint
    to: sprint
    signal: retry
    gate: within_retry_limit
    
  - from: review
    to: sprint
    signal: changes_requested
    gate: null
    
  - from: "*"
    to: failed
    signal: unrecoverable_error
    gate: null
```

## Gate Definitions

### spec_has_criteria
- Spec file exists
- Contains EARS-formatted acceptance criteria
- At least one WHEN/IF statement

### tests_exist_and_fail
- Test files exist for the feature
- Running tests exits non-zero
- Tests reference the feature

### tests_pass
- All tests exit zero
- No skipped tests
- Coverage meets threshold (if configured)

### review_passed
- Reviewer approved
- No unresolved comments
- All checklist items passed

### within_retry_limit
- Attempt count < max_fix_cycles
- Different error each attempt (making progress)

## Policies

```yaml
policies:
  information_barrier: true  # Coders don't see spec
  max_fix_cycles: 3          # Max sprint retries
  max_children_per_parent: 3 # Concurrency limit
  rate_limit_per_minute: 5   # Spawn rate limit
```

## Event Log

All transitions are logged to the events table:

```sql
INSERT INTO events (type, payload, timestamp)
VALUES ('pipeline.advanced', '{"from": "plan", "to": "test"}', ?);
```
