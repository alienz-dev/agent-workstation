# Workflow Reference

## Pipeline Stages
```
plan → test → sprint → review → done
```

## SDD Lifecycle
```
Idea → Spec (draft) → Grill → Spec (approved) → Plan → Implement (TDD) → Verify → Ship
```

## EARS Notation (for specs)
| Pattern | Template |
|---------|----------|
| Ubiquitous | THE system SHALL [behavior] |
| Event-driven | WHEN [trigger] THE system SHALL [response] |
| State-driven | WHILE [state] THE system SHALL [behavior] |
| Unwanted | IF [error] THEN THE system SHALL [recovery] |
| Optional | WHERE [config] THE system SHALL [behavior] |

## Agent Roles in This Project

| Role | What They Do Here |
|------|------------------|
| Planner | Write specs, design, create plans |
| Test-manager | Write failing tests from spec (RED gate) |
| Sprint-manager | Dispatch coders, verify GREEN gate |
| Coder | Make tests pass. Minimal code. |
| Reviewer | Adversarial review against spec |
| Researcher | Investigate approaches, write reports |

## Implementation Order
Phase 1 waves: 1.1 bootstrap → 1.2 types → 1.3 daemon → 1.4 client → 1.5 DB → 1.6 plugins → 1.7 methodology

## Verification Commands
```bash
turbo build          # must pass
turbo test           # must pass
turbo typecheck      # must pass
```
