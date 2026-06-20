# Quality Gate: Design

**Type:** visual
**Trigger:** Wave modifies UI files (.tsx, .jsx, .vue, .svelte, .css, .scss, .html)
**Runner:** design-grade.sh

## Gate Execution

```bash
design-grade.sh <screenshot> \
  --html <generated.html> \
  --design-md <project-DESIGN.md> \
  --reference <reference.html>   # optional, from .agents/design/references/
```

## Pass Criteria

| Metric | Threshold | Configurable |
|--------|-----------|---|
| total | >= 6.0 | constitution.yml → gates.design.total_min |
| token_fidelity | >= 8 | constitution.yml → gates.design.token_fidelity_min |
| reference_alignment | >= 5 (when reference provided) | constitution.yml → gates.design.reference_alignment_min |

## Failure Behavior

- First failure: re-dispatch coder with grade feedback (improvements array)
- Second failure: re-dispatch with broader context + anti-patterns list
- Third failure: STOP, escalate to planner with grade history

## Reference Resolution

Priority order:
1. Explicit `--reference` in spawn config
2. `.agents/design/references/<task-name>.html` (auto-matched by task)
3. `.agents/design/references/default.html` (project-wide reference)
4. None — reference_alignment not scored

## Constitution Configuration

```yaml
gates:
  design:
    enabled: true
    total_min: 6.0
    token_fidelity_min: 8
    reference_alignment_min: 5
    max_visual_retries: 2
```
