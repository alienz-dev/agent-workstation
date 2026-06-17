# Grill Protocol

Structured interrogation of a spec before it enters the pipeline.

## When to Use
- Before approving any spec
- When acceptance criteria feel vague
- When terms aren't precisely defined

## How It Works

1. Walk every branch of the design tree
2. For each question: provide recommended answer with rationale
3. Challenge against CONTEXT.md glossary — call out term conflicts
4. Sharpen fuzzy language — propose precise canonical terms
5. Session ends when all branches resolved or user says "done"

## Banned Words (trigger rewrite)
- "appropriate" → specify exactly what
- "properly" → define the correct behavior
- "should" → EARS: SHALL
- "handle" → specify the exact response
- "etc." → enumerate all cases

## Output
After grill completes:
1. Updated spec with sharpened language
2. Decisions summary (what was resolved)
3. Clarifications section (for the plan)

## Example
```
Spec says: "THE system SHALL handle errors appropriately"
Grill: What errors? Network timeout? Auth failure? Invalid input? 
       What does "appropriately" mean for each?
Result: 
  - IF network timeout THEN THE system SHALL retry with 30s backoff (max 3)
  - IF auth failure THEN THE system SHALL return 401 and log event
  - IF invalid input THEN THE system SHALL return 400 with field-level errors
```
