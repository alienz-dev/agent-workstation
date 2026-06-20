# SDD (Spec-Driven Development) Workflow

Spec-Driven Development ensures all features are specified before implementation.

## Core Principle

**Write the spec first.** Every feature begins with a specification that defines:
- What the feature does (behavior)
- How to verify it works (acceptance criteria)
- What constraints apply (boundaries)

## EARS Notation

Use EARS (Easy Approach to Requirements Syntax) for acceptance criteria:

| Pattern | Example |
|---------|---------|
| **WHEN** ... **THE system SHALL** ... | WHEN user clicks submit THE system SHALL validate the form |
| **IF** ... **THEN** ... | IF validation fails THEN display error messages |
| **WHERE** ... | WHERE max_retries = 3 |
| **WHILE** ... | WHILE processing THE system SHALL show progress |

## Workflow Phases

```
plan → test → sprint → review → done
```

### Phase 1: Plan
- Write spec in `specs/<feature>.md`
- Define acceptance criteria (EARS)
- Identify constraints and dependencies

### Phase 2: Test
- Write tests from acceptance criteria
- Tests MUST fail initially (red)
- No implementation code yet

### Phase 3: Sprint
- Implement to make tests pass
- Minimal code to satisfy criteria
- No gold-plating

### Phase 4: Review
- Code review against spec
- Verify all criteria met
- Check for unintended changes

### Phase 5: Done
- All tests green
- Spec verified
- Documentation updated

## Quality Gates

Each phase transition requires passing a gate:

| Transition | Gate |
|------------|------|
| plan → test | Spec has EARS criteria |
| test → sprint | Tests exist and fail |
| sprint → review | Tests pass |
| review → done | Review approved |

## Information Barrier

Coders do NOT see the spec. They only see:
- Task description
- Test file locations
- Verification command

This prevents implementation bias from spec details.
