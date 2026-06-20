# Review Gate

Verifies code has been reviewed and approved.

## Command
No command - review is a human process.

## Success Criteria
- Reviewer has approved
- All review comments resolved
- Review checklist complete

## Timeout
Default: 86400 seconds (24 hours)

## Configuration
```yaml
gates:
  review:
    timeout: 86400
    require_approval: true
    checklist:
      - "Code matches spec"
      - "Tests cover criteria"
      - "No security issues"
      - "Documentation updated"
```

## Review Tiers

| Tier | Trigger | Reviewer |
|------|---------|----------|
| 1 | Single file, low risk | reviewer-lite |
| 2 | Multiple files, medium risk | reviewer |
| 3 | Critical path, high risk | architect |

## Blast Radius Calculation
- Count files changed
- Check if critical files touched
- Assess risk level

## Failure Handling
- Changes requested → return to sprint
- Timeout → escalate
- Reviewer unavailable → assign alternate
