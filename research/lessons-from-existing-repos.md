# Lessons From Existing Repos — Bugs to Avoid in Clean Build

## Critical Bug Classes (kiro-sessiond)

### 1. Notification Delivery Races
**Bug:** Parent gets notified multiple times for same child completion.
**Root cause:** No dedup guard. Startup orphan cleanup triggered re-notification. Scan loop re-detected already-notified completions.
**Fix in plan:** 
- Task 1.3.13 (Notification) MUST include: one-shot delivery with dedup key, mark-delivered before inject, idempotent notification.
- **Add to acceptance criteria:** "Notification SHALL be delivered exactly once per child completion."

### 2. False HUNG Detection
**Bug:** Agent actively working (thinking, streaming) classified as hung because screen content didn't match "busy" patterns.
**Root cause:** TUI prompt detection was fragile — regex-based, missed edge cases (thinking indicators, streaming output without newlines).
**Fix in plan:**
- Task 1.3.10 (Health monitoring) MUST use heartbeat-based liveness, NOT screen content parsing.
- **Add to acceptance criteria:** "HUNG classification SHALL require heartbeat timeout (5min), NOT viewport content analysis."

### 3. Injection Into Active Agent (TOCTOU)
**Bug:** Daemon injects message into agent pane while user is typing or agent is executing. Corrupts agent state.
**Root cause:** Time-of-check-time-of-use — check viewport is idle, then inject, but state changed between check and inject.
**Fix in plan:**
- Task 1.3.5 (Zellij integration) MUST implement atomic inject with viewport lock or queue-based delivery.
- **Add to acceptance criteria:** "Message injection SHALL NOT occur while agent pane shows active input or execution."

### 4. Orphaned Spawns / Subscriptions
**Bug:** Spawn request created subscription, but pane never launched (or launched and crashed immediately). Subscription never cleaned up. Parent waited forever.
**Root cause:** Subscription created before successful pane launch. No TTL. No reconciliation.
**Fix in plan:**
- Task 1.3.4 (Spawn) — subscription created AFTER pane launch confirmed.
- Task 1.3.12 (Reconciliation) — sweep stale subscriptions on startup.
- **Add to acceptance criteria:** "Subscription SHALL only exist for confirmed running panes. Stale subscriptions SHALL be cleaned within 60s."

### 5. Delivery to Closed Panes
**Bug:** Message delivered to a pane that had already closed. Delivery "succeeded" but nobody received it.
**Root cause:** Agent deregistered between message queue and delivery attempt.
**Fix in plan:**
- Task 1.3.6 (Message queue) — verify pane alive before delivery. On failure → DLQ or re-route.
- **Add to acceptance criteria:** "Message delivery to a non-existent pane SHALL move message to DLQ within one delivery cycle."

### 6. Cross-Session Interference
**Bug:** Daemon watching panes from a different Zellij session. Actions affected wrong session's agents.
**Root cause:** Session scoping was incomplete — some queries didn't filter by session.
**Fix in plan:**
- Task 1.3.1 (HTTP server) — session name is a first-class parameter. ALL queries scoped.
- **Add to acceptance criteria:** "ALL daemon operations SHALL be scoped to the active Zellij session."

---

## Critical Bug Classes (krew-cli)

### 7. Daemon Tick Crash Loops
**Bug:** Unhandled error in one service (health check, delivery, etc.) crashed the entire daemon tick. Daemon restarted, hit same error, loop.
**Root cause:** No service isolation within the tick loop.
**Fix in plan:**
- Task 1.3.1 — each daemon service runs in try/catch. Individual service failure logged + skipped, doesn't crash tick.
- **Add to acceptance criteria:** "Individual service failure within daemon tick SHALL NOT crash the daemon process."

### 8. Stale Registry After Daemon Restart
**Bug:** After restart, registry showed agents from previous session as alive. Commands sent to ghost agents.
**Root cause:** No reconciliation — DB state preserved but Zellij panes were gone.
**Fix in plan:**
- Task 1.3.12 (Reconciliation) handles this directly.
- **Add to acceptance criteria:** "On startup, daemon SHALL verify each registered agent has a live Zellij pane. Dead entries SHALL be marked terminated."

### 9. Worktree Test Flakiness
**Bug:** Parallel tests sharing git state (index.lock, worktree references) caused intermittent failures.
**Root cause:** Tests used shared temp dirs, git operations leaked env vars.
**Fix in plan:**
- Test infrastructure must use isolated temp dirs per test. git env vars cleared.
- **Add to Wave 1.1 task 1.1.3:** "Test isolation: each test gets unique temp dir. No shared git state."

### 10. Planner Spawning Coders Directly
**Bug:** Planner agent bypassed sprint-manager and spawned coders, violating the pipeline hierarchy.
**Root cause:** Spawn policy enforcement was advisory, not daemon-enforced.
**Fix in plan:**
- Task 1.3.9 (Spawn policy) — HARD enforcement. Daemon rejects spawn request if policy violated.
- **Add to acceptance criteria:** "Spawn policy violations SHALL be rejected with HTTP 403, not logged and allowed."

---

## Features That Must Be In Plan (from krew-cli v2)

### 11. Tool Access Matrix
**What:** Each role gets precise tool/path/command restrictions enforced structurally.
**Where in plan:** Task 2.5.3 (Role constraints) — must enforce deniedPaths, allowed tools, blocked commands per role.
**Missing?** Plan mentions "apply deniedPaths" but not tool/command restrictions explicitly.
**Fix:** Add to 2.5.3: "Role constraints SHALL include: deniedPaths (file access), allowedTools (tool whitelist), deniedCommands (command blacklist)."

### 12. Goal System / Continuation
**What:** Persistent goals that survive session restart. Planner auto-respawns with goal context.
**Where in plan:** Not explicitly present. Covered implicitly by heuristics + plan system.
**Assessment:** Defer to v2. Plan system + heuristics cover 80% of the value. Goal system adds complexity without immediate ROI in clean build.

### 13. Behavioral Telemetry
**What:** Agents log all tool calls to JSONL. Daemon evaluates behavior rules, takes action (warn/inject/kill).
**Where in plan:** Not present.
**Assessment:** Important for detecting misbehaving agents. **Add to Phase 3 (Pipeline).**
**Fix:** Add task 3.1.4: "Agent telemetry — log tool calls per agent. Daemon evaluates behavior rules on tick."

### 14. Communication State Machine
**What:** Agent reports state (READY/WORKING/EXITING) to daemon. Delivery only to READY agents.
**Where in plan:** Implied in heartbeat (1.3.10) but not explicit.
**Fix:** Add to 1.3.3 (Agent registry): "Agent state SHALL include: INITIALIZING, READY, WORKING, EXITING. Message delivery gated to READY state only."

### 15. Structured Handoff Protocol
**What:** Zod-validated handoff envelope between orchestrator → worker with signal types.
**Where in plan:** Task 2.5.1 (Briefing generator) covers this.
**Assessment:** Adequate. Briefing format is the handoff.

---

## Features From dev-kit That Must Be In Methodology

### 16. ARIA v2 Research Protocol
**What:** Parallel explorers + adversarial critic for research tasks.
**Where in plan:** Methodology Wave 1.7 should include researcher role with ARIA pattern.
**Fix:** Ensure methodology/roles/ includes researcher + explorer + research-critic with the ARIA flow.

### 17. UI-Designer Autonomous Loop
**What:** Multi-phase design feedback (audit→explore→critique→decide→specify→verify) with scoring.
**Where in plan:** methodology/roles/ — include as role definition.

### 18. Sprint-Manager Retry Logic
**What:** GREEN fail: max 3 retries. Visual fail: max 2. Hidden fail: promote + retry.
**Where in plan:** Task 2.3.2 (Retry logic) covers transient retry. But sprint-manager specific patterns need to be in methodology/roles/sprint-manager.md.
**Fix:** Ensure role definition includes retry budgets per gate type.

---

## Summary: Additions Needed to Plan

| # | Where | What to Add |
|---|-------|-------------|
| 1 | Task 1.3.13 | Exactly-once notification delivery with dedup key |
| 2 | Task 1.3.10 | Heartbeat-based liveness, NOT screen content parsing |
| 3 | Task 1.3.5 | Atomic inject with busy-state hold (no TOCTOU) |
| 4 | Task 1.3.4 | Subscription only after pane launch confirmed |
| 5 | Task 1.3.6 | Verify pane alive before delivery, DLQ on failure |
| 6 | Task 1.3.1 | ALL operations session-scoped |
| 7 | Task 1.3.1 | Service isolation in tick loop (try/catch per service) |
| 8 | Task 1.3.12 | Verify live panes on startup, mark dead entries |
| 9 | Task 1.1.3 | Test isolation: unique temp dirs, no shared git state |
| 10 | Task 1.3.9 | Hard enforcement (HTTP 403), not advisory |
| 11 | Task 2.5.3 | Add allowedTools + deniedCommands to role constraints |
| 12 | — | Deferred (goal system → v2) |
| 13 | NEW 3.1.4 | Agent telemetry + behavior rules |
| 14 | Task 1.3.3 | Agent state machine (INIT/READY/WORKING/EXITING), delivery gated |
| 15 | — | Adequate (briefing = handoff) |
| 16 | Task 1.7.4 | Include researcher + ARIA v2 in role defs |
| 17 | Task 1.7.4 | Include ui-designer with scoring in role defs |
| 18 | Task 1.7.4 | Include sprint-manager retry budgets in role def |
