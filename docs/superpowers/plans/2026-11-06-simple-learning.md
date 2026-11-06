# Simple Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement inline. Steps use checkbox syntax for tracking.

**Goal:** Ship the clear current-form → winnings → next-form browser workflow with a non-destructive fresh start.

**Architecture:** Reuse current core/report generation and immutable active state. Add atomic archive-and-restart to the existing store, expose it in the controller, and simplify the presentation with advanced details.

**Tech Stack:** Vanilla browser JavaScript, IndexedDB, CSS, Node/Playwright, existing Python tests.

**Spec:** docs/superpowers/specs/2026-11-06-simple-learning-design.md

## Global Constraints

- No PIN/Backtest/data/updater modifications, new dependencies, paid services or background workflow.
- Pending/missing monetary data is not zero; regular Lotto only.
- No automatic reset or historical backfill. Full previous compatible state must survive restart atomically.
- Canonical full source only for active creation. Preserve concurrency, abort, schema and digest guards.

## Review Focus

- Two tabs restarting/settling concurrently must not erase a newly committed form.
- Same draw after reload must not regenerate current numbers.
- Missing prizes and same-day forms must never be described as confirmed zero/verified prospective success.
- Old saved data must render without a migration or auto-reset; archived data must be inspectable/exportable.
- Mobile and embedded shell must show legible numbers and no document-level horizontal overflow.

### Task 1: Simple learning cycle and safe restart

**Files:**
- Modify: lotto-learning-store.js, lotto-learning-controller.js, lotto-learning-ui.js, lotto-learning.css
- Modify: lotto_analyzer.html and Lotto_All_In_One.html only for explicit load integration/navigation/release asset references
- Test: tests/verify-learning-simple-playwright.js (new), relevant existing UI tests
- Documentation: docs/learning-experiment.md

**Interfaces:**
- Store: restart(expectedRevision, transition, {signal, archivedAt}) returns new active state; readArchives() returns archived compatible states with archivedAt.
- Controller: restart() generates first fresh transition from canonical source; readArchives() returns store archives; existing APIs unchanged.
- UI mount(root, controller, {loadSource} = {}) accepts optional callback that resolves after canonical data acceptance. Main refresh awaits loadSource then starts only if no experiment; existing experiment sync happens on ingestion. Restart awaits source and checks errors before confirmation/controller.restart.
- Archive inspection is local read-only, distinct from unverified imported files; export acts on displayed state.

- [x] Write tests for atomic restart preserving exact old snapshot and PIN bytes; stale revision and aborted restart leave state/archive unchanged. Test controller canonical guard.
- [x] Run new tests and observe failure at missing restart behavior.
- [x] Add validated archive records in meta, monotonic restart transaction, and guarded controller API. Run tests green and existing store/controller suites.
- [x] Write browser tests for compact primary current form, pending/zero/missing payouts, readable numbers and collapsed advanced controls, refresh cycle/idempotency, safe restart/archives and responsive layout. Observe failures against old presentation.
- [x] Implement simple presentation and canonical loading callback; keep original algorithms and advanced analysis accessible. Update only intentionally changed presentation assertions in legacy tests.
- [x] Run all tests/*.js with each exit code retained, Python unittest discovery, git diff --check. Inspect desktop/mobile screenshots and resolve regressions.
- [x] Update user documentation; obtain fresh whole-change review. Fix material issues with reproducing tests and rerun gates (23 JS suites and 66 Python tests green).
- [ ] Commit only scoped files. Verify publication separately if authorized/available.

**Commands:** use bundled Node with NODE_PATH, installed Chrome, existing cached SheetJS and Python per docs/learning-experiment.md. New test: node tests/verify-learning-simple-playwright.js. Full JS gate enumerates tests/*.js; Python: python -m unittest discover -s tests -p 'test_*.py' -v. Expected: every suite exits 0.

**Self-review:** One coupled deliverable; all spec requirements covered above. No algorithm change. Fresh start is explicit and non-destructive. User's request to get on with implementation is treated as opting out of further design questions; inline execution avoids another approval loop.
