# Gap Assessment: What Else to Bake In

## Already In Place ✅
- Spec (EARS, 36 criteria)
- Constitution (pipeline FSM, gates, role policies)
- Role definitions (6 roles with constraints)
- Agent knowledge (.kiro/rules, architecture, workflow)
- Templates for `aw init`
- Build infrastructure (turborepo, vitest, eslint)
- Implementation plan + feature designs
- Bug mitigations

## Potential Additions

### 1. TRIO Protocol Documentation
**What:** Full TRIO (Test-Red-Implement-Observe) protocol doc with gate sequence, role separation, iron law.
**Verdict: ✅ BAKE IN** — this is core methodology. Without it, agents don't know the gate sequence (GREEN → wiring → visual → hidden → activation → review).
**Where:** `methodology/workflow/trio.md`

### 2. Grill Protocol
**What:** Structured interrogation of a spec before implementation. Walk every branch of the design tree. Challenge fuzzy language.
**Verdict: ✅ BAKE IN** — prevents bad specs from entering the pipeline. A few minutes grilling saves hours of wrong implementation.
**Where:** `methodology/workflow/grill.md`

### 3. Pre-Commit Hook (Affected Tests Only)
**What:** On commit, run only tests affected by changed files (not full suite).
**Verdict: ✅ BAKE IN** — standard quality gate. Dev-kit already has the pattern. Prevents broken commits without slow full-suite runs.
**Where:** `methodology/quality/pre-commit.md` + actual hook script

### 4. Retro Protocol
**What:** On session end, extract patterns (heuristics/issues), classify, store.
**Verdict: ✅ BAKE IN** — already in the spec (criterion 27: post-session reflection). Needs methodology doc so agents know the protocol.
**Where:** `methodology/workflow/retro.md`

### 5. Issue Lifecycle States
**What:** Full state machine for issues: open → triage → in-progress → review → done/wontfix.
**Verdict: ✅ BAKE IN** — already in plan (Wave 4.1) but needs methodology doc for agents to follow.
**Where:** `methodology/workflow/issue-lifecycle.md`

### 6. QA Playbook Template
**What:** After sprint-manager GREEN gate, structured QA verification before review.
**Verdict: ❌ SKIP for v1** — adds complexity. GREEN gate + reviewer is sufficient. QA playbook is a v2 refinement.

### 7. UI Visual Check Gate
**What:** After GREEN, run visual comparison (screenshot → AI grade) for UI projects.
**Verdict: ❌ SKIP for v1** — this project isn't a UI project. Add as optional gate when needed. Plugin can provide it later.

### 8. Agent Learning / ERL (Evolutionary Reinforcement Learning)
**What:** Systematic agent self-improvement beyond simple heuristics.
**Verdict: ❌ SKIP for v1** — heuristic system (FTS5 matching) covers 80%. Full ERL is a research project, not v1 scope.

### 9. Pre-commit Hook Config (lefthook/husky)
**What:** Actual git hook that runs typecheck + affected tests on commit.
**Verdict: ✅ BAKE IN** — simple, high-value, prevents broken commits.
**Where:** Root `.lefthookrc.yml` or `package.json` lint-staged config

### 10. Explainer Skill (visual docs)
**What:** Generate HTML explainers for architecture/decisions.
**Verdict: ❌ SKIP** — already have docs/explainer.html. Skill lives in vault, not baked into every project.

### 11. Debug Log Pattern
**What:** Append bug fixes to a structured log for future reference.
**Verdict: ❌ SKIP for v1** — issues plugin + heuristics cover this. Separate debug log is redundant.

### 12. ARIA v2 Research Protocol
**What:** Parallel explorers + adversarial critic for research tasks.
**Verdict: ✅ BAKE IN** (as methodology doc) — researcher role needs this protocol so agents know how to do multi-angle research.
**Where:** `methodology/roles/researcher.md` (already partially there, needs ARIA detail)

### 13. Briefing Template (for spawned agents)
**What:** Standard template for how briefings should be structured.
**Verdict: ✅ BAKE IN** — agents building briefings need to know the format.
**Where:** `methodology/templates/briefing-template.md`

---

## Summary: Bake In Now

| # | What | Where | Effort |
|---|------|-------|--------|
| 1 | TRIO protocol | methodology/workflow/trio.md | 10 min |
| 2 | Grill protocol | methodology/workflow/grill.md | 5 min |
| 3 | Pre-commit docs | methodology/quality/pre-commit.md | 5 min |
| 4 | Retro protocol | methodology/workflow/retro.md | 5 min |
| 5 | Issue lifecycle | methodology/workflow/issue-lifecycle.md | 5 min |
| 9 | Pre-commit hook config | .lefthookrc.yml | 3 min |
| 12 | ARIA detail in researcher | methodology/roles/researcher.md update | 5 min |
| 13 | Briefing template | methodology/templates/briefing-template.md | 5 min |

## Skip (v2 or unnecessary)

| # | What | Why |
|---|------|-----|
| 6 | QA playbook | GREEN + reviewer sufficient for v1 |
| 7 | UI visual gate | Not a UI project |
| 8 | ERL/agent learning | Heuristics cover 80%, ERL is research |
| 10 | Explainer skill | Vault skill, not per-project |
| 11 | Debug log | Issues + heuristics are enough |
