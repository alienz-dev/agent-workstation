# Workflow Reference

## Pipeline
plan → test → sprint → review → done

## SDD Lifecycle
Idea → Spec → Grill → Plan → Test (RED) → Implement → Verify → Ship

## EARS Notation
| Pattern | Template |
|---------|----------|
| Event-driven | WHEN [trigger] THE system SHALL [response] |
| State-driven | WHILE [state] THE system SHALL [behavior] |
| Unwanted | IF [error] THEN THE system SHALL [recovery] |
| Optional | WHERE [config] THE system SHALL [behavior] |

## Verification
```bash
npm run test       # must pass
npm run typecheck  # must pass
```
