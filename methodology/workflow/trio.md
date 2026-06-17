# TRIO Protocol

**T**est → **R**ed → **I**mplement → **O**bserve

## The Iron Law

```
The coder NEVER sees the spec. They only see failing tests.
```

## Role Separation (Daemon-Enforced)

| Role | Does | Spawns |
|------|------|--------|
| Planner | Writes spec | test-manager, sprint-manager |
| Test-Manager | Writes tests, verifies RED | — |
| Sprint-Manager | Dispatches coders, runs gates | coder ×3, reviewer |
| Coder | Makes tests pass | — |

## Pipeline Stages

```
plan → test → sprint → review → done | failed
```

Signals: `plan_ready` → `tests_ready` → `sprint_complete` → `review_complete`

## Gate Sequence

### Per Wave (sprint-manager owns):
```
[coder dispatch] → GREEN gate (all visible tests pass)
```

### After All Waves:
```
GREEN → hidden tests → review
```

### Gate Definitions:
| Gate | What | Pass Condition |
|------|------|---------------|
| RED | All tests fail | Exit code ≠ 0, each test has assertion |
| GREEN | All visible tests pass | `npm run test` exit 0 |
| Hidden | Hidden regression tests pass | Hidden test subset passes |
| Review | Reviewer approves | APPROVE in result |

## Test Map

Test-manager generates `test_map.txt`:
```
# visible (60%) — coders see these
packages/core/src/__tests__/plan-parser.test.ts
packages/core/src/__tests__/dag-dispatch.test.ts

# hidden (40%) — regression, coders never see
packages/core/src/__tests__/.hidden/plan-edge-cases.test.ts
packages/core/src/__tests__/.hidden/dispatch-race.test.ts
```

## Retry Budget

- GREEN fail: max 3 coder retries (with failure context in briefing)
- Hidden fail: promote hidden test to visible, re-dispatch coder (max 1)
- Review reject: back to sprint (max 2)
