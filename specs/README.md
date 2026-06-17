# Specs

## Active
- `platform.md` — Full platform spec (36 EARS criteria). THE CONTRACT.

## How to Use Specs

1. Read spec before implementing any feature
2. Each EARS criterion maps to one or more tests
3. Coder agents: you DON'T read specs directly — the test-manager writes tests from the spec
4. Planner/test-manager: you DO read specs to write tests and plans

## Spec Template

```markdown
# Spec: [Feature Name]

## Problem
What problem does this solve?

## Solution
High-level approach.

## Acceptance Criteria (EARS)
1. WHEN [trigger] THE system SHALL [response]
2. WHERE [condition] THE system SHALL [behavior]

## Non-Goals
- What this does NOT do

## Open Questions
- Unresolved decisions
```
