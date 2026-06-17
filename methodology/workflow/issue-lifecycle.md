# Issue Lifecycle

## States

```
open → triage → in-progress → review → done
                                      → wontfix
       triage → blocked → (unblock) → in-progress
```

## Transitions

| From | To | Trigger |
|------|----|---------|
| open | triage | `aw issue triage` or auto on create |
| triage | in-progress | Agent starts working on it |
| triage | blocked | Dependency identified |
| blocked | in-progress | Blocker resolved |
| in-progress | review | Fix implemented, PR created |
| review | done | Reviewer approves |
| review | in-progress | Reviewer rejects |
| any | wontfix | Won't be fixed (with rationale) |

## Issue Format (markdown)

```yaml
---
id: project#N
title: Description
type: bug | feature | task | research
severity: P0 | P1 | P2 | P3
status: open
created: ISO-date
---

## Description
What's wrong or what's needed.

## Reproduction (bugs)
Steps to reproduce.

## Acceptance Criteria
How do we know it's fixed.
```

## Severity Guide

| Level | Meaning | Response |
|-------|---------|----------|
| P0 | System down, data loss | Immediate |
| P1 | Major feature broken | Same day |
| P2 | Minor issue, workaround exists | This sprint |
| P3 | Cosmetic, nice-to-have | Backlog |
