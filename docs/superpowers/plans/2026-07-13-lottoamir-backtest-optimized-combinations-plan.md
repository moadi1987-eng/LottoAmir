# LottoAmir Honest Backtest and Optimized Combinations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, leak-free full-history Backtest workspace and use its calibrated strategy rankings to provide validated optimized versions of both existing 14-line forms without breaking PIN, comparison, save/load, or transfer behavior.

**Architecture:** Extract the existing deterministic statistics and 28 strategy recipes into one shared UMD-style `lotto-strategy-core.js` used by the analyzer, Node tests, and a Web Worker. The worker performs chronological walk-forward evaluation in 100, 200, and 500-draw windows; the analyzer caches compact results, builds optimized current forms, and switches between baseline and improved form snapshots through the existing combination globals. `Lotto_All_In_One.html` exposes a dedicated Backtest workspace while keeping the static GitHub Pages deployment model.

**Tech Stack:** Static HTML/CSS/JavaScript, Web Workers, browser `localStorage`, Node.js `assert`/`vm`, Playwright from the bundled Codex runtime, existing SheetJS browser loader, Python `unittest` for the official-results updater, GitHub Pages.

## Global Constraints

- Keep the site build-free and deployable directly from the GitHub repository.
- Treat normalized workbook input as newest-first; all historical evaluation must explicitly create an oldest-first chronological copy.
- Evaluate exactly the fixed windows `[100, 200, 500]` against the same eligible targets.
- Require 500 earlier valid draws; the first 500 chronological draws are warm-up and are never scored.
- Use `floor(eligibleCount * 0.70)` calibration targets and the remaining targets as untouched holdout.
- Never include the target draw or any later draw in a training slice.
- Baseline historical policy uses every valid earlier draw as an expanding window; optimized candidates use only 100, 200, and 500-draw windows.
- Strategy ranking uses calibration data only. The same algorithm version may not be retuned against its holdout.
- Use regular-match points `[0, 1, 3, 10, 35, 120, 400]`; complete-form rows receive a `1.10` multiplier only when their strong number also matches.
- Form draw score is `highestRowPoints + 0.05 * sum(otherRowPoints)`.
- Optimized Form 1 requires 14 valid unique rows, coverage at least 28, exposure at most 8, and pairwise overlap at most 5.
- Optimized Form 2 requires 14 valid unique rows, coverage at least 30, exposure at most 7, and pairwise overlap at most 4.
- Form 2 may not exactly duplicate a Form 1 regular-number row.
- Both optimized forms rotate strong numbers 1 through 7 exactly twice using the preceding/latest 500-draw strong-frequency order.
- An optimized form becomes the default only after its holdout gate passes; otherwise baseline remains active.
- Preserve the current `comboNum`, `strategy`, `numbers`, and `strong` payload shape used by PIN, comparison, save/load, and form transfer.
- A failed, cancelled, stale, or incomplete Backtest must not mutate active forms or existing PIN snapshots.
- Keep the UI responsive at 1440x900 and 390x844 with no overlapping controls or unreadable tables.
- State in the public UI that historical analysis does not guarantee future lottery results.
- Add no runtime package manager or new network-loaded dependency.

## File Map

- Create `lotto-strategy-core.js`: pure statistics, strategies, scoring, walk-forward evaluation, selection, validation, and fingerprinting.
- Create `lotto-backtest-worker.js`: worker message adapter around `LottoStrategyCore.runWalkForwardBacktest(...)`.
- Modify `lotto_analyzer.html`: load the core, retain thin compatibility adapters, manage workers/cache/form modes, and render the dedicated workspace.
- Modify `Lotto_All_In_One.html`: add top navigation and right-rail routing for the dedicated workspace.
- Modify `.gitignore`: ignore Playwright screenshot output in `test-results/`.
- Create `tests/fixtures/backtest-fixture.js`: deterministic synthetic normalized draw and candidate factories.
- Create `tests/verify-strategy-core.js`: shared-core and baseline-form contracts.
- Create `tests/verify-analyzer-core-integration.js`: single-source core integration and script-parse contracts.
- Create `tests/verify-backtest-core.js`: chronology, leakage, split, scoring, fingerprint, and full engine tests.
- Create `tests/verify-optimized-forms.js`: Form 1/Form 2 constraints, cross-form diversity, rotation, validation, and fallback tests.
- Create `tests/verify-backtest-worker.js`: worker protocol and error tests.
- Create `tests/verify-backtest-ui.js`: analyzer state, cache, form mode, and DOM contract tests.
- Create `tests/verify-backtest-shell.js`: parent-shell navigation contract tests.
- Create `tests/verify-backtest-playwright.js`: responsive browser workflow and screenshot checks.
- Modify `tests/verify-form2-diversity.js`: load the external shared core before the analyzer adapter.
- Modify `tests/verify-pinned-forms.js`: assert active-mode combinations remain the source of PIN snapshots.

---

### Task 1: Extract the Shared Deterministic Strategy Core

**Files:**
- Create: `lotto-strategy-core.js`
- Create: `tests/fixtures/backtest-fixture.js`
- Create: `tests/verify-strategy-core.js`

**Interfaces:**
- Consumes: normalized newest-first draws shaped as `{ numbers: number[6], strong: number, drawNumber: number|null, date: unknown }`.
- Produces: global/CommonJS namespace `LottoStrategyCore` with constants `ALGORITHM_VERSION`, `CONSTRAINT_VERSION`, `BACKTEST_WINDOWS`, and functions `isValidDraw`, `toChronological`, `buildAnalysisSnapshot`, `generateMainCandidates`, `generateForm2RawCandidates`, `generateRawCandidates`, `generateBaselineForms`, `diversifyForm2Combinations`, `buildBalancedStrongRotation`, and `getFormDiversityMetrics`.

- [ ] **Step 1: Add a deterministic synthetic fixture factory**

Create `tests/fixtures/backtest-fixture.js` with this complete fixture API:

```js
'use strict';

function buildSyntheticDraws(count) {
  const chronological = Array.from({ length: count }, (_, index) => {
    const numbers = Array.from({ length: 6 }, (_, offset) => ((index * 7 + offset * 5) % 37) + 1)
      .sort((a, b) => a - b);
    return {
      numbers,
      strong: (index % 7) + 1,
      drawNumber: 2233 + index,
      date: Date.UTC(2020, 0, 1) + index * 3 * 24 * 60 * 60 * 1000,
    };
  });
  return chronological.reverse();
}

function buildCandidate(index, source = 'main', windowSize = 200, strategyId = (index % 14) + 1) {
  const numbers = Array.from({ length: 6 }, (_, offset) => ((index + offset * 7) % 37) + 1)
    .sort((a, b) => a - b);
  return {
    comboNum: strategyId,
    strategy: `${source}-${strategyId}`,
    numbers,
    strong: (index % 7) + 1,
    source,
    strategyId,
    window: windowSize,
    identity: `${source}:${strategyId}:${windowSize}`,
  };
}

module.exports = { buildSyntheticDraws, buildCandidate };
```

- [ ] **Step 2: Write the failing shared-core contract test**

Create `tests/verify-strategy-core.js`:

```js
'use strict';

const assert = require('assert');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');
const core = require('../lotto-strategy-core.js');

const rows = buildSyntheticDraws(540);
assert.deepStrictEqual(core.BACKTEST_WINDOWS, [100, 200, 500]);
assert.ok(rows.every(core.isValidDraw));

const chronological = core.toChronological(rows);
assert.strictEqual(chronological[0].drawNumber, 2233);
assert.strictEqual(chronological.at(-1).drawNumber, 2772);

const snapshot = core.buildAnalysisSnapshot(rows.slice(0, 500));
assert.strictEqual(snapshot.totalDraws, 500);
assert.strictEqual(snapshot.hot.length + snapshot.medium.length + snapshot.cold.length, 37);

const main = core.generateMainCandidates(snapshot, rows.slice(0, 500));
const form2Raw = core.generateForm2RawCandidates(snapshot, rows.slice(0, 500));
assert.strictEqual(main.length, 14);
assert.strictEqual(form2Raw.length, 14);

const raw = core.generateRawCandidates(rows, 500);
assert.strictEqual(raw.length, 28);
assert.strictEqual(new Set(raw.map(candidate => candidate.identity)).size, 28);

const baseline = core.generateBaselineForms(rows);
const repeated = core.generateBaselineForms(rows);
assert.strictEqual(baseline.main.length, 14);
assert.strictEqual(baseline.form2.length, 14);
assert.deepStrictEqual(baseline, repeated);

for (const combo of [...baseline.main, ...baseline.form2]) {
  assert.strictEqual(combo.numbers.length, 6);
  assert.strictEqual(new Set(combo.numbers).size, 6);
  assert.ok(combo.numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 37));
}

console.log('Shared strategy core verification passed');
```

- [ ] **Step 3: Run the contract test and verify the missing module failure**

Run: `node tests/verify-strategy-core.js`

Expected: FAIL with `Cannot find module '../lotto-strategy-core.js'`.

- [ ] **Step 4: Create the UMD core and move the existing recipes without changing their arithmetic**

Create the module envelope and validation/statistics entry points exactly as follows:

```js
(function attachLottoStrategyCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LottoStrategyCore = api;
}(typeof self !== 'undefined' ? self : globalThis, function createLottoStrategyCore() {
  'use strict';

  const ALGORITHM_VERSION = 'lotto-backtest-v1';
  const CONSTRAINT_VERSION = 'forms-v1';
  const BACKTEST_WINDOWS = Object.freeze([100, 200, 500]);
  const FORM2_STRATEGY_LABELS = Object.freeze([
    'בשלים + תדירות', 'פריצת קור', 'מגמת עלייה מואצת', 'פער אופטימלי',
    'איזון פיזור', 'זוגות מאמצע הדירוג', 'שלישייה מובילה + קרים',
    'ממוצע נע', 'אנטי-אחרון', 'מספרים בשלים', 'תנודה בין חלונות',
    'חזרת מגמה', 'סינרגיה מלאה', 'ממוצע משוקלל',
  ]);

  function isValidDraw(draw) {
    if (!draw || !Array.isArray(draw.numbers) || draw.numbers.length !== 6) return false;
    const numbers = draw.numbers.map(Number);
    return numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 37)
      && new Set(numbers).size === 6
      && Number.isInteger(Number(draw.strong))
      && Number(draw.strong) >= 1
      && Number(draw.strong) <= 8;
  }

  function cloneDraw(draw) {
    return {
      numbers: draw.numbers.map(Number).sort((a, b) => a - b),
      strong: Number(draw.strong),
      drawNumber: draw.drawNumber == null ? null : Number(draw.drawNumber),
      date: draw.date == null ? null : draw.date,
    };
  }

  function toChronological(newestFirstRows) {
    const rows = (newestFirstRows || []).filter(isValidDraw).map(cloneDraw);
    const allHaveDrawNumbers = rows.every(row => Number.isFinite(row.drawNumber));
    if (allHaveDrawNumbers) return rows.sort((a, b) => a.drawNumber - b.drawNumber);
    return rows.reverse();
  }

  function createCombo(values, strong, comboNum, strategy) {
    const numbers = values
      .map(value => Number(value && typeof value === 'object' ? value.number : value))
      .filter(number => Number.isInteger(number) && number >= 1 && number <= 37);
    return { comboNum, strategy, numbers: numbers.sort((a, b) => a - b).slice(0, 6), strong: Number(strong) };
  }

  function pickTop(values, count) {
    return Array.isArray(values) ? values.slice(0, Math.max(0, count)) : [];
  }

  function pickOffset(values, count, offset = 0) {
    if (!Array.isArray(values) || values.length === 0) return [];
    const start = Math.max(0, Math.min(offset, Math.max(0, values.length - count)));
    return values.slice(start, start + count);
  }

  function pickRandom(values, count) {
    return pickTop(values, count);
  }

  return {
    ALGORITHM_VERSION,
    CONSTRAINT_VERSION,
    BACKTEST_WINDOWS,
    FORM2_STRATEGY_LABELS,
    isValidDraw,
    toChronological,
    buildAnalysisSnapshot,
    generateMainCandidates,
    generateForm2RawCandidates,
    generateRawCandidates,
    generateBaselineForms,
    diversifyForm2Combinations,
    buildBalancedStrongRotation,
    getFormDiversityMetrics,
  };
}));
```

Move the complete deterministic implementations from `lotto_analyzer.html` into this factory, removing all DOM access and `yieldToUI()` calls:

```text
frequency grouping from analyzeData
analyzePairs, analyzeTriplets, analyzeQuartets
generateSlidingWindowCombo, generateSmartMixCombo, generateDueNumbersCombo
generateDoubleTripletCombo, generateTrendAnalysisCombo, generateUnpredictableCombo
generateQuartetTripletOverlapCombo, generateAICombo
generateCombinations as generateMainCandidates
all Form 2 normalization, overlap, candidate-priority, fallback, and diversification helpers
generateCombinationsForm2 split into generateForm2RawCandidates plus baseline diversification
createCombo, pickTop, pickOffset, pickRandom
```

Implement the three high-level entry points with these exact return contracts:

```js
function generateRawCandidates(newestFirstRows, windowSize) {
  const rows = newestFirstRows.slice(0, windowSize);
  const snapshot = buildAnalysisSnapshot(rows);
  const annotate = source => combo => ({
    ...combo,
    source,
    strategyId: combo.comboNum,
    window: windowSize,
    identity: `${source}:${combo.comboNum}:${windowSize}`,
  });
  return [
    ...generateMainCandidates(snapshot, rows).map(annotate('main')),
    ...generateForm2RawCandidates(snapshot, rows).map(annotate('form2')),
  ];
}

function generateBaselineForms(newestFirstRows) {
  const rows = newestFirstRows.filter(isValidDraw).map(cloneDraw);
  const snapshot = buildAnalysisSnapshot(rows);
  const main = generateMainCandidates(snapshot, rows);
  const form2Raw = generateForm2RawCandidates(snapshot, rows);
  const priority = buildForm2CandidatePriority(snapshot.numbers, snapshot.hot, snapshot.medium, snapshot.cold);
  const form2 = diversifyForm2Combinations(form2Raw, priority, {
    minimumCoverage: 30,
    maximumExposure: 7,
    maximumOverlap: 4,
  });
  const rotation = buildBalancedStrongRotation(snapshot.strong);
  form2.forEach((combo, index) => { combo.strong = rotation[index]; });
  return { main, form2, snapshot };
}

function buildBalancedStrongRotation(strongStats) {
  const ranked = (strongStats || [])
    .map(item => ({ number: Number(item.number), count: Number(item.count) || 0 }))
    .filter(item => item.number >= 1 && item.number <= 7)
    .sort((a, b) => b.count - a.count || a.number - b.number)
    .map(item => item.number);
  for (let number = 1; number <= 7; number += 1) {
    if (!ranked.includes(number)) ranked.push(number);
  }
  return [...ranked.slice(0, 7), ...ranked.slice(0, 7)];
}
```

- [ ] **Step 5: Run the shared-core test**

Run: `node tests/verify-strategy-core.js`

Expected: `Shared strategy core verification passed`.

- [ ] **Step 6: Commit the extracted core**

Run:

```bash
git add lotto-strategy-core.js tests/fixtures/backtest-fixture.js tests/verify-strategy-core.js
git commit -m "refactor: extract deterministic lotto strategy core"
```

Expected: one commit containing only the core and its direct tests.

---

### Task 2: Integrate the Shared Core Without Changing Baseline Behavior

**Files:**
- Modify: `lotto_analyzer.html:6,1830-1973,1976-3091,3093-3232`
- Modify: `tests/verify-form2-diversity.js`
- Create: `tests/verify-analyzer-core-integration.js`

**Interfaces:**
- Consumes: `window.LottoStrategyCore` from Task 1.
- Produces: existing globals `analyzeData`, `diversifyForm2Combinations`, `buildForm2StrongRotation`, `getForm2DiversityMetrics`, `currentCombinations`, and `currentCombinationsForm2` with unchanged external behavior.

- [ ] **Step 1: Write a failing analyzer/core integration test**

Create `tests/verify-analyzer-core-integration.js`:

```js
'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const LottoStrategyCore = require('../lotto-strategy-core.js');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');
const core = require('../lotto-strategy-core.js');

const html = fs.readFileSync('lotto_analyzer.html', 'utf8');
assert.ok(html.includes('<script src="lotto-strategy-core.js"></script>'));
assert.ok(html.includes('LottoStrategyCore.buildAnalysisSnapshot'));
assert.ok(html.includes('LottoStrategyCore.generateBaselineForms'));

const movedImplementationNames = [
  'generateSlidingWindowCombo',
  'generateSmartMixCombo',
  'generateDueNumbersCombo',
  'generateDoubleTripletCombo',
  'generateTrendAnalysisCombo',
  'generateUnpredictableCombo',
  'generateQuartetTripletOverlapCombo',
  'generateAICombo',
];
for (const name of movedImplementationNames) {
  assert.ok(!new RegExp(`function\\s+${name}\\s*\\(`).test(html), `${name} must live only in the shared core`);
  assert.strictEqual(typeof core[name], 'undefined', `${name} remains private inside the core`);
}

for (const script of [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1])) {
  new Function(script);
}

console.log('Analyzer shared-core integration verification passed');
```

- [ ] **Step 2: Run the integration test and verify it fails**

Run: `node tests/verify-analyzer-core-integration.js`

Expected: FAIL because the analyzer does not load `lotto-strategy-core.js` and still contains moved implementations.

- [ ] **Step 3: Load the core and replace inline computation with adapters**

Add this immediately after the SheetJS script in `lotto_analyzer.html`:

```html
<script src="lotto-strategy-core.js"></script>
```

Replace the body of `analyzeData(data)` with the existing progress/yield sequence around shared-core calls:

```js
async function analyzeData(data) {
  updateProgress(5, 'מנתח תדירות מספרים...');
  await yieldToUI();
  const snapshot = LottoStrategyCore.buildAnalysisSnapshot(data);

  updateProgress(85, 'יוצר קומבינציות מומלצות...');
  await yieldToUI();
  const baseline = LottoStrategyCore.generateBaselineForms(data);
  currentCombinations = baseline.main;

  updateProgress(92, 'יוצר 14 קומבינציות לטופס אחר...');
  await yieldToUI();
  currentCombinationsForm2 = baseline.form2;

  updateProgress(100, 'מסיים...');
  await yieldToUI();
  return {
    totalDraws: snapshot.totalDraws,
    numbers: snapshot.numbers,
    strong: snapshot.strong,
    hot: snapshot.hot,
    medium: snapshot.medium,
    cold: snapshot.cold,
    strongHot: snapshot.strongHot,
    strongMedium: snapshot.strongMedium,
    strongCold: snapshot.strongCold,
    pairs: snapshot.pairs,
    triplets: snapshot.triplets,
    quartets: snapshot.quartets,
    combinations: currentCombinations,
    combinationsForm2: currentCombinationsForm2,
  };
}
```

Keep thin compatibility adapters required by existing tests and rendering:

```js
function diversifyForm2Combinations(combos, candidatePriority, options) {
  return LottoStrategyCore.diversifyForm2Combinations(combos, candidatePriority, options);
}

function buildForm2StrongRotation(strongHot, strongMedium, strongCold) {
  return LottoStrategyCore.buildBalancedStrongRotation([
    ...(strongHot || []),
    ...(strongMedium || []),
    ...(strongCold || []),
  ]);
}

function getForm2DiversityMetrics(combos) {
  return LottoStrategyCore.getFormDiversityMetrics(combos);
}
```

Remove the moved inline strategy/statistics implementations listed in Task 1. Keep DOM rendering, progress, file loading, PIN, comparison, save/load, and transfer functions in the HTML.

- [ ] **Step 4: Update the existing Form 2 VM test to load the core**

In `tests/verify-form2-diversity.js`, load and expose the core before evaluating the analyzer script:

```js
const LottoStrategyCore = require('../lotto-strategy-core.js');

const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  document,
  localStorage,
  LottoStrategyCore,
  setTimeout,
  clearTimeout,
  alert() {},
  confirm() { return true; },
  fetch: async () => { throw new Error('fetch disabled in test'); },
  navigator: { clipboard: { writeText: async () => {} } },
  URL,
  Blob,
  FileReader: class {},
  addEventListener() {},
});
```

- [ ] **Step 5: Run baseline regression tests**

Run:

```bash
node tests/verify-analyzer-core-integration.js
node tests/verify-form2-diversity.js
node tests/verify-pinned-forms.js
```

Expected: all three scripts print their `passed` messages.

- [ ] **Step 6: Commit analyzer integration**

Run:

```bash
git add lotto_analyzer.html tests/verify-form2-diversity.js tests/verify-analyzer-core-integration.js
git commit -m "refactor: share lotto strategies with analyzer"
```

Expected: the analyzer uses one strategy implementation and baseline flows still pass.

---

### Task 3: Add Chronological Walk-Forward Scoring and Fingerprinting

**Files:**
- Modify: `lotto-strategy-core.js`
- Create: `tests/verify-backtest-core.js`

**Interfaces:**
- Consumes: Task 1 candidate generation and normalized newest-first draws.
- Produces: `REGULAR_POINTS`, `fingerprintRows`, `createBacktestPlan`, `buildWindowCandidatePool`, `scoreLine`, `scoreForm`, `aggregateIdentityMetrics`, and `evaluateStrategyWindows`.

- [ ] **Step 1: Write failing chronology, scoring, leakage, and fingerprint tests**

Create `tests/verify-backtest-core.js` with these assertions:

```js
'use strict';

const assert = require('assert');
const core = require('../lotto-strategy-core.js');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');

const rows = buildSyntheticDraws(540);
const plan = core.createBacktestPlan(rows, [100, 200, 500]);
assert.strictEqual(plan.eligibleTargets.length, 40);
assert.strictEqual(plan.calibrationTargets.length, 28);
assert.strictEqual(plan.holdoutTargets.length, 12);
assert.strictEqual(plan.eligibleTargets[0], 500);

const targetIndex = 520;
const pool = core.buildWindowCandidatePool(plan.chronological, targetIndex, [100, 200, 500]);
assert.strictEqual(pool.length, 84);
assert.ok(pool.every(candidate => [100, 200, 500].includes(candidate.window)));

const changed = plan.chronological.map(draw => ({ ...draw, numbers: draw.numbers.slice() }));
changed[targetIndex] = { ...changed[targetIndex], numbers: [1, 2, 3, 4, 5, 6] };
changed[targetIndex + 1] = { ...changed[targetIndex + 1], numbers: [7, 8, 9, 10, 11, 12] };
assert.deepStrictEqual(
  core.buildWindowCandidatePool(changed, targetIndex, [100, 200, 500]),
  pool,
  'Target and future mutations must not change candidates for the target',
);

const draw = { numbers: [1, 2, 3, 4, 5, 6], strong: 7 };
const first = { numbers: [1, 2, 3, 10, 11, 12], strong: 7 };
const second = { numbers: [1, 2, 10, 11, 12, 13], strong: 1 };
assert.deepStrictEqual(core.scoreLine(first, draw), {
  regularMatches: 3,
  strongMatch: true,
  regularPoints: 10,
  rowPoints: 11,
});
assert.deepStrictEqual(core.scoreLine(second, draw), {
  regularMatches: 2,
  strongMatch: false,
  regularPoints: 3,
  rowPoints: 3,
});
assert.ok(Math.abs(core.scoreForm([first, second], draw).drawScore - 11.15) < 1e-9);

const hash = core.fingerprintRows(rows);
const editedRows = rows.map(drawRow => ({ ...drawRow, numbers: drawRow.numbers.slice() }));
editedRows[0].numbers[0] = editedRows[0].numbers[0] === 1 ? 2 : 1;
assert.notStrictEqual(core.fingerprintRows(editedRows), hash);
assert.strictEqual(core.fingerprintRows(rows), hash);

const firstEvaluation = core.evaluateStrategyWindows(rows, [100, 200, 500]);
const secondEvaluation = core.evaluateStrategyWindows(rows, [100, 200, 500]);
assert.strictEqual(firstEvaluation.rankings.length, 84);
assert.deepStrictEqual(firstEvaluation, secondEvaluation);

console.log('Backtest core verification passed');
```

- [ ] **Step 2: Run the test and verify the missing API failure**

Run: `node tests/verify-backtest-core.js`

Expected: FAIL because `createBacktestPlan` is not defined.

- [ ] **Step 3: Implement canonical hashing, target planning, and scoring**

Add these constants and exact calculations inside `lotto-strategy-core.js`:

```js
const REGULAR_POINTS = Object.freeze([0, 1, 3, 10, 35, 120, 400]);

function fingerprintRows(rows) {
  const canonical = toChronological(rows).map(row => [
    row.drawNumber == null ? '' : row.drawNumber,
    row.date == null ? '' : row.date,
    ...row.numbers,
    row.strong,
  ].join('|')).join('\n');
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${ALGORITHM_VERSION}:${CONSTRAINT_VERSION}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function createBacktestPlan(rows, windows = BACKTEST_WINDOWS) {
  const normalizedWindows = [...new Set(windows.map(Number))].sort((a, b) => a - b);
  const maximumWindow = Math.max(...normalizedWindows);
  const chronological = toChronological(rows);
  if (chronological.length <= maximumWindow) {
    const error = new Error(`Backtest requires at least ${maximumWindow + 1} valid draws`);
    error.code = 'INSUFFICIENT_HISTORY';
    throw error;
  }
  const eligibleTargets = Array.from(
    { length: chronological.length - maximumWindow },
    (_, index) => maximumWindow + index,
  );
  const calibrationCount = Math.floor(eligibleTargets.length * 0.70);
  if (calibrationCount < 1 || calibrationCount >= eligibleTargets.length) {
    const error = new Error('Backtest requires at least two eligible targets');
    error.code = 'INSUFFICIENT_TARGETS';
    throw error;
  }
  return {
    chronological,
    windows: normalizedWindows,
    maximumWindow,
    eligibleTargets,
    calibrationTargets: eligibleTargets.slice(0, calibrationCount),
    holdoutTargets: eligibleTargets.slice(calibrationCount),
  };
}

function scoreLine(combo, draw) {
  const drawNumbers = new Set(draw.numbers);
  const regularMatches = combo.numbers.filter(number => drawNumbers.has(number)).length;
  const strongMatch = Number(combo.strong) === Number(draw.strong);
  const regularPoints = REGULAR_POINTS[regularMatches];
  const rowPoints = strongMatch ? regularPoints * 1.10 : regularPoints;
  return { regularMatches, strongMatch, regularPoints, rowPoints };
}

function scoreForm(combos, draw) {
  const rows = combos.map(combo => scoreLine(combo, draw));
  const ordered = rows.slice().sort((a, b) => b.rowPoints - a.rowPoints);
  const best = ordered[0] || { regularMatches: 0, strongMatch: false, regularPoints: 0, rowPoints: 0 };
  const otherPoints = ordered.slice(1).reduce((sum, row) => sum + row.rowPoints, 0);
  return { rows, best, drawScore: best.rowPoints + otherPoints * 0.05 };
}
```

Implement `buildWindowCandidatePool` so each training slice is exactly `chronological.slice(targetIndex - windowSize, targetIndex).reverse()`. Implement aggregate records with calibration and holdout counters for total regular points, sample count, hit counts 0 through 6, and three calibration chronology buckets. Finalize each identity with average points, 2+/3+/4+/5+/6 rates, stability `average === 0 ? 0 : minBucket / average`, and the documented 80/20 score. Sort only by calibration fields and deterministic tie-breakers.

- [ ] **Step 4: Export the new Backtest API and run the test**

Add the new constants/functions to the returned namespace, then run: `node tests/verify-backtest-core.js`

Expected: `Backtest core verification passed`.

- [ ] **Step 5: Commit walk-forward scoring**

Run:

```bash
git add lotto-strategy-core.js tests/verify-backtest-core.js
git commit -m "feat: add leak-free lotto backtest scoring"
```

Expected: one commit with the chronological evaluation primitives and tests.

---

### Task 4: Build and Validate the Two Optimized Forms

**Files:**
- Modify: `lotto-strategy-core.js`
- Create: `tests/verify-optimized-forms.js`
- Modify: `tests/verify-backtest-core.js`

**Interfaces:**
- Consumes: candidate rankings and pools from Task 3.
- Produces: `selectPerformanceForm`, `selectDiversityForm`, `selectOptimizedForms`, `buildCurrentOptimizedForms`, `runWalkForwardBacktest`, and result shape `{ version, constraintVersion, fingerprint, windows, split, rankings, policies, currentForms }`.

- [ ] **Step 1: Write failing selection and validation tests**

Create `tests/verify-optimized-forms.js`:

```js
'use strict';

const assert = require('assert');
const core = require('../lotto-strategy-core.js');
const { buildSyntheticDraws, buildCandidate } = require('./fixtures/backtest-fixture');

const windows = [100, 200, 500];
let candidateIndex = 0;
const candidates = windows.flatMap(windowSize => ['main', 'form2'].flatMap(source => (
  Array.from({ length: 14 }, (_, strategyIndex) => {
    const candidate = buildCandidate(candidateIndex, source, windowSize, strategyIndex + 1);
    candidateIndex += 1;
    return candidate;
  })
)));
const rankings = candidates.map((candidate, index) => ({
  identity: candidate.identity,
  source: candidate.source,
  strategyId: candidate.strategyId,
  window: candidate.window,
  calibration: { score: 1000 - index, stability: 1, rate3Plus: 0.25 },
  holdout: { score: 900 - index, rate3Plus: 0.24 },
}));
const training = buildSyntheticDraws(500);

const selected = core.selectOptimizedForms(candidates, rankings, training);
const repeated = core.selectOptimizedForms(candidates, rankings, training);
assert.deepStrictEqual(selected, repeated);
assert.deepStrictEqual(selected.errors, { main: null, form2: null });

const mainMetrics = core.getFormDiversityMetrics(selected.main);
assert.strictEqual(selected.main.length, 14);
assert.strictEqual(mainMetrics.uniqueCombinationCount, 14);
assert.ok(mainMetrics.coveredNumberCount >= 28);
assert.ok(mainMetrics.maximumExposure <= 8);
assert.ok(mainMetrics.maximumOverlap <= 5);

const form2Metrics = core.getFormDiversityMetrics(selected.form2);
assert.strictEqual(selected.form2.length, 14);
assert.strictEqual(form2Metrics.uniqueCombinationCount, 14);
assert.ok(form2Metrics.coveredNumberCount >= 30);
assert.ok(form2Metrics.maximumExposure <= 7);
assert.ok(form2Metrics.maximumOverlap <= 4);

const mainKeys = new Set(selected.main.map(combo => combo.numbers.join('-')));
assert.ok(selected.form2.every(combo => !mainKeys.has(combo.numbers.join('-'))));

for (const form of [selected.main, selected.form2]) {
  const counts = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, 0]));
  form.forEach(combo => { counts[combo.strong] += 1; });
  assert.deepStrictEqual(counts, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2 });
}

console.log('Optimized forms verification passed');
```

- [ ] **Step 2: Run the selection test and verify it fails**

Run: `node tests/verify-optimized-forms.js`

Expected: FAIL because `selectOptimizedForms` is not defined.

- [ ] **Step 3: Implement deterministic ranked selection and fallback**

Add immutable option constants:

```js
const FORM1_OPTIONS = Object.freeze({
  minimumCoverage: 28,
  maximumExposure: 8,
  maximumOverlap: 5,
  maximumReplacements: 2,
});
const FORM2_OPTIONS = Object.freeze({
  minimumCoverage: 30,
  maximumExposure: 7,
  maximumOverlap: 4,
  minimumRetained: 3,
});
```

Use these exact signatures and return types:

```text
selectPerformanceForm(candidates, rankings, training500, options) -> Combo[14]
selectDiversityForm(candidates, rankings, training500, form1Rows, options) -> Combo[14]
selectOptimizedForms(candidates, rankings, training500) -> { main: Combo[14]|null, form2: Combo[14]|null, errors: { main: string|null, form2: string|null } }
buildCurrentOptimizedForms(rows, rankings, windows) -> the same combined-selection object
```

Implement these deterministic stages:

```text
1. Deduplicate candidates by sorted-number key and retain all provenance identities.
2. Attach the best calibration rank for each deduplicated row.
3. Select Form 1 in rank order, preferring lower partial exposure and overlap.
4. If raw Form 1 misses a hard constraint, search replacements in ranked number priority while replacing no more than two source numbers.
5. Select Form 2 from candidates at or above the median calibration score; extend below the median in rank order only when fewer than 14 unique rows remain.
6. Reject exact Form 1 duplicates and prefer lower average cross-form overlap.
7. Apply the existing deterministic diversification search with minimum retained count 3.
8. Validate every hard constraint. Each individual selector throws FORM1_SELECTION_FAILED or FORM2_SELECTION_FAILED internally; the public combined selector catches each error independently and returns null for that form plus its stable error code.
9. Apply the 500-draw balanced strong rotation to both successful forms.
```

Every returned combo must retain this provenance:

```js
{
  comboNum: index + 1,
  strategy: `${candidate.strategy} · חלון ${candidate.window}`,
  numbers: selectedNumbers,
  strong: rotation[index],
  source: candidate.source,
  strategyId: candidate.strategyId,
  window: candidate.window,
  identity: candidate.identity,
  backtestScore: ranking.calibration.score,
  diversified: selectedNumbers.join('-') !== candidate.numbers.join('-'),
}
```

Implement the public combined selector so one failed form never discards the other successful form:

```js
function selectOptimizedForms(candidates, rankings, training500) {
  const result = { main: null, form2: null, errors: { main: null, form2: null } };
  try {
    result.main = selectPerformanceForm(candidates, rankings, training500, FORM1_OPTIONS);
  } catch (error) {
    result.errors.main = error && error.code ? error.code : 'FORM1_SELECTION_FAILED';
  }
  try {
    result.form2 = selectDiversityForm(
      candidates,
      rankings,
      training500,
      result.main || [],
      FORM2_OPTIONS,
    );
  } catch (error) {
    result.errors.form2 = error && error.code ? error.code : 'FORM2_SELECTION_FAILED';
  }
  return result;
}

function buildCurrentOptimizedForms(rows, rankings, windows = BACKTEST_WINDOWS) {
  const candidates = windows.flatMap(windowSize => generateRawCandidates(rows, windowSize));
  return selectOptimizedForms(candidates, rankings, rows.slice(0, 500));
}
```

- [ ] **Step 4: Implement the complete two-pass Backtest**

Implement `runWalkForwardBacktest(rows, options)` with this sequence:

```js
function runWalkForwardBacktest(rows, options = {}) {
  const windows = options.windows || BACKTEST_WINDOWS;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : function noop() {};
  const isCancelled = typeof options.isCancelled === 'function' ? options.isCancelled : function neverCancelled() { return false; };
  const plan = createBacktestPlan(rows, windows);
  const identityEvaluation = evaluateStrategyWindows(rows, windows, { onProgress, isCancelled });
  const rankings = identityEvaluation.rankings;
  const policyAggregates = createEmptyPolicyAggregates();

  plan.holdoutTargets.forEach((targetIndex, index) => {
    if (isCancelled()) {
      const error = new Error('Backtest cancelled');
      error.code = 'CANCELLED';
      throw error;
    }
    const pool = buildWindowCandidatePool(plan.chronological, targetIndex, windows);
    const training500 = plan.chronological.slice(targetIndex - 500, targetIndex).reverse();
    const allEarlier = plan.chronological.slice(0, targetIndex).reverse();
    const optimized = selectOptimizedForms(pool, rankings, training500);
    const baseline = generateBaselineForms(allEarlier);
    addPolicyDraw(
      policyAggregates.main,
      baseline.main,
      optimized.main || baseline.main,
      plan.chronological[targetIndex],
      Boolean(optimized.errors.main),
    );
    addPolicyDraw(
      policyAggregates.form2,
      baseline.form2,
      optimized.form2 || baseline.form2,
      plan.chronological[targetIndex],
      Boolean(optimized.errors.form2),
    );
    onProgress({
      phase: 'holdout-policies',
      completed: index + 1,
      total: plan.holdoutTargets.length,
    });
  });

  const policies = finalizePolicyAggregates(policyAggregates);
  const currentForms = buildCurrentOptimizedForms(rows, rankings, windows);
  return {
    version: ALGORITHM_VERSION,
    constraintVersion: CONSTRAINT_VERSION,
    fingerprint: fingerprintRows(rows),
    windows: windows.slice(),
    split: {
      eligibleCount: plan.eligibleTargets.length,
      calibrationCount: plan.calibrationTargets.length,
      holdoutCount: plan.holdoutTargets.length,
    },
    rankings,
    policies,
    currentForms,
  };
}
```

Implement policy aggregation with this exact shape and gate:

```js
function createEmptyPolicyAggregate() {
  return {
    sampleCount: 0,
    selectionFailures: 0,
    baseline: createEmptyFormAccumulator(),
    optimized: createEmptyFormAccumulator(),
  };
}

function createEmptyPolicyAggregates() {
  return { main: createEmptyPolicyAggregate(), form2: createEmptyPolicyAggregate() };
}

function createEmptyFormAccumulator() {
  return {
    drawScoreTotal: 0,
    bestMatchTotal: 0,
    exactBestHits: [0, 0, 0, 0, 0, 0, 0],
    strongOnBest: 0,
    bestRegular: 0,
    coverageTotal: 0,
    maximumExposure: 0,
    maximumOverlap: 0,
  };
}

function addFormResult(accumulator, form, draw) {
  const evaluation = scoreForm(form, draw);
  const diversity = getFormDiversityMetrics(form);
  accumulator.drawScoreTotal += evaluation.drawScore;
  accumulator.bestMatchTotal += evaluation.best.regularMatches;
  accumulator.exactBestHits[evaluation.best.regularMatches] += 1;
  accumulator.strongOnBest += evaluation.best.strongMatch ? 1 : 0;
  accumulator.bestRegular = Math.max(accumulator.bestRegular, evaluation.best.regularMatches);
  accumulator.coverageTotal += diversity.coveredNumberCount;
  accumulator.maximumExposure = Math.max(accumulator.maximumExposure, diversity.maximumExposure);
  accumulator.maximumOverlap = Math.max(accumulator.maximumOverlap, diversity.maximumOverlap);
}

function addPolicyDraw(aggregate, baselineForm, optimizedForm, draw, selectionFailed) {
  aggregate.sampleCount += 1;
  aggregate.selectionFailures += selectionFailed ? 1 : 0;
  addFormResult(aggregate.baseline, baselineForm, draw);
  addFormResult(aggregate.optimized, optimizedForm, draw);
}

function finalizeFormAccumulator(accumulator, sampleCount) {
  const samples = Math.max(1, sampleCount);
  const rateAtLeast = threshold => accumulator.exactBestHits
    .slice(threshold)
    .reduce((sum, count) => sum + count, 0) / samples;
  return {
    averageScore: accumulator.drawScoreTotal / samples,
    averageBestMatches: accumulator.bestMatchTotal / samples,
    rate2Plus: rateAtLeast(2),
    rate3Plus: rateAtLeast(3),
    rate4Plus: rateAtLeast(4),
    rate5Plus: rateAtLeast(5),
    rate6: rateAtLeast(6),
    bestRegular: accumulator.bestRegular,
    strongOnBestRate: accumulator.strongOnBest / samples,
    averageCoverage: accumulator.coverageTotal / samples,
    maximumExposure: accumulator.maximumExposure,
    maximumOverlap: accumulator.maximumOverlap,
  };
}

function finalizePolicyAggregate(aggregate) {
  const baseline = finalizeFormAccumulator(aggregate.baseline, aggregate.sampleCount);
  const optimized = finalizeFormAccumulator(aggregate.optimized, aggregate.sampleCount);
  const reasons = [];
  if (aggregate.selectionFailures > 0) reasons.push('selection-failure');
  if (optimized.averageScore < baseline.averageScore) reasons.push('score-regression');
  if (optimized.rate3Plus < baseline.rate3Plus - 0.01) reasons.push('three-plus-regression');
  return {
    sampleCount: aggregate.sampleCount,
    selectionFailures: aggregate.selectionFailures,
    baseline,
    optimized,
    validated: reasons.length === 0,
    reasons,
  };
}

function finalizePolicyAggregates(aggregates) {
  return {
    main: finalizePolicyAggregate(aggregates.main),
    form2: finalizePolicyAggregate(aggregates.form2),
  };
}
```

Structural constraints are verified by each selector before a row reaches policy scoring. A selection failure substitutes baseline only for scoring continuity, increments `selectionFailures`, and forces that form's `validated` value to false.

- [ ] **Step 5: Extend the full-engine test**

Append to `tests/verify-backtest-core.js`:

```js
const result = core.runWalkForwardBacktest(rows);
const repeatedResult = core.runWalkForwardBacktest(rows);
assert.deepStrictEqual(result, repeatedResult);
assert.deepStrictEqual(result.windows, [100, 200, 500]);
assert.deepStrictEqual(result.split, { eligibleCount: 40, calibrationCount: 28, holdoutCount: 12 });
assert.strictEqual(result.currentForms.main.length, 14);
assert.strictEqual(result.currentForms.form2.length, 14);
assert.strictEqual(typeof result.policies.main.validated, 'boolean');
assert.strictEqual(typeof result.policies.form2.validated, 'boolean');

if (process.env.LOTTO_FULL_BENCHMARK === '1') {
  const benchmarkRows = buildSyntheticDraws(1712);
  const startedAt = Date.now();
  const benchmark = core.runWalkForwardBacktest(benchmarkRows);
  const elapsedMs = Date.now() - startedAt;
  assert.deepStrictEqual(benchmark.split, {
    eligibleCount: 1212,
    calibrationCount: 848,
    holdoutCount: 364,
  });
  assert.strictEqual(benchmark.currentForms.main.length, 14);
  assert.strictEqual(benchmark.currentForms.form2.length, 14);
  console.log(`Full Backtest benchmark: ${elapsedMs} ms`);
}
```

- [ ] **Step 6: Run optimizer and engine tests**

Run:

```bash
node tests/verify-optimized-forms.js
node tests/verify-backtest-core.js
```

Expected: both scripts print their `passed` messages.

- [ ] **Step 7: Commit optimized selection**

Run:

```bash
git add lotto-strategy-core.js tests/verify-optimized-forms.js tests/verify-backtest-core.js
git commit -m "feat: build validated optimized lotto forms"
```

Expected: one commit with deterministic form policies and holdout validation.

---

### Task 5: Add the Backtest Worker Protocol

**Files:**
- Create: `lotto-backtest-worker.js`
- Create: `tests/verify-backtest-worker.js`

**Interfaces:**
- Consumes: worker request `{ type: 'run', runId: string, rows: Draw[], windows: number[] }`.
- Produces: `{ type: 'progress'|'complete'|'error', runId, ...payload }` messages; cancellation remains browser-side `worker.terminate()`.

- [ ] **Step 1: Write the failing worker protocol test**

Create `tests/verify-backtest-worker.js`:

```js
'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const core = require('../lotto-strategy-core.js');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');

const source = fs.readFileSync('lotto-backtest-worker.js', 'utf8');
const messages = [];
const self = {
  LottoStrategyCore: core,
  postMessage(message) { messages.push(message); },
};
const context = vm.createContext({ self, importScripts() {} });
vm.runInContext(source, context, { filename: 'lotto-backtest-worker.js' });

self.onmessage({ data: {
  type: 'run',
  runId: 'run-1',
  rows: buildSyntheticDraws(502),
  windows: [100, 200, 500],
} });

assert.ok(messages.some(message => message.type === 'progress' && message.runId === 'run-1'));
assert.ok(messages.some(message => message.type === 'complete' && message.runId === 'run-1'));

messages.length = 0;
self.onmessage({ data: { type: 'run', runId: 'run-2', rows: [], windows: [100, 200, 500] } });
assert.ok(messages.some(message => message.type === 'error' && message.code === 'INSUFFICIENT_HISTORY'));

console.log('Backtest worker verification passed');
```

- [ ] **Step 2: Run the worker test and verify the missing file failure**

Run: `node tests/verify-backtest-worker.js`

Expected: FAIL with `ENOENT` for `lotto-backtest-worker.js`.

- [ ] **Step 3: Implement the worker adapter**

Create `lotto-backtest-worker.js`:

```js
'use strict';

importScripts('lotto-strategy-core.js');

self.onmessage = function handleBacktestMessage(event) {
  const request = event.data || {};
  if (request.type !== 'run') return;
  const runId = String(request.runId || '');
  try {
    const result = self.LottoStrategyCore.runWalkForwardBacktest(request.rows || [], {
      windows: request.windows || self.LottoStrategyCore.BACKTEST_WINDOWS,
      onProgress(progress) {
        self.postMessage({ type: 'progress', runId, ...progress });
      },
    });
    self.postMessage({ type: 'complete', runId, result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      runId,
      code: error && error.code ? error.code : 'BACKTEST_FAILED',
      message: error && error.message ? error.message : 'Backtest failed',
    });
  }
};
```

- [ ] **Step 4: Run worker and core tests**

Run:

```bash
node tests/verify-backtest-worker.js
node tests/verify-backtest-core.js
```

Expected: both scripts print their `passed` messages.

- [ ] **Step 5: Commit the worker**

Run:

```bash
git add lotto-backtest-worker.js tests/verify-backtest-worker.js
git commit -m "feat: run lotto backtests in a web worker"
```

Expected: one commit containing the worker boundary and protocol test.

---

### Task 6: Add Analyzer Cache, Form Modes, and Dedicated Backtest Workspace

**Files:**
- Modify: `lotto_analyzer.html:1-866,875-1178,1170-1777,3093-3232`
- Create: `tests/verify-backtest-ui.js`
- Modify: `tests/verify-pinned-forms.js`

**Interfaces:**
- Consumes: `LottoStrategyCore`, `lotto-backtest-worker.js`, normalized `currentData`, and existing active combination globals.
- Produces: `setAnalyzerWorkspace`, `startBacktest`, `cancelBacktest`, `loadCompatibleBacktestCache`, `saveBacktestCache`, `applyFormMode`, `renderActiveForms`, and dedicated DOM IDs.

- [ ] **Step 1: Write the failing analyzer UI/state contract test**

Create `tests/verify-backtest-ui.js`:

```js
'use strict';

const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('lotto_analyzer.html', 'utf8');
const required = [
  'id="backtestWorkspace"',
  'id="backtestRunBtn"',
  'id="backtestCancelBtn"',
  'id="backtestProgress"',
  'id="backtestSummaryPanel"',
  'id="backtestStrategiesPanel"',
  'id="backtestComparisonPanel"',
  'id="mainFormMode"',
  'id="form2FormMode"',
  'function setAnalyzerWorkspace(mode)',
  'function startBacktest()',
  'function cancelBacktest(reason)',
  'function loadCompatibleBacktestCache(rows)',
  'function saveBacktestCache(result)',
  'function applyFormMode(source, mode)',
  'function renderActiveForms()',
  "new Worker('lotto-backtest-worker.js')",
  'הניתוח ההיסטורי אינו מבטיח תוצאות עתידיות',
];
for (const token of required) assert.ok(html.includes(token), `Missing Backtest UI contract: ${token}`);

assert.ok(/function getCombosForSource\(source\)[\s\S]*currentCombinationsForm2/.test(html));
assert.ok(/pinCurrentForm\(source\)[\s\S]*getCombosForSource\(source\)/.test(html));

const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
for (const script of scripts) {
  new Function(script);
}

const elements = new Map();
function createElement(id = '') {
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    files: [],
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    appendChild() {},
    remove() {},
    click() {},
    scrollIntoView() {},
    setAttribute() {},
    getAttribute() { return null; },
  };
}
const document = {
  body: createElement('body'),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  },
  querySelector() { return createElement(); },
  querySelectorAll() { return []; },
  createElement() { return createElement(); },
  addEventListener() {},
};
const values = new Map();
const storage = {
  failWrites: false,
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) {
    if (this.failWrites) throw new Error('quota');
    values.set(key, String(value));
  },
  removeItem(key) { values.delete(key); },
};
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  document,
  localStorage: storage,
  LottoStrategyCore,
  Worker: class {},
  setTimeout,
  clearTimeout,
  alert() {},
  confirm() { return true; },
  prompt() { return ''; },
  fetch: async () => { throw new Error('fetch disabled in test'); },
  navigator: { clipboard: { writeText: async () => {} } },
  URL,
  Blob,
  FileReader: class {},
  addEventListener() {},
  scrollTo() {},
});
context.window = context;
context.window.parent = { postMessage() {} };
context.globalThis = context;
vm.runInContext(scripts.at(-1), context, { filename: 'lotto_analyzer.html' });

const rows = buildSyntheticDraws(502);
const result = {
  version: LottoStrategyCore.ALGORITHM_VERSION,
  constraintVersion: LottoStrategyCore.CONSTRAINT_VERSION,
  fingerprint: LottoStrategyCore.fingerprintRows(rows),
  windows: [100, 200, 500],
  split: { eligibleCount: 2, calibrationCount: 1, holdoutCount: 1 },
  rankings: [],
  policies: {},
  currentForms: { main: null, form2: null, errors: { main: null, form2: null } },
};
context.__rows = rows;
context.__result = result;
assert.strictEqual(vm.runInContext('saveBacktestCache(__result)', context), true);
assert.strictEqual(vm.runInContext('loadCompatibleBacktestCache(__rows).fingerprint', context), result.fingerprint);

const changedRows = rows.map(draw => ({ ...draw, numbers: draw.numbers.slice() }));
changedRows[0].strong = changedRows[0].strong === 7 ? 6 : 7;
context.__changedRows = changedRows;
assert.strictEqual(vm.runInContext('loadCompatibleBacktestCache(__changedRows)', context), null);

const key = vm.runInContext('getBacktestCacheKey(__rows)', context);
values.set(key, '{broken-json');
assert.strictEqual(vm.runInContext('loadCompatibleBacktestCache(__rows)', context), null);
storage.failWrites = true;
assert.strictEqual(vm.runInContext('saveBacktestCache(__result)', context), false);

console.log('Backtest analyzer UI verification passed');
```

- [ ] **Step 2: Run the UI test and verify it fails**

Run: `node tests/verify-backtest-ui.js`

Expected: FAIL on the first missing `backtestWorkspace` token.

- [ ] **Step 3: Add explicit baseline/improved state and active-form rendering**

Add these state objects next to the existing combination globals:

```js
const BACKTEST_CACHE_PREFIX = 'lottoBacktestCacheV1:';
let baselineForms = { main: [], form2: [] };
let optimizedForms = { main: null, form2: null };
let activeFormModes = { main: 'baseline', form2: 'baseline' };
let currentBacktestResult = null;
let currentBacktestWorker = null;
let currentBacktestRunId = null;
let analyzerWorkspaceMode = 'analysis';
```

After baseline analysis succeeds, copy the results before rendering:

```js
baselineForms = {
  main: analysis.combinations.map(combo => ({ ...combo, numbers: combo.numbers.slice() })),
  form2: analysis.combinationsForm2.map(combo => ({ ...combo, numbers: combo.numbers.slice() })),
};
optimizedForms = { main: null, form2: null };
activeFormModes = { main: 'baseline', form2: 'baseline' };
currentBacktestResult = loadCompatibleBacktestCache(currentData);
hydrateOptimizedForms(currentBacktestResult);
renderActiveForms();
```

Implement active switching without changing PIN storage:

```js
function getFormSet(source, mode) {
  if (mode === 'improved' && optimizedForms[source]) return optimizedForms[source];
  return baselineForms[source] || [];
}

function applyFormMode(source, mode) {
  if (!['main', 'form2'].includes(source)) return false;
  if (mode === 'improved' && !optimizedForms[source]) return false;
  activeFormModes[source] = mode === 'improved' ? 'improved' : 'baseline';
  const active = getFormSet(source, activeFormModes[source]).map(combo => ({
    ...combo,
    numbers: combo.numbers.slice(),
  }));
  if (source === 'main') currentCombinations = active;
  else currentCombinationsForm2 = active;
  renderActiveForms();
  updateComparison({ silent: true, scroll: false });
  return true;
}
```

Refactor the existing combination HTML in `displayResults` into `renderActiveForms()`. That function must render `currentCombinations` and `currentCombinationsForm2`, mode segmented controls, Backtest score/window metadata, Form 2 diversity summary, and the existing transfer/copy buttons.

Insert one segmented control above each existing combinations grid:

```html
<div class="form-mode-control" id="mainFormMode" aria-label="מצב טופס ראשון">
  <button type="button" data-mode="improved" onclick="applyFormMode('main', 'improved')">משופר</button>
  <button type="button" data-mode="baseline" onclick="applyFormMode('main', 'baseline')">בסיס</button>
</div>
<div class="form-mode-control" id="form2FormMode" aria-label="מצב טופס שני">
  <button type="button" data-mode="improved" onclick="applyFormMode('form2', 'improved')">משופר</button>
  <button type="button" data-mode="baseline" onclick="applyFormMode('form2', 'baseline')">בסיס</button>
</div>
```

Place `#mainFormMode` only in `#combosCard` and `#form2FormMode` only in `#combosForm2Card`. `renderActiveForms()` sets the matching button's `aria-pressed` state and disables Improved when `optimizedForms[source]` is null.

- [ ] **Step 4: Implement cache compatibility and atomic activation**

Use a key derived from the exact loaded dataset:

```js
function getBacktestCacheKey(rows, windows = LottoStrategyCore.BACKTEST_WINDOWS) {
  return `${BACKTEST_CACHE_PREFIX}${LottoStrategyCore.fingerprintRows(rows || [])}:${windows.join('-')}`;
}

function loadCompatibleBacktestCache(rows) {
  try {
    const raw = localStorage.getItem(getBacktestCacheKey(rows));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== LottoStrategyCore.ALGORITHM_VERSION) return null;
    if (parsed.constraintVersion !== LottoStrategyCore.CONSTRAINT_VERSION) return null;
    if (parsed.fingerprint !== LottoStrategyCore.fingerprintRows(rows)) return null;
    if (parsed.windows.join('-') !== LottoStrategyCore.BACKTEST_WINDOWS.join('-')) return null;
    return parsed;
  } catch (error) {
    console.warn('Backtest cache ignored:', error);
    return null;
  }
}

function saveBacktestCache(result) {
  try {
    const key = `${BACKTEST_CACHE_PREFIX}${result.fingerprint}:${result.windows.join('-')}`;
    localStorage.setItem(key, JSON.stringify(result));
    return true;
  } catch (error) {
    console.warn('Backtest cache unavailable:', error);
    return false;
  }
}
```

Only assign `currentBacktestResult`, `optimizedForms`, or improved defaults after a `complete` message whose `runId` equals `currentBacktestRunId` and whose fingerprint equals the current dataset. Set each form's default mode to improved only when its own `policies[source].validated` is true.

Add these complete state/render helpers so every name used by the worker controls has one definition:

```js
function hydrateOptimizedForms(result) {
  optimizedForms = {
    main: result && result.currentForms && result.currentForms.main
      ? result.currentForms.main.map(combo => ({ ...combo, numbers: combo.numbers.slice() }))
      : null,
    form2: result && result.currentForms && result.currentForms.form2
      ? result.currentForms.form2.map(combo => ({ ...combo, numbers: combo.numbers.slice() }))
      : null,
  };
  for (const source of ['main', 'form2']) {
    const policy = result && result.policies ? result.policies[source] : null;
    activeFormModes[source] = policy && policy.validated && optimizedForms[source]
      ? 'improved'
      : 'baseline';
  }
}

function setBacktestRunning(isRunning) {
  document.getElementById('backtestRunBtn').hidden = isRunning;
  document.getElementById('backtestCancelBtn').hidden = !isRunning;
  document.getElementById('backtestProgress').hidden = !isRunning;
}

function renderBacktestStatus(message) {
  document.getElementById('backtestDatasetMeta').textContent = message;
}

function renderBacktestError(message) {
  renderBacktestStatus(message);
  document.getElementById('backtestSummaryPanel').innerHTML = `<div class="error">${message}</div>`;
}

function finishBacktestFailure(message) {
  if (currentBacktestWorker) currentBacktestWorker.terminate();
  currentBacktestWorker = null;
  currentBacktestRunId = null;
  setBacktestRunning(false);
  renderBacktestError(message);
}

function showBacktestPanel(panelId) {
  document.querySelectorAll('.backtest-panel').forEach(panel => {
    panel.hidden = panel.id !== panelId;
  });
  document.querySelectorAll('.backtest-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.panel === panelId);
  });
}

function handleBacktestWorkerMessage(event) {
  const message = event.data || {};
  if (message.runId !== currentBacktestRunId) return;
  if (message.type === 'progress') {
    const percentage = message.total ? Math.round(message.completed / message.total * 100) : 0;
    document.getElementById('backtestProgressBar').value = percentage;
    document.getElementById('backtestProgressText').textContent = `${message.completed}/${message.total}`;
    return;
  }
  if (message.type === 'error') {
    finishBacktestFailure(message.message || 'הבדיקה נכשלה.');
    return;
  }
  if (message.type !== 'complete') return;
  const expectedFingerprint = LottoStrategyCore.fingerprintRows(currentData || []);
  if (!message.result || message.result.fingerprint !== expectedFingerprint) {
    finishBacktestFailure('תוצאות הבדיקה אינן תואמות לקובץ הטעון.');
    return;
  }
  currentBacktestResult = message.result;
  saveBacktestCache(message.result);
  hydrateOptimizedForms(message.result);
  for (const source of ['main', 'form2']) applyFormMode(source, activeFormModes[source]);
  renderBacktestResult(message.result);
  if (currentBacktestWorker) currentBacktestWorker.terminate();
  currentBacktestWorker = null;
  currentBacktestRunId = null;
  setBacktestRunning(false);
}
```

Implement the three deterministic render passes with escaped labels:

```js
function escapeBacktestText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBacktestPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function renderBacktestResult(result) {
  const policyCards = ['main', 'form2'].map(source => {
    const policy = result.policies[source];
    const label = source === 'main' ? 'טופס ראשון' : 'טופס שני';
    const status = policy.validated ? 'מאומת' : 'נשאר בסיס';
    return `<div class="stat-box">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${status}</div>
      <div>3+: ${formatBacktestPercent(policy.optimized.rate3Plus)}</div>
    </div>`;
  }).join('');
  document.getElementById('backtestSummaryPanel').innerHTML = `
    <div class="backtest-summary-grid">
      <div class="stat-box"><div class="stat-label">הגרלות שנבדקו</div><div class="stat-value">${result.split.eligibleCount}</div></div>
      <div class="stat-box"><div class="stat-label">כיול / אימות</div><div class="stat-value">${result.split.calibrationCount} / ${result.split.holdoutCount}</div></div>
      ${policyCards}
    </div>`;

  document.getElementById('backtestStrategiesPanel').innerHTML = result.rankings.map((ranking, index) => `
    <div class="backtest-strategy-row">
      <strong>${index + 1}. ${escapeBacktestText(ranking.identity)}</strong>
      <span>${ranking.window}</span>
      <span>${Number(ranking.calibration.score).toFixed(2)}</span>
      <span>${Number(ranking.holdout.score).toFixed(2)}</span>
      <span>${formatBacktestPercent(ranking.calibration.rate3Plus)}</span>
      <span>${formatBacktestPercent(ranking.calibration.stability)}</span>
    </div>`).join('');

  document.getElementById('backtestComparisonPanel').innerHTML = ['main', 'form2'].map(source => {
    const policy = result.policies[source];
    const label = source === 'main' ? 'טופס ראשון' : 'טופס שני';
    const selectedRows = result.currentForms[source] || [];
    return `<section class="backtest-comparison-band">
      <h3>${label}</h3>
      <div class="backtest-metric-line">ציון בסיס ${Number(policy.baseline.averageScore).toFixed(2)} | משופר ${Number(policy.optimized.averageScore).toFixed(2)}</div>
      <div class="backtest-metric-line">ממוצע שורה מיטבית: ${Number(policy.baseline.averageBestMatches).toFixed(2)} | ${Number(policy.optimized.averageBestMatches).toFixed(2)}</div>
      <div class="backtest-metric-line">2+: ${formatBacktestPercent(policy.baseline.rate2Plus)} | ${formatBacktestPercent(policy.optimized.rate2Plus)}</div>
      <div class="backtest-metric-line">3+: ${formatBacktestPercent(policy.baseline.rate3Plus)} | ${formatBacktestPercent(policy.optimized.rate3Plus)}</div>
      <div class="backtest-metric-line">4+: ${formatBacktestPercent(policy.baseline.rate4Plus)} | ${formatBacktestPercent(policy.optimized.rate4Plus)}</div>
      <div class="backtest-metric-line">5+: ${formatBacktestPercent(policy.baseline.rate5Plus)} | ${formatBacktestPercent(policy.optimized.rate5Plus)}</div>
      <div class="backtest-metric-line">6: ${formatBacktestPercent(policy.baseline.rate6)} | ${formatBacktestPercent(policy.optimized.rate6)}</div>
      <div class="backtest-metric-line">חזק בשורה הטובה: ${formatBacktestPercent(policy.baseline.strongOnBestRate)} | ${formatBacktestPercent(policy.optimized.strongOnBestRate)}</div>
      <div class="backtest-metric-line">כיסוי ממוצע: ${Number(policy.baseline.averageCoverage).toFixed(1)} | ${Number(policy.optimized.averageCoverage).toFixed(1)}</div>
      <div class="backtest-metric-line">חשיפה מרבית: ${policy.baseline.maximumExposure} | ${policy.optimized.maximumExposure}</div>
      <div class="backtest-metric-line">חפיפה מרבית: ${policy.baseline.maximumOverlap} | ${policy.optimized.maximumOverlap}</div>
      <ol>${selectedRows.map(combo => `<li>${escapeBacktestText(combo.strategy)} (${combo.numbers.join(', ')})</li>`).join('')}</ol>
    </section>`;
  }).join('');

  renderBacktestStatus(`הבדיקה הסתיימה עבור ${result.split.eligibleCount} הגרלות.`);
  showBacktestPanel('backtestSummaryPanel');
}
```

All workbook-originated values remain numeric. Strategy/provenance labels pass through `escapeBacktestText` before entering templates.

- [ ] **Step 5: Add the dedicated workspace markup and worker controls**

Add a sibling of `#results` named `#backtestWorkspace`, hidden by default, with:

```html
<section class="backtest-workspace" id="backtestWorkspace" hidden>
  <div class="backtest-toolbar">
    <div>
      <h2>בדיקת אסטרטגיות היסטורית</h2>
      <p id="backtestDatasetMeta">יש לטעון ולנתח את קובץ המספרים.</p>
    </div>
    <div class="backtest-actions">
      <button type="button" class="btn btn-primary" id="backtestRunBtn" onclick="startBacktest()">הפעל בדיקה</button>
      <button type="button" class="btn btn-danger" id="backtestCancelBtn" onclick="cancelBacktest('user')" hidden>בטל</button>
      <button type="button" class="btn btn-secondary" onclick="setAnalyzerWorkspace('analysis')">חזרה לניתוח</button>
    </div>
  </div>
  <div class="backtest-window-strip" aria-label="חלונות למידה">
    <span>100</span><span>200</span><span>500</span>
  </div>
  <div class="backtest-progress-wrap" id="backtestProgress" hidden>
    <progress id="backtestProgressBar" max="100" value="0"></progress>
    <span id="backtestProgressText"></span>
  </div>
  <div class="backtest-tabs" role="tablist">
    <button type="button" class="backtest-tab active" data-panel="backtestSummaryPanel" onclick="showBacktestPanel('backtestSummaryPanel')">סיכום</button>
    <button type="button" class="backtest-tab" data-panel="backtestStrategiesPanel" onclick="showBacktestPanel('backtestStrategiesPanel')">אסטרטגיות</button>
    <button type="button" class="backtest-tab" data-panel="backtestComparisonPanel" onclick="showBacktestPanel('backtestComparisonPanel')">בסיס מול משופר</button>
  </div>
  <div id="backtestSummaryPanel" class="backtest-panel"></div>
  <div id="backtestStrategiesPanel" class="backtest-panel" hidden></div>
  <div id="backtestComparisonPanel" class="backtest-panel" hidden></div>
  <p class="backtest-disclaimer">הניתוח ההיסטורי אינו מבטיח תוצאות עתידיות או זכייה.</p>
</section>
```

Add the workspace switch beside the other analyzer navigation helpers:

```js
function setAnalyzerWorkspace(mode) {
  analyzerWorkspaceMode = mode === 'backtest' ? 'backtest' : 'analysis';
  const isBacktest = analyzerWorkspaceMode === 'backtest';
  document.getElementById('backtestWorkspace').hidden = !isBacktest;
  document.querySelector('.upload-section').hidden = isBacktest;
  document.getElementById('sideNav').hidden = isBacktest;
  document.getElementById('results').hidden = isBacktest;
  if (isBacktest) {
    renderBacktestStatus(currentData
      ? `${currentData.filter(LottoStrategyCore.isValidDraw).length} הגרלות תקינות נטענו`
      : 'יש לטעון ולנתח את קובץ המספרים.');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}
```

Implement `startBacktest` and `cancelBacktest`:

```js
function startBacktest() {
  if (!currentData || currentData.filter(LottoStrategyCore.isValidDraw).length < 501) {
    renderBacktestError('נדרשות לפחות 501 הגרלות תקינות להפעלת Backtest.');
    return;
  }
  cancelBacktest('restart');
  currentBacktestRunId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  currentBacktestWorker = new Worker('lotto-backtest-worker.js');
  currentBacktestWorker.onmessage = handleBacktestWorkerMessage;
  currentBacktestWorker.onerror = function handleWorkerError() {
    finishBacktestFailure('הבדיקה נכשלה. הטפסים הקיימים נשארו ללא שינוי.');
  };
  setBacktestRunning(true);
  currentBacktestWorker.postMessage({
    type: 'run',
    runId: currentBacktestRunId,
    rows: currentData,
    windows: LottoStrategyCore.BACKTEST_WINDOWS,
  });
}

function cancelBacktest(reason) {
  if (currentBacktestWorker) currentBacktestWorker.terminate();
  currentBacktestWorker = null;
  currentBacktestRunId = null;
  setBacktestRunning(false);
  if (reason === 'user') renderBacktestStatus('הבדיקה בוטלה. לא בוצע שינוי בטפסים.');
}
```

Call `cancelBacktest('dataset-changed')` at the start of `processAnalysisRows(rawData)` before replacing `currentData`.

- [ ] **Step 6: Add responsive workspace and mode-control styles**

Use existing color tokens, 8px-or-smaller radii, stable button heights, and these layout rules:

```css
.backtest-workspace { padding: 18px; }
.backtest-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.backtest-actions, .backtest-window-strip, .backtest-tabs, .form-mode-control { display: flex; gap: 8px; flex-wrap: wrap; }
.backtest-window-strip span { min-width: 54px; text-align: center; padding: 7px 10px; border: 1px solid var(--success-border); border-radius: 6px; color: var(--success); }
.backtest-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.backtest-strategy-row { display: grid; grid-template-columns: 1.4fr .6fr .75fr .75fr .75fr .75fr; gap: 8px; align-items: center; }
.form-mode-control button { min-height: 36px; }
@media (max-width: 760px) {
  .backtest-toolbar { align-items: stretch; flex-direction: column; }
  .backtest-actions > * { flex: 1 1 140px; }
  .backtest-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .backtest-strategy-row { grid-template-columns: 1fr 1fr; }
  .backtest-strategy-row > *:first-child { grid-column: 1 / -1; }
}
@media (max-width: 420px) {
  .backtest-summary-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 7: Strengthen PIN regression coverage**

Append these assertions to `tests/verify-pinned-forms.js`:

```js
assert(/function applyFormMode\(source, mode\)/.test(html), 'Form mode switching must be explicit');
assert(/function pinCurrentForm\(source\)[\s\S]*getCombosForSource\(source\)/.test(html), 'PIN must snapshot the active form mode');
assert(/cancelBacktest\('dataset-changed'\)/.test(html), 'Loading another dataset must cancel an active Backtest');
```

- [ ] **Step 8: Run analyzer regression tests**

Run:

```bash
node tests/verify-backtest-ui.js
node tests/verify-analyzer-core-integration.js
node tests/verify-form2-diversity.js
node tests/verify-pinned-forms.js
```

Expected: all scripts print their `passed` messages.

- [ ] **Step 9: Commit analyzer Backtest UI and state**

Run:

```bash
git add lotto_analyzer.html tests/verify-backtest-ui.js tests/verify-pinned-forms.js
git commit -m "feat: add dedicated lotto backtest workspace"
```

Expected: one commit containing analyzer UI/state and its regression contracts.

---

### Task 7: Add ALL_IN_ONE Navigation and Responsive Browser Verification

**Files:**
- Modify: `Lotto_All_In_One.html:202-241,380-405,421-566`
- Modify: `.gitignore`
- Create: `tests/verify-backtest-shell.js`
- Create: `tests/verify-backtest-playwright.js`

**Interfaces:**
- Consumes: child `setAnalyzerWorkspace('analysis'|'backtest')` from Task 6.
- Produces: parent `openBacktestView()` plus top navigation and right-rail Backtest controls.

- [ ] **Step 1: Write the failing shell navigation test**

Create `tests/verify-backtest-shell.js`:

```js
'use strict';

const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('Lotto_All_In_One.html', 'utf8');
const required = [
  'id="navBacktestBtn"',
  'onclick="openBacktestView()"',
  'data-target="backtestWorkspace"',
  'function openBacktestView()',
  "setAnalyzerWorkspace('backtest')",
  "setAnalyzerWorkspace('analysis')",
  'backtest: document.getElementById(\'navBacktestBtn\')',
];
for (const token of required) assert.ok(html.includes(token), `Missing shell Backtest contract: ${token}`);

for (const script of [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1])) {
  new Function(script);
}

console.log('Backtest shell navigation verification passed');
```

- [ ] **Step 2: Run the shell test and verify it fails**

Run: `node tests/verify-backtest-shell.js`

Expected: FAIL on missing `navBacktestBtn`.

- [ ] **Step 3: Add top and rail navigation with workspace-aware routing**

Add this top navigation button before Print:

```html
<button class="nav-btn" id="navBacktestBtn" onclick="openBacktestView()" aria-pressed="false">📈 Backtest</button>
```

Add this as the third analyzer rail button:

```html
<button type="button" class="analyzer-rail-btn" data-target="backtestWorkspace" onclick="openBacktestView()">📈 Backtest</button>
```

Extend `setActiveSection` so `backtest` maps to the analyzer section and add it to `navMap`. Before any normal analyzer scroll, restore the child analysis workspace:

```js
function showChildAnalyzerWorkspace(mode) {
  const analyzerIframe = document.getElementById('analyzerIframe');
  if (!analyzerIframe || !analyzerIframe.contentWindow) return;
  if (typeof analyzerIframe.contentWindow.setAnalyzerWorkspace === 'function') {
    analyzerIframe.contentWindow.setAnalyzerWorkspace(mode);
  }
}

function openBacktestView() {
  setActiveSection('backtest', { preserveScroll: true, navTarget: 'backtest' });
  setActiveRailButton('backtestWorkspace');
  setTimeout(function focusBacktestWorkspace() {
    showChildAnalyzerWorkspace('backtest');
  }, 180);
}
```

At the start of the delayed callback in `goToAnalyzerSection`, call `showChildAnalyzerWorkspace('analysis')` before locating the target element.

- [ ] **Step 4: Add a Playwright responsive workflow test**

Add `test-results/` to `.gitignore`, then create `tests/verify-backtest-playwright.js`:

```js
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'test-results');
fs.mkdirSync(outputDir, { recursive: true });

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })[extension] || 'application/octet-stream';
}

function createServer() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.resolve(root, `.${relative}`);
    if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  });
}

function makeResult() {
  const combos = Array.from({ length: 14 }, (_, index) => ({
    comboNum: index + 1,
    strategy: `אסטרטגיה ${index + 1} · חלון ${[100, 200, 500][index % 3]}`,
    numbers: Array.from({ length: 6 }, (_, offset) => ((index + offset * 7) % 37) + 1).sort((a, b) => a - b),
    strong: (index % 7) + 1,
  }));
  const baselineMetrics = {
    averageScore: 9.5,
    averageBestMatches: 2.2,
    rate2Plus: 0.62,
    rate3Plus: 0.21,
    rate4Plus: 0.04,
    rate5Plus: 0.002,
    rate6: 0,
    strongOnBestRate: 0.29,
    averageCoverage: 29.4,
    maximumExposure: 8,
    maximumOverlap: 5,
  };
  const optimizedMetrics = {
    averageScore: 10.2,
    averageBestMatches: 2.3,
    rate2Plus: 0.66,
    rate3Plus: 0.23,
    rate4Plus: 0.05,
    rate5Plus: 0.003,
    rate6: 0,
    strongOnBestRate: 0.30,
    averageCoverage: 31.7,
    maximumExposure: 7,
    maximumOverlap: 4,
  };
  const policy = {
    validated: true,
    baseline: baselineMetrics,
    optimized: optimizedMetrics,
    reasons: [],
  };
  return {
    split: { eligibleCount: 1212, calibrationCount: 848, holdoutCount: 364 },
    policies: { main: policy, form2: policy },
    rankings: Array.from({ length: 84 }, (_, index) => ({
      identity: `main:${(index % 14) + 1}:${[100, 200, 500][index % 3]}`,
      window: [100, 200, 500][index % 3],
      calibration: { score: 100 - index / 10, rate3Plus: 0.2, stability: 0.9 },
      holdout: { score: 95 - index / 10, rate3Plus: 0.19, stability: 0.88 },
    })),
    currentForms: { main: combos, form2: combos.map(combo => ({ ...combo, numbers: combo.numbers.slice().reverse().sort((a, b) => a - b) })) },
  };
}

function overlaps(first, second) {
  return first.left < second.right && first.right > second.left
    && first.top < second.bottom && first.bottom > second.top;
}

async function runViewport(browser, baseUrl, viewport, screenshotName) {
  const page = await browser.newPage({ viewport });
  await page.route(/fonts\.googleapis\.com|cdn\.sheetjs\.com/, route => route.abort());
  await page.goto(`${baseUrl}/Lotto_All_In_One.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#navBacktestBtn').click();
  await page.waitForTimeout(250);

  const frame = page.frames().find(candidate => candidate.url().includes('lotto_analyzer.html'));
  assert.ok(frame, 'Analyzer iframe must load');
  await frame.locator('#backtestWorkspace').waitFor({ state: 'visible' });
  assert.strictEqual(await frame.locator('#results').getAttribute('hidden'), '');

  await frame.evaluate(result => renderBacktestResult(result), makeResult());
  for (const panelId of ['backtestSummaryPanel', 'backtestStrategiesPanel', 'backtestComparisonPanel']) {
    await frame.locator(`.backtest-tab[data-panel="${panelId}"]`).click();
    assert.ok(await frame.locator(`#${panelId}`).isVisible(), `${panelId} must be visible after selection`);
  }

  const boxes = await frame.locator('.backtest-actions button:visible').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
  assert.ok(boxes.every(box => box.right > box.left && box.bottom > box.top));
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      assert.ok(!overlaps(boxes[first], boxes[second]), 'Visible Backtest toolbar buttons must not overlap');
    }
  }

  const shellWidth = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  const analyzerWidth = await frame.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  assert.ok(shellWidth.scroll <= shellWidth.client + 1, 'Shell must not overflow horizontally');
  assert.ok(analyzerWidth.scroll <= analyzerWidth.client + 1, 'Analyzer must not overflow horizontally');

  await page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true });
  await page.close();
}

(async function verifyBacktestResponsiveUI() {
  const server = createServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await runViewport(browser, baseUrl, { width: 1440, height: 900 }, 'backtest-desktop.png');
    await runViewport(browser, baseUrl, { width: 390, height: 844 }, 'backtest-mobile.png');
    console.log('Backtest Playwright verification passed');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}()).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
```

Use the bundled runtime when `NODE_PATH` is not already configured:

```powershell
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tests\verify-backtest-playwright.js
```

Expected: `Backtest Playwright verification passed` and two screenshots under ignored `test-results/`.

- [ ] **Step 5: Run shell and browser tests**

Run:

```powershell
node tests\verify-backtest-shell.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tests\verify-backtest-playwright.js
```

Expected: both scripts print their `passed` messages; visually inspect both screenshots for clipped Hebrew text, overlapping navigation, unstable card sizes, and unreadable strategy rows.

- [ ] **Step 6: Commit shell navigation and browser verification**

Run:

```bash
git add .gitignore Lotto_All_In_One.html tests/verify-backtest-shell.js tests/verify-backtest-playwright.js
git commit -m "feat: expose responsive backtest navigation"
```

Expected: one commit containing parent routing and responsive regression coverage.

---

### Task 8: Full Regression, Performance Evidence, and GitHub Pages Publication

**Files:**
- Modify only when a verification failure identifies a concrete defect in a file owned by Tasks 1-7.

**Interfaces:**
- Consumes: all completed feature files and tests.
- Produces: a clean tested branch merged to `main`, pushed to `origin/main`, and verified on the public GitHub Pages URL.

- [ ] **Step 1: Run every JavaScript contract test**

Run:

```powershell
node tests\verify-strategy-core.js
node tests\verify-analyzer-core-integration.js
node tests\verify-backtest-core.js
node tests\verify-optimized-forms.js
node tests\verify-backtest-worker.js
node tests\verify-backtest-ui.js
node tests\verify-backtest-shell.js
node tests\verify-form2-diversity.js
node tests\verify-pinned-forms.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tests\verify-backtest-playwright.js
```

Expected: every script prints one final `passed` message and exits zero.

- [ ] **Step 2: Run the official-results updater regression suite**

Run: `python -m unittest tests.test_update_lotto_results -v`

Expected: all existing updater tests pass; no workbook change is produced by the test run.

- [ ] **Step 3: Record real-scale Backtest performance without changing production data**

Run the conditional real-scale benchmark added to `tests/verify-backtest-core.js` in Task 4. It uses `buildSyntheticDraws(1712)`, asserts split `{ eligibleCount: 1212, calibrationCount: 848, holdoutCount: 364 }`, verifies both current forms contain 14 rows, and prints elapsed time without enforcing a brittle hard limit.

Run:

```powershell
$env:LOTTO_FULL_BENCHMARK='1'
node tests\verify-backtest-core.js
Remove-Item Env:LOTTO_FULL_BENCHMARK
```

Expected: full-scale counts are correct, no memory error occurs, and elapsed milliseconds are printed.

- [ ] **Step 4: Inspect repository integrity**

Run:

```powershell
git diff --check
git status --short
git log --oneline -10
```

Expected: no whitespace errors, no unexpected generated files, and one intentional commit per completed task plus the approved design/plan commits.

- [ ] **Step 5: Perform two-stage code review**

Invoke `superpowers:requesting-code-review`. First review the implementation against `docs/superpowers/specs/2026-07-13-lottoamir-backtest-optimized-combinations-design.md`; then review maintainability, failure behavior, data leakage, and regression coverage. Resolve every confirmed high/medium finding and rerun Steps 1-4.

- [ ] **Step 6: Finish the development branch and publish**

Invoke `superpowers:finishing-a-development-branch`, select integration into local `main`, then run:

```powershell
git switch main
git merge --ff-only codex/lotto-backtest-optimized-combinations
git push origin main
```

Expected: push succeeds and `main` matches `origin/main`.

- [ ] **Step 7: Verify GitHub Pages**

Run:

```powershell
gh api repos/moadi1987-eng/LottoAmir/pages/builds/latest --jq "{status: .status, commit: .commit}"
```

Expected: the latest Pages build reports `built` for the pushed commit. Open `https://moadi1987-eng.github.io/LottoAmir/`, enter Backtest, verify baseline mode is usable before any run, and confirm a completed run can display improved forms without altering an existing PIN.
