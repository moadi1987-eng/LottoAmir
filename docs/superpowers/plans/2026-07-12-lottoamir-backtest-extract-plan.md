# LottoAmir Backtest + Logic Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract combination logic into `js/lotto-combos.js` with Node tests, then add walk-forward backtest and strategy ranking UI.

**Architecture:** Pure sync module (browser global + Node exports). Analyzer HTML loads the script and keeps DOM/PIN/compare. Backtest reuses hit scoring across historical draws with no future leakage.

**Tech Stack:** Static HTML, vanilla JS, Node (`assert`, `fs`), GitHub Pages.

## Global Constraints

- Deterministic combinations for the same draw history
- Form 2 diversity rules preserved
- Walk-forward: history = draws older than target only
- Rename `חיזוי AI` → `ציון משוקלל`
- Do not edit the Cursor plan file

---

### Task 1: Create `js/lotto-combos.js` with analysis + Form 1/2 generators

**Files:**
- Create: `js/lotto-combos.js`
- Read: `lotto_analyzer.html`

- [x] Extract frequency split, pairs/triplets/quartets (sync)
- [x] Extract Form 1 generators + `generateCombinations`
- [x] Extract Form 2 generators + diversification + `generateCombinationsForm2`
- [x] Export `LottoCombos` global and `module.exports`
- [x] Include `createCombo`, `countHits`, `rankStrategies`, `runWalkForwardBacktest`

### Task 2: Wire `lotto_analyzer.html`

**Files:**
- Modify: `lotto_analyzer.html`

- [x] Add `<script src="js/lotto-combos.js"></script>` before inline script
- [x] Remove duplicated bodies; delegate to `LottoCombos`
- [x] Rename AI strategy label to weighted score
- [x] Add backtest ranking card UI

### Task 3: Node tests + fixture

**Files:**
- Create: `tests/fixtures/sample-draws.json`
- Create: `tests/test-lotto-combos.js`
- Modify: `tests/verify-form2-diversity.js` (module-based)

- [x] Fixture with enough synthetic draws for walk-forward
- [x] Assert 28 strategies validity
- [x] Assert Form 2 diversity
- [x] Assert countHits and walk-forward aggregation
- [x] Run: `node tests/test-lotto-combos.js`

### Task 4: Verify

- [x] `node tests/test-lotto-combos.js` passes
- [x] `node tests/verify-form2-diversity.js` passes (if retained)
- [x] Confirm `js/lotto-combos.js` is referenced and present for Pages
