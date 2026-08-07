# LottoAmir Four-PIN Win-Rate Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and validate four fresh 14-line Lotto forms as one 56-line portfolio, with two forms optimized for binary 3+ draw win rate and two forms optimized for binary 4+ draw win rate.

**Architecture:** Extend the existing DOM-free `LottoStrategyCore` with deterministic binary metrics, stable historical support, coverage/depth generators, equal-budget legacy comparison, and walk-forward validation. Run the expanded policy in the existing Web Worker, then render and manually PIN the four approved forms from the existing Backtest workspace without changing any saved PIN automatically.

**Tech Stack:** Static HTML/CSS/JavaScript, CommonJS-compatible browser core, Web Worker, Node `assert` verification scripts, Playwright browser verification, browser `localStorage`.

## Global Constraints

- Generate exactly four forms with exactly 14 valid six-number rows per form.
- Treat a draw as one win when any row reaches the threshold; never count total matches or multiple qualifying rows as multiple wins.
- Use regular-number thresholds only for 3+/4+/5+/6 rates; report the strong number separately.
- Build PIN 1 and PIN 2 as a joint 28-row coverage group with pairwise overlap at most two and regular-number exposure exactly four or five.
- Build PIN 3 and PIN 4 from exactly 14 depth-pool numbers and enumerate all `C(14, 6) = 3,003` candidate rows.
- Assign every strong number 1 through 7 exactly twice per form and eight times across the portfolio.
- Use only the 100, 200, and 500 draws before each target; the target and later draws must never affect its portfolio.
- Keep the chronological 70% calibration and 30% untouched holdout split.
- Compare the new portfolio with a deterministic legacy benchmark using the same 56-line budget.
- Require complete-portfolio 3+ holdout improvement before exposing forms as approved.
- Allow the depth pair at most a one-percentage-point 3+ holdout regression while requiring a strict 4+ improvement.
- Keep the deployed application static and deterministic; do not add an AI API, server, account, or database.
- Never replace, clear, or mutate a saved PIN until the user explicitly pins one approved portfolio form.
- Preserve existing two-form analysis, current comparisons, future PIN comparison, prize display, PIN sorting, RTL number display, save/load, and ticket transfer behavior.

---

## File Structure

- Modify `lotto-strategy-core.js`: all pure statistical, combinatorial, portfolio, legacy benchmark, confidence, and validation functions; no DOM access.
- Modify `lotto-backtest-worker.js`: forward expanded progress and return the versioned portfolio result.
- Modify `lotto_analyzer.html`: validate/cache the new result, render metrics and four form cards, and map each card to one existing PIN slot.
- Create `tests/verify-four-pin-binary-metrics.js`: binary draw-rate, Wilson interval, paired-count, and deterministic bootstrap tests.
- Create `tests/verify-four-pin-generators.js`: stable support, coverage template/search, depth enumeration, four-form structure, and strong rotation tests.
- Create `tests/verify-four-pin-backtest.js`: leakage, equal-budget legacy comparison, holdout gates, buckets, determinism, and result-shape tests.
- Create `tests/verify-four-pin-ui.js`: static/VM UI contract, cache validation, hidden-until-approved behavior, and PIN-slot mapping tests.
- Create `tests/verify-four-pin-playwright.js`: real-browser desktop/mobile Backtest, four-card, overwrite, persistence, and responsiveness verification.
- Modify `tests/verify-backtest-core.js`: preserve existing backtest assertions and assert the new portfolio envelope.
- Modify `tests/verify-backtest-worker.js`: assert portfolio progress and completion payloads.
- Modify `tests/verify-backtest-ui.js`: keep compatibility validation aligned with the expanded result.
- Modify `tests/verify-pinned-forms.js`: preserve four-slot hooks and accept portfolio-specific labels.
- Modify `tests/verify-pinned-forms-playwright.js`: ensure legacy PIN workflows and portfolio replacement coexist.

---

### Task 1: Binary Draw Outcomes and Confidence Statistics

**Files:**
- Modify: `lotto-strategy-core.js:8-17, 1399-1450, 1745-1775`
- Create: `tests/verify-four-pin-binary-metrics.js`

**Interfaces:**
- Consumes: combination objects shaped as `{ numbers: number[6], strong: number }` and normalized draws shaped as `{ numbers: number[6], strong: number }`.
- Produces: `flattenPortfolioForms(forms)`, `hasRegularWin(forms, draw, threshold)`, `hasRegularAndStrongWin(forms, draw, threshold)`, `scoreBinaryPortfolioDraw(forms, draw)`, `createBinaryRateAccumulator()`, `addBinaryRateObservation(accumulator, won)`, `finalizeBinaryRateAccumulator(accumulator)`, `wilsonInterval(wins, total, z)`, and `comparePairedBinaryOutcomes(newOutcomes, legacyOutcomes, options)`.
- Return shape for `comparePairedBinaryOutcomes`: `{ total, newWins, legacyWins, newRate, legacyRate, difference, newInterval, legacyInterval, differenceInterval, paired: { both, newOnly, legacyOnly, neither } }`.

- [ ] **Step 1: Write the failing binary-metric tests**

Create `tests/verify-four-pin-binary-metrics.js` with fixtures that prove each draw is counted once and that strong-number matches do not affect the result:

```js
'use strict';

const assert = require('assert');
const core = require('../lotto-strategy-core.js');

const draw = { numbers: [1, 2, 3, 4, 5, 6], strong: 7 };
const forms = {
  coverage1: [
    { numbers: [1, 2, 3, 10, 11, 12], strong: 7 },
    { numbers: [1, 2, 4, 20, 21, 22], strong: 1 },
  ],
  coverage2: [{ numbers: [1, 2, 10, 20, 30, 37], strong: 7 }],
};

assert.strictEqual(core.hasRegularWin(forms, draw, 3), true);
assert.strictEqual(core.hasRegularWin(forms, draw, 4), false);
assert.deepStrictEqual(core.scoreBinaryPortfolioDraw(forms, draw), {
  win3Plus: true,
  win4Plus: false,
  win5Plus: false,
  win6: false,
});

const strongOnly = {
  coverage1: [{ numbers: [10, 11, 12, 13, 14, 15], strong: 7 }],
};
assert.strictEqual(core.hasRegularWin(strongOnly, draw, 3), false);
assert.strictEqual(core.hasRegularAndStrongWin(forms, draw, 3), true);
assert.strictEqual(core.hasRegularAndStrongWin(strongOnly, draw, 3), false);

const accumulator = core.createBinaryRateAccumulator();
core.addBinaryRateObservation(accumulator, true);
core.addBinaryRateObservation(accumulator, true);
core.addBinaryRateObservation(accumulator, false);
assert.deepStrictEqual(core.finalizeBinaryRateAccumulator(accumulator), {
  wins: 2,
  total: 3,
  rate: 2 / 3,
  interval: core.wilsonInterval(2, 3),
});

const comparison = core.comparePairedBinaryOutcomes(
  [true, true, false, false],
  [true, false, true, false],
  { bootstrapSamples: 1000, seed: 'binary-fixture' },
);
assert.deepStrictEqual(comparison.paired, {
  both: 1,
  newOnly: 1,
  legacyOnly: 1,
  neither: 1,
});
assert.strictEqual(comparison.newRate, 0.5);
assert.strictEqual(comparison.legacyRate, 0.5);
assert.strictEqual(comparison.difference, 0);
assert.deepStrictEqual(
  comparison,
  core.comparePairedBinaryOutcomes(
    [true, true, false, false],
    [true, false, true, false],
    { bootstrapSamples: 1000, seed: 'binary-fixture' },
  ),
);

assert.throws(
  () => core.comparePairedBinaryOutcomes([true], [true, false]),
  error => error && error.code === 'PAIRED_LENGTH_MISMATCH',
);

console.log('Four-PIN binary metrics verification passed');
```

- [ ] **Step 2: Run the new test and observe RED**

Run:

```powershell
node tests\verify-four-pin-binary-metrics.js
```

Expected: failure because `hasRegularWin` and the other binary-statistics functions are not exported.

- [ ] **Step 3: Implement the binary outcome primitives**

Add version constants near the existing constants:

```js
const FOUR_PIN_PORTFOLIO_VERSION = 'four-pin-portfolio-v1';
const BINARY_METRIC_VERSION = 'draw-win-3plus-v1';
const CONFIDENCE_METHOD_VERSION = 'wilson-paired-bootstrap-v1';
const DEFAULT_BOOTSTRAP_SAMPLES = 10000;
```

Implement flattening and draw-level scoring without returning total hits or winning-row counts:

```js
function flattenPortfolioForms(forms) {
  if (Array.isArray(forms)) return forms.flatMap(value => (
    Array.isArray(value) ? value : [value]
  ));
  return Object.values(forms || {}).flatMap(value => (
    Array.isArray(value) ? value : []
  ));
}

function hasRegularWin(forms, draw, threshold) {
  const drawNumbers = new Set((draw && draw.numbers) || []);
  return flattenPortfolioForms(forms).some(combo => (
    (combo.numbers || []).filter(number => drawNumbers.has(number)).length >= threshold
  ));
}

function hasRegularAndStrongWin(forms, draw, threshold) {
  const drawNumbers = new Set((draw && draw.numbers) || []);
  return flattenPortfolioForms(forms).some(combo => (
    Number(combo.strong) === Number(draw && draw.strong)
    && (combo.numbers || []).filter(number => drawNumbers.has(number)).length >= threshold
  ));
}

function scoreBinaryPortfolioDraw(forms, draw) {
  return {
    win3Plus: hasRegularWin(forms, draw, 3),
    win4Plus: hasRegularWin(forms, draw, 4),
    win5Plus: hasRegularWin(forms, draw, 5),
    win6: hasRegularWin(forms, draw, 6),
  };
}
```

Implement Wilson bounds with `z = 1.959963984540054`, clamp bounds to `[0, 1]`, and return `{ low, high }` with `{ 0, 0 }` for zero samples. Implement the accumulator as `{ wins: 0, total: 0 }` and reject non-boolean observations with `INVALID_BINARY_OBSERVATION`.

Implement a local FNV-1a string seed and Mulberry32 generator for paired bootstrap resampling. Every bootstrap sample must draw paired indices, calculate `newRate - legacyRate`, sort the 10,000 differences, and return the 2.5th and 97.5th percentile values as `{ low, high }`. The paired four-cell counts must consume every target exactly once.

- [ ] **Step 4: Export the interfaces and run the focused test GREEN**

Add the new constants and functions to the returned `LottoStrategyCore` namespace. Run:

```powershell
node tests\verify-four-pin-binary-metrics.js
node tests\verify-backtest-core.js
```

Expected: both scripts print their success messages.

- [ ] **Step 5: Commit Task 1**

```powershell
git add lotto-strategy-core.js tests/verify-four-pin-binary-metrics.js
git commit -m "feat: add binary portfolio win metrics"
```

---

### Task 2: Stable Historical Support Across 100, 200, and 500 Draws

**Files:**
- Modify: `lotto-strategy-core.js:1000-1190, 1450-1570, 1745-1785`
- Create: `tests/verify-four-pin-generators.js`

**Interfaces:**
- Consumes: target-specific candidate pool from `buildWindowCandidatePool(...)`, calibration rankings from `evaluateStrategyWindows(...)`, target-specific earlier rows, and `[100, 200, 500]`.
- Produces: `rankPortfolioIdentities(rankings, windows)`, `buildStablePortfolioSupport(candidatePool, rankings, earlierRows, windows)`, and `selectDepthPool(support, count)`.
- `buildStablePortfolioSupport` returns `{ numbers: SupportRecord[37], strong: SupportRecord[7], byNumber: Record<number, SupportRecord>, byStrong: Record<number, SupportRecord> }`, where `SupportRecord` is `{ number, windowScores: Record<string, number>, medianScore, minimumScore, stableSupport }`.

- [ ] **Step 1: Add failing stable-support fixtures**

Start `tests/verify-four-pin-generators.js` with a compact explicit candidate pool. Give number `1` support in all three windows, number `2` support only in the 100-draw window, and number `3` medium support in all windows. Assert that stable support ranks `1` above `3` above `2` even when `2` is first in one window.

```js
'use strict';

const assert = require('assert');
const core = require('../lotto-strategy-core.js');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');

const windows = [100, 200, 500];
const candidates = [];
const rankings = [];
for (const windowSize of windows) {
  for (let index = 0; index < 4; index += 1) {
    const identity = `main:${index + 1}:${windowSize}`;
    const includesStable = index < 3;
    const includesSpike = windowSize === 100 && index === 0;
    candidates.push({
      identity,
      source: 'main',
      strategyId: index + 1,
      window: windowSize,
      numbers: [
        ...(includesStable ? [1, 3] : []),
        ...(includesSpike ? [2] : []),
        10 + index, 15 + index, 20 + index,
        25 + index, 30 + index, 37 - index,
      ].slice(0, 6),
      strong: (index % 7) + 1,
    });
    rankings.push({
      identity,
      source: 'main',
      strategyId: index + 1,
      window: windowSize,
      calibration: { rate3Plus: 0.40 - index * 0.05, stability: 1 - index * 0.1 },
    });
  }
}

const support = core.buildStablePortfolioSupport(
  candidates,
  rankings,
  buildSyntheticDraws(500),
  windows,
);
assert.strictEqual(support.numbers.length, 37);
assert.strictEqual(support.strong.length, 7);
assert.ok(support.byNumber[1].stableSupport > support.byNumber[3].stableSupport);
assert.ok(support.byNumber[3].stableSupport > support.byNumber[2].stableSupport);
assert.strictEqual(Object.keys(support.byNumber[1].windowScores).length, 3);

const pool = core.selectDepthPool(support, 14);
assert.strictEqual(pool.length, 14);
assert.strictEqual(new Set(pool).size, 14);
assert.ok(pool.every(number => Number.isInteger(number) && number >= 1 && number <= 37));
assert.deepStrictEqual(pool, core.selectDepthPool(support, 14));
```

- [ ] **Step 2: Run the generator test and observe RED**

```powershell
node tests\verify-four-pin-generators.js
```

Expected: failure because `buildStablePortfolioSupport` is missing.

- [ ] **Step 3: Implement binary identity ranking and regular support**

Implement `rankPortfolioIdentities` with this exact ordering:

```text
calibration.rate3Plus descending
calibration.stability descending
strategyId ascending
window ascending
identity lexicographically ascending
```

Inside each window, calculate the median `rate3Plus`; retain identities whose rate is greater than or equal to that median. Assign retained rank weights `(count - index) / count`. Sum a candidate's weight into every regular number it contains, normalize each window by that window's maximum support, and fill absent number/window cells with zero.

For exactly three window scores sorted ascending as `[a, b, c]`, calculate:

```js
const medianScore = b;
const minimumScore = a;
const stableSupport = medianScore * 0.70 + minimumScore * 0.30;
```

Sort support records by `stableSupport` descending, then number ascending.

- [ ] **Step 4: Implement strong support and depth-pool selection**

For each window, count strong numbers 1 through 7 in `toNewestFirst(earlierRows).slice(0, windowSize)`, normalize by the largest count in that window, and apply the same `0.70 * median + 0.30 * minimum` formula.

Implement `selectDepthPool` so records with non-zero scores in at least two windows rank first by stable support. Fill any remaining positions by minimum score, stable support, then number ascending. Throw `INVALID_DEPTH_POOL_SIZE` unless `count` is an integer from 6 through 37.

- [ ] **Step 5: Run focused and legacy tests GREEN**

```powershell
node tests\verify-four-pin-generators.js
node tests\verify-strategy-core.js
node tests\verify-optimized-forms.js
```

Expected: all three scripts pass.

- [ ] **Step 6: Commit Task 2**

```powershell
git add lotto-strategy-core.js tests/verify-four-pin-generators.js
git commit -m "feat: rank stable portfolio number support"
```

---

### Task 3: Deterministic 28-Row Coverage Generator

**Files:**
- Modify: `lotto-strategy-core.js` after the stable-support functions
- Modify: `tests/verify-four-pin-generators.js`

**Interfaces:**
- Consumes: regular support from `buildStablePortfolioSupport(...)`, a deterministic seed string, and optional search settings.
- Produces: `getSubsetKeys(numbers, size)`, `getCoverageGroupMetrics(rows)`, `buildCoveragePair(support, options)`, and the constant `COVERAGE_FORM_IDS = ['coverage1', 'coverage2']`.
- `buildCoveragePair` returns `{ forms: { coverage1: Combo[14], coverage2: Combo[14] }, rows: Combo[28], metrics, seed }` or throws a stable `COVERAGE_*` error.

- [ ] **Step 1: Extend the generator test with hard coverage assertions**

Append a test that calls `buildCoveragePair(support, { seed: 'coverage-fixture', searchIterations: 500 })` twice and asserts byte-equivalent output. Flatten both forms and assert:

```js
const coverage = core.buildCoveragePair(support, {
  seed: 'coverage-fixture',
  searchIterations: 500,
});
const repeatedCoverage = core.buildCoveragePair(support, {
  seed: 'coverage-fixture',
  searchIterations: 500,
});
assert.deepStrictEqual(coverage, repeatedCoverage);
assert.strictEqual(coverage.forms.coverage1.length, 14);
assert.strictEqual(coverage.forms.coverage2.length, 14);

const coverageRows = [...coverage.forms.coverage1, ...coverage.forms.coverage2];
assert.strictEqual(new Set(coverageRows.map(row => row.numbers.join('-'))).size, 28);
const coverageMetrics = core.getCoverageGroupMetrics(coverageRows);
assert.strictEqual(coverageMetrics.maximumOverlap, 2);
assert.strictEqual(coverageMetrics.uniqueTripleCount, 28 * 20);
assert.ok(Object.values(coverageMetrics.numberExposure).every(count => count === 4 || count === 5));
```

Also assert that every row contains six sorted unique integers from 1 through 37 and that `getSubsetKeys([1, 2, 3, 4, 5, 6], 3)` contains exactly 20 keys.

- [ ] **Step 2: Run the focused test and observe RED**

```powershell
node tests\verify-four-pin-generators.js
```

Expected: failure because `buildCoveragePair` is missing.

- [ ] **Step 3: Add the proven balanced coverage seed**

Add `const PORTFOLIO_CONSTRAINT_VERSION = 'four-pin-constraints-v1';`, export it, and add an immutable 28-row template over positions 1 through 37. Use this verified seed, whose combined exposures are four or five and whose pairwise row overlap is at most two:

```js
const COVERAGE_TEMPLATE = Object.freeze([
  [13,14,20,24,33,37], [9,14,21,25,32,37], [2,5,14,19,27,37],
  [3,5,13,17,28,31], [2,7,9,11,25,26], [8,12,17,27,31,33],
  [1,9,10,16,21,36], [3,6,7,26,29,30], [7,11,17,18,19,34],
  [2,11,15,21,29,30], [4,10,12,30,31,34], [5,8,15,26,34,35],
  [7,8,13,16,21,28], [3,14,18,27,30,32], [3,4,18,20,28,35],
  [5,9,11,29,33,36], [4,13,16,23,33,36], [1,10,15,18,20,22],
  [6,9,13,20,22,32], [1,4,5,11,19,24], [4,15,16,19,22,28],
  [8,17,20,23,25,37], [6,12,15,18,31,35], [1,12,22,23,32,35],
  [2,6,10,12,17,19], [1,2,7,23,24,29], [3,10,24,26,27,34],
  [6,8,14,16,25,36],
]);
```

Map the 20 highest-support regular numbers onto template positions 1 through 20, which have exposure five, and map the remaining 17 numbers onto positions 21 through 37, which have exposure four. This gives a valid deterministic starting portfolio for every valid support vector.

- [ ] **Step 4: Implement subset metrics and constraint-preserving search**

Implement `getSubsetKeys` using index combinations and sorted `'-'` keys. `getCoverageGroupMetrics` must return:

```js
{
  rowCount,
  uniqueCombinationCount,
  uniquePairCount,
  uniqueTripleCount,
  maximumOverlap,
  numberExposure,
  exposureSpread,
}
```

Use the seeded PRNG from Task 1 for exactly `searchIterations` candidate swaps. A candidate move swaps two number positions between different rows, preserving total exposure. Reject moves that create a duplicate within a row, duplicate row key, or overlap above two. Compare accepted portfolios lexicographically by unique triples, unique pairs, the sum of stable support on exposure-five numbers, and sorted portfolio key. Because the seed already reaches all hard constraints and 560 unique triples, search may improve pair coverage but may never return a structurally worse result.

Partition the final rows into two 14-row forms. Start with alternating rows after sorting by combination key, then use constraint-preserving row swaps to minimize the sum of the two forms' exposure variances. Assign `comboNum` 1 through 14 and strategy labels `כיסוי 3+`.

- [ ] **Step 5: Run generator and regression tests GREEN**

```powershell
node tests\verify-four-pin-generators.js
node tests\verify-strategy-core.js
node tests\verify-optimized-forms.js
```

- [ ] **Step 6: Commit Task 3**

```powershell
git add lotto-strategy-core.js tests/verify-four-pin-generators.js
git commit -m "feat: generate balanced coverage PIN pair"
```

---

### Task 4: Exhaustive Depth Generator, Four-Form Assembly, and Strong Rotation

**Files:**
- Modify: `lotto-strategy-core.js`
- Modify: `tests/verify-four-pin-generators.js`

**Interfaces:**
- Consumes: the selected 14-number pool, stable support, coverage row keys, target-specific earlier rows, and a deterministic seed.
- Produces: `cloneCombinationRows(rows)`, `enumerateNumberCombinations(values, choose)`, `getDepthGroupMetrics(rows, pool)`, `buildDepthPair(pool, support, forbiddenKeys, options)`, `assignPortfolioStrongNumbers(forms, strongSupport)`, `buildLegacy56Portfolio(earlierRows)`, and `buildFourPinPortfolio(earlierRows, candidatePool, rankings, options)`.
- Four-form keys are exactly `coverage1`, `coverage2`, `depth1`, and `depth2`.

- [ ] **Step 1: Add failing exhaustive-depth and assembly tests**

Append these assertions to `tests/verify-four-pin-generators.js`:

```js
const depthPool = core.selectDepthPool(support, 14);
const universe = core.enumerateNumberCombinations(depthPool, 6);
assert.strictEqual(universe.length, 3003);
assert.strictEqual(new Set(universe.map(numbers => numbers.join('-'))).size, 3003);

const coverageKeys = new Set(coverage.rows.map(row => row.numbers.join('-')));
const depth = core.buildDepthPair(depthPool, support, coverageKeys, {
  seed: 'depth-fixture',
  searchIterations: 500,
});
assert.strictEqual(depth.forms.depth1.length, 14);
assert.strictEqual(depth.forms.depth2.length, 14);
const depthRows = [...depth.forms.depth1, ...depth.forms.depth2];
assert.strictEqual(new Set(depthRows.map(row => row.numbers.join('-'))).size, 28);
assert.ok(depthRows.every(row => row.numbers.every(number => depthPool.includes(number))));
assert.ok(depthRows.every(row => !coverageKeys.has(row.numbers.join('-'))));

const portfolioRows = buildSyntheticDraws(540);
const portfolioPlan = core.createBacktestPlan(portfolioRows);
const portfolioTarget = 539;
const portfolio = core.buildFourPinPortfolio(
  portfolioPlan.chronological.slice(0, portfolioTarget).reverse(),
  core.buildWindowCandidatePool(
    portfolioPlan.chronological,
    portfolioTarget,
  ),
  core.evaluateStrategyWindows(portfolioRows).rankings,
  { seed: 'portfolio-fixture', coverageSearchIterations: 200, depthSearchIterations: 200 },
);
assert.deepStrictEqual(Object.keys(portfolio.forms), [
  'coverage1', 'coverage2', 'depth1', 'depth2',
]);
assert.strictEqual(Object.values(portfolio.forms).flat().length, 56);
assert.strictEqual(new Set(
  Object.values(portfolio.forms).flat().map(row => row.numbers.join('-')),
).size, 56);
for (const form of Object.values(portfolio.forms)) {
  const counts = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i + 1, 0]));
  form.forEach(row => { counts[row.strong] += 1; });
  assert.deepStrictEqual(counts, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2 });
}
```

Add a legacy benchmark assertion that `buildLegacy56Portfolio(rows)` returns 56 rows under the same four keys and is deterministic.

- [ ] **Step 2: Run the generator test and observe RED**

```powershell
node tests\verify-four-pin-generators.js
```

Expected: failure on `enumerateNumberCombinations`.

- [ ] **Step 3: Implement the 3,003-row universe and depth metrics**

Implement recursive index enumeration with sorted unique input. Throw `INVALID_COMBINATION_SIZE` when `choose` is outside `1..values.length` and `INVALID_COMBINATION_VALUES` for duplicate or invalid regular numbers.

Precompute each candidate's row key, 15 four-subset keys, six five-subset keys, stable-support sum, and overlap against forbidden coverage rows. `getDepthGroupMetrics` returns row count, unique row count, unique four-subset count, unique five-subset count, number exposure, maximum overlap, and pool coverage.

- [ ] **Step 4: Implement deterministic greedy selection and local replacement**

Select 28 rows one at a time. For each remaining candidate, compare:

```text
new four-subset keys descending
new five-subset keys descending
stable-support sum descending
maximum overlap with selected rows ascending
number-exposure variance after selection ascending
row key ascending
```

Skip forbidden coverage keys and already selected rows. Run exactly `searchIterations` seeded replacement attempts; accept only portfolios that improve the same lexicographic objective. Partition selected rows into two 14-row forms with alternating greedy assignment that maximizes new four-subsets in the receiving form and balances exposure.

- [ ] **Step 5: Implement strong assignment and four-form assembly**

`assignPortfolioStrongNumbers` must order strong numbers by `stableSupport` descending and number ascending, repeat that seven-number order once per form, then swap assignments between rows only when doing so lowers the number of equal-strong assignments among row pairs sharing the highest regular overlap. It must never change a row's regular numbers.

`buildFourPinPortfolio` performs this order:

```text
stable support -> coverage pair -> 14-number pool -> depth pair
-> four-form strong assignment -> structural validation
```

Return `{ forms, depthPool, support, coverageMetrics, depthMetrics, fingerprintSeed }`. Throw a stable error code naming the failed stage rather than returning partial forms.

- [ ] **Step 6: Implement the equal-budget legacy benchmark**

Implement `cloneCombinationRows(rows)` as `rows.map(combo => ({ ...combo, numbers: combo.numbers.slice() }))`. `buildLegacy56Portfolio(earlierRows)` uses:

```js
const expanding = generateBaselineForms(earlierRows);
const latest500 = generateBaselineForms(toNewestFirst(earlierRows).slice(0, 500));
return {
  coverage1: cloneCombinationRows(expanding.main),
  coverage2: cloneCombinationRows(expanding.form2),
  depth1: cloneCombinationRows(latest500.main),
  depth2: cloneCombinationRows(latest500.form2),
};
```

Do not deduplicate the legacy portfolio; its natural overlap is part of the documented benchmark. Normalize each form to 14 rows and throw `LEGACY_PORTFOLIO_INVALID` if any form is incomplete.

- [ ] **Step 7: Run focused and existing structural tests GREEN**

```powershell
node tests\verify-four-pin-generators.js
node tests\verify-optimized-forms.js
node tests\verify-form2-diversity.js
node tests\verify-strategy-core.js
```

- [ ] **Step 8: Commit Task 4**

```powershell
git add lotto-strategy-core.js tests/verify-four-pin-generators.js
git commit -m "feat: assemble four-form Lotto portfolio"
```

---

### Task 5: Leak-Free Four-PIN Walk-Forward Policy and Validation Gate

**Files:**
- Modify: `lotto-strategy-core.js:1350-1775`
- Create: `tests/verify-four-pin-backtest.js`
- Modify: `tests/verify-backtest-core.js`

**Interfaces:**
- Consumes: `createBacktestPlan`, calibration rankings, target-specific earlier rows/candidates, `buildFourPinPortfolio`, `buildLegacy56Portfolio`, and Task 1 binary accumulators.
- Produces: `runFourPinPortfolioBacktest(rows, options)` and `validateFourPinPortfolioResult(result)`; `runWalkForwardBacktest` includes the returned object at `result.portfolio`.
- Portfolio envelope: `{ version, constraintVersion, metricVersion, confidenceVersion, validated, reasons, sampleCount, selectionFailures, current, comparisons, diagnostics, bucketDifferences, bucketSampleCounts }`.

- [ ] **Step 1: Write failing policy, leakage, and gate tests**

Create `tests/verify-four-pin-backtest.js`. Use `buildSyntheticDraws(540)` and low deterministic search budgets in test options. Assert:

```js
'use strict';

const assert = require('assert');
const core = require('../lotto-strategy-core.js');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');

const rows = buildSyntheticDraws(540);
const options = {
  windows: [100, 200, 500],
  coverageSearchIterations: 50,
  depthSearchIterations: 50,
  bootstrapSamples: 500,
};
const result = core.runFourPinPortfolioBacktest(rows, options);
assert.strictEqual(result.sampleCount, 12);
assert.strictEqual(result.selectionFailures, 0);
assert.strictEqual(typeof result.validated, 'boolean');
assert.ok(Array.isArray(result.reasons));
assert.deepStrictEqual(Object.keys(result.current.forms), [
  'coverage1', 'coverage2', 'depth1', 'depth2',
]);
for (const key of ['portfolio3Plus', 'coverage3Plus', 'depth3Plus', 'depth4Plus']) {
  const comparison = result.comparisons[key];
  assert.strictEqual(comparison.total, 12);
  assert.strictEqual(
    comparison.paired.both + comparison.paired.newOnly
      + comparison.paired.legacyOnly + comparison.paired.neither,
    12,
  );
}
assert.strictEqual(result.diagnostics.portfolio3PlusStrong.total, 12);
assert.strictEqual(result.bucketDifferences.length, 3);
assert.strictEqual(result.bucketSampleCounts.length, 3);
assert.strictEqual(result.bucketSampleCounts.reduce((sum, count) => sum + count, 0), 12);
assert.deepStrictEqual(result, core.runFourPinPortfolioBacktest(rows, options));
```

Mutate the first holdout target and every later row. Assert that the portfolio generated for that first target is unchanged by exposing a test-only `buildPortfolioAtTarget(chronological, targetIndex, rankings, options)` interface. Mutate a row before the target and assert the fingerprint seed changes.

Create explicit gate fixtures passed to `validateFourPinPortfolioResult` for each rejection reason:

```text
selection-failure
portfolio-three-plus-regression
coverage-three-plus-regression
depth-four-plus-regression
depth-three-plus-guardrail
bucket-instability
insufficient-bucket-samples
```

- [ ] **Step 2: Run the policy test and observe RED**

```powershell
node tests\verify-four-pin-backtest.js
```

Expected: failure because `runFourPinPortfolioBacktest` is missing.

- [ ] **Step 3: Implement target-scoped generation with no future access**

`buildPortfolioAtTarget` must derive exactly:

```js
const earlierChronological = chronological.slice(0, targetIndex);
const earlierNewestFirst = earlierChronological.slice().reverse();
const candidatePool = buildWindowCandidatePool(
  chronological,
  targetIndex,
  windows,
);
```

Pass only those values and fixed calibration rankings into `buildFourPinPortfolio`. Never pass the target draw or the full unsliced rows. Use `fingerprintRows(earlierNewestFirst)` plus algorithm versions as the deterministic seed.

- [ ] **Step 4: Implement holdout binary accumulation and paired comparisons**

For every holdout target, generate the new and legacy four-form portfolios and append booleans for:

```js
newPortfolio3.push(hasRegularWin(Object.values(newForms), draw, 3));
legacyPortfolio3.push(hasRegularWin(Object.values(legacyForms), draw, 3));
newCoverage3.push(hasRegularWin([newForms.coverage1, newForms.coverage2], draw, 3));
legacyCoverage3.push(hasRegularWin([legacyForms.coverage1, legacyForms.coverage2], draw, 3));
newDepth3.push(hasRegularWin([newForms.depth1, newForms.depth2], draw, 3));
legacyDepth3.push(hasRegularWin([legacyForms.depth1, legacyForms.depth2], draw, 3));
newDepth4.push(hasRegularWin([newForms.depth1, newForms.depth2], draw, 4));
legacyDepth4.push(hasRegularWin([legacyForms.depth1, legacyForms.depth2], draw, 4));
newPortfolio3Strong.push(hasRegularAndStrongWin(Object.values(newForms), draw, 3));
legacyPortfolio3Strong.push(hasRegularAndStrongWin(Object.values(legacyForms), draw, 3));
```

Each array receives exactly one boolean per holdout draw. If new portfolio generation fails for a target, increment `selectionFailures`, append `false` to each new-policy array, and still append the scored legacy booleans. This preserves the holdout denominator and treats an unusable generated ticket as a loss instead of silently dropping the target.

Build three chronological holdout buckets with `getChronologyBucket` and store the complete-portfolio 3+ new-minus-legacy rate difference and sample count per bucket. Set an empty bucket's difference to zero but mark the full result unvalidated with `insufficient-bucket-samples` whenever fewer than three holdout targets exist.

- [ ] **Step 5: Implement the exact validation gate**

`validateFourPinPortfolioResult` returns `{ validated, reasons }` and checks in this order:

```js
if (selectionFailures > 0) reasons.push('selection-failure');
if (portfolio3Plus.difference <= 0) reasons.push('portfolio-three-plus-regression');
if (coverage3Plus.difference < 0) reasons.push('coverage-three-plus-regression');
if (depth4Plus.difference <= 0) reasons.push('depth-four-plus-regression');
if (depth3Plus.difference < -0.01) reasons.push('depth-three-plus-guardrail');
if (bucketSampleCounts.some(count => count < 1)) reasons.push('insufficient-bucket-samples');
if (bucketDifferences.filter(value => value >= 0).length < 2) reasons.push('bucket-instability');
```

Structural generation failure increments `selectionFailures` and records no partial active form. The result still reports the completed target count and failure code.

- [ ] **Step 6: Attach the portfolio envelope to the existing backtest**

Bump `ALGORITHM_VERSION` and `CONSTRAINT_VERSION`. `runWalkForwardBacktest` must retain existing `rankings`, `policies`, and `currentForms`, then add:

```js
portfolio: runFourPinPortfolioBacktest(rows, {
  ...options,
  rankings,
  plan,
})
```

Reuse the already calculated plan and rankings so the full run does not repeat identity evaluation. Emit progress phases `portfolio-holdout` and `portfolio-current` through the existing callback.

After holdout evaluation, build the current recommendation from all loaded rows without inventing a target draw:

```js
const currentCandidatePool = plan.windows.flatMap(windowSize => (
  generateRawCandidates(toNewestFirst(rows), windowSize)
));
const current = buildFourPinPortfolio(
  toNewestFirst(rows),
  currentCandidatePool,
  rankings,
  { ...options, seed: `${fingerprintRows(rows)}:${FOUR_PIN_PORTFOLIO_VERSION}` },
);
```

If current generation fails, return `current: null`, include `current-generation-failure` in `reasons`, and force `validated` false. A successful but statistically rejected policy may retain `current` for diagnostics, while the UI still hides its rows.

Extend `tests/verify-backtest-core.js` to assert `result.portfolio`, its four current forms, version fields, comparison totals, and determinism.

- [ ] **Step 7: Run core policy tests GREEN**

```powershell
node tests\verify-four-pin-binary-metrics.js
node tests\verify-four-pin-generators.js
node tests\verify-four-pin-backtest.js
node tests\verify-backtest-core.js
node tests\verify-optimized-forms.js
```

- [ ] **Step 8: Commit Task 5**

```powershell
git add lotto-strategy-core.js tests/verify-four-pin-backtest.js tests/verify-backtest-core.js
git commit -m "feat: validate four-PIN win-rate policy"
```

---

### Task 6: Worker Progress, Cache Compatibility, and Safe Result Hydration

**Files:**
- Modify: `lotto-backtest-worker.js:1-27`
- Modify: `lotto_analyzer.html:1437-1815, 3235-3420`
- Modify: `tests/verify-backtest-worker.js`
- Modify: `tests/verify-backtest-ui.js`
- Create: `tests/verify-four-pin-ui.js`

**Interfaces:**
- Consumes: expanded `runWalkForwardBacktest` result and progress phases from Task 5.
- Produces: versioned cache validation, `isValidPortfolioForm`, `isCompatibleFourPinPortfolioResult`, `hydrateFourPinPortfolio`, and page state `currentFourPinPortfolio`.

- [ ] **Step 1: Write failing worker and cache-contract assertions**

Extend `tests/verify-backtest-worker.js` to assert at least one `portfolio-holdout` progress message and that the complete message contains `result.portfolio.current.forms.coverage1` with 14 rows.

Create `tests/verify-four-pin-ui.js` using the VM harness pattern from `tests/verify-backtest-ui.js`. Require these tokens:

```js
const required = [
  'let currentFourPinPortfolio = null',
  'function isValidPortfolioForm(form, role, forbiddenKeys)',
  'function isCompatibleFourPinPortfolioResult(portfolio)',
  'function hydrateFourPinPortfolio(result)',
  'id="fourPinPortfolioPanel"',
  'data-portfolio-role="coverage1"',
  'data-portfolio-role="coverage2"',
  'data-portfolio-role="depth1"',
  'data-portfolio-role="depth2"',
];
```

Save a valid result, reload it, corrupt one depth row, corrupt one version, and assert each corrupt cache is rejected without throwing.

- [ ] **Step 2: Run worker/UI tests and observe RED**

```powershell
node tests\verify-backtest-worker.js
node tests\verify-four-pin-ui.js
```

- [ ] **Step 3: Extend worker progress without changing cancellation semantics**

Keep the existing request and error envelope. Forward Task 5 progress unchanged and add no worker-global mutable portfolio state. Confirm that an exception still yields `{ type: 'error', runId, code, message }` and never posts a partial `complete` message.

- [ ] **Step 4: Version the browser cache and validate the complete portfolio**

Change the cache prefix to a new version such as `lottoBacktestCacheV2:`. Extend `isCompatibleBacktestResult` to require:

```text
portfolio.version === FOUR_PIN_PORTFOLIO_VERSION
portfolio.constraintVersion === PORTFOLIO_CONSTRAINT_VERSION
portfolio.metricVersion === BINARY_METRIC_VERSION
portfolio.confidenceVersion === CONFIDENCE_METHOD_VERSION
four current forms with 14 rows each
56 unique new regular-number rows
balanced strong rotation per form
four finite gate comparisons with totals equal to holdoutCount
a finite `diagnostics.portfolio3PlusStrong` paired comparison with total equal to holdoutCount
three finite bucket differences
three non-negative integer bucket sample counts summing to holdoutCount
boolean validated and string[] reasons
```

Permit `portfolio.current === null` only when `portfolio.validated === false`. When `current` is non-null, validate all four forms even if the statistical gate failed. A validated portfolio must always contain a compatible non-null `current` recommendation.

`isValidPortfolioForm` validates regular numbers and strong rotation but applies role-specific rules: coverage pair overlap/exposure is checked across both coverage forms; depth rows must use the declared 14-number pool; all later form keys are forbidden exact duplicates.

- [ ] **Step 5: Hydrate safe page state only after complete validation**

Add:

```js
let currentFourPinPortfolio = null;

function hydrateFourPinPortfolio(result) {
  currentFourPinPortfolio = result && result.portfolio
    && isCompatibleFourPinPortfolioResult(result.portfolio)
    ? JSON.parse(JSON.stringify(result.portfolio))
    : null;
  return currentFourPinPortfolio;
}
```

Call it after loading a compatible cache and after a worker completion. Clear it when the dataset changes or a run returns an incompatible result. Do not write portfolio rows into `baselineForms`, `optimizedForms`, `currentCombinations`, or existing PIN state.

- [ ] **Step 6: Map all progress phases to a monotonic percentage**

Replace the two-phase percentage branch with a fixed phase range map:

```js
const BACKTEST_PROGRESS_RANGES = {
  'identity-evaluation': [0, 55],
  'holdout-policies': [55, 70],
  'portfolio-holdout': [70, 95],
  'portfolio-current': [95, 100],
};
```

Clamp the rendered percentage from 0 through 100. Unknown phases keep the current percentage and update only the text label.

- [ ] **Step 7: Run worker, cache, and legacy UI tests GREEN**

```powershell
node tests\verify-backtest-worker.js
node tests\verify-backtest-ui.js
node tests\verify-four-pin-ui.js
node tests\verify-analyzer-core-integration.js
```

- [ ] **Step 8: Commit Task 6**

```powershell
git add lotto-backtest-worker.js lotto_analyzer.html tests/verify-backtest-worker.js tests/verify-backtest-ui.js tests/verify-four-pin-ui.js
git commit -m "feat: hydrate versioned four-PIN results"
```

---

### Task 7: Backtest Portfolio UI and Manual Mapping to the Four Existing PIN Slots

**Files:**
- Modify: `lotto_analyzer.html:860-970, 1403-1430, 1440-2075, 2460-2755, 3290-3350`
- Modify: `tests/verify-four-pin-ui.js`
- Modify: `tests/verify-pinned-forms.js`
- Modify: `tests/verify-pinned-forms-playwright.js`

**Interfaces:**
- Consumes: `currentFourPinPortfolio.current.forms`, its validation status, comparison metrics, and existing PIN V2 storage.
- Produces: `PORTFOLIO_PIN_SLOT_MAP`, `getPortfolioForm(role)`, `canPinPortfolioForm(role)`, `pinPortfolioForm(role)`, `renderFourPinPortfolio(result)`, and persistent portfolio labels in existing PIN records.

- [ ] **Step 1: Add failing UI and slot-mapping tests**

Extend `tests/verify-four-pin-ui.js` with this exact mapping contract:

```js
const expectedSlotMap = {
  coverage1: { source: 'main', mode: 'baseline' },
  coverage2: { source: 'main', mode: 'improved' },
  depth1: { source: 'form2', mode: 'baseline' },
  depth2: { source: 'form2', mode: 'improved' },
};
```

In the VM harness, inject a validated portfolio and assert all four `canPinPortfolioForm` results are true. Set `validated` false and assert all are false. Invoke `pinPortfolioForm('coverage1')`, confirm that only `pinnedForms.main.baseline` changes, its combinations equal the coverage form, and its label is `PIN 1 - כיסוי 3+`. Repeat for the other three roles.

Update `tests/verify-pinned-forms.js` to require `pinPortfolioForm('coverage1')` through `pinPortfolioForm('depth2')` hooks while retaining every existing main/form2 baseline/improved hook.

- [ ] **Step 2: Run focused tests and observe RED**

```powershell
node tests\verify-four-pin-ui.js
node tests\verify-pinned-forms.js
```

- [ ] **Step 3: Render binary-rate summary and validation evidence**

Add `#fourPinPortfolioPanel` beneath the existing Backtest summary grid. Render:

```text
56-line 3+ legacy rate | new rate | percentage-point difference
coverage-pair 3+ legacy rate | new rate
depth-pair 3+ legacy rate | new rate
depth-pair 4+ legacy rate | new rate
portfolio 3+ with matching strong-number diagnostic, kept outside every gate
holdout sample count
95% intervals and paired both/new-only/legacy-only/neither counts
each validation gate and rejection reason
```

Use `formatBacktestPercent` for rates and a new `formatPercentagePointDifference(value)` that shows an explicit sign and one decimal point. Do not render old point totals or average match counts inside the new portfolio panel.

- [ ] **Step 4: Render four form cards only when approved**

Each approved card uses the existing combination visual language and includes:

```html
<article class="portfolio-form-card" data-portfolio-role="coverage1">
  <h3>PIN 1 - כיסוי 3+</h3>
  <div class="portfolio-form-rows"></div>
  <button type="button" onclick="pinPortfolioForm('coverage1')">📌 קבע כ-PIN 1</button>
</article>
```

Render equivalent cards for `coverage2`, `depth1`, and `depth2`. When `validated` is false, render metrics and reasons but no row values and no enabled PIN buttons. Add the disclaimer that historical analysis does not guarantee future results.

- [ ] **Step 5: Implement safe mapping into existing PIN V2 slots**

Add the immutable map:

```js
const PORTFOLIO_PIN_SLOT_MAP = Object.freeze({
  coverage1: { source: 'main', mode: 'baseline', label: 'PIN 1 - כיסוי 3+' },
  coverage2: { source: 'main', mode: 'improved', label: 'PIN 2 - כיסוי 3+' },
  depth1: { source: 'form2', mode: 'baseline', label: 'PIN 3 - עומק 4+' },
  depth2: { source: 'form2', mode: 'improved', label: 'PIN 4 - עומק 4+' },
});
```

`pinPortfolioForm` must:

1. require a loaded analysis and a validated compatible portfolio;
2. resolve exactly one existing source/mode slot;
3. show the existing overwrite confirmation when occupied;
4. clone exactly 14 rows and anchor them to the latest loaded draw;
5. save through `savePinnedForms`;
6. rerender PIN status and future comparisons;
7. leave every other slot byte-equivalent.

Update `normalizePinnedSlot` so a safe saved `label` and `fullLabel` are preserved instead of always replaced by source/mode defaults. Sanitize labels through existing escaping at render time. Legacy V1/V2 records without custom labels keep the old default labels.

- [ ] **Step 6: Preserve legacy PIN operations**

Keep `pinForm`, `clearPinnedForm`, `sendPinnedFormToForm`, `getFutureRowsForPin`, prize calculations, sorting, and source grouping operational. A portfolio snapshot continues to carry the underlying source/mode slot so existing send, clear, and future comparison functions need no branching on portfolio role.

Extend `tests/verify-pinned-forms-playwright.js` with one scenario that pins a portfolio role, reloads the page, verifies its custom label and 14 rows persist, and confirms the other three existing slots are unchanged.

- [ ] **Step 7: Add responsive styles**

Use a four-card responsive grid:

```css
.portfolio-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 760px) {
  .portfolio-form-grid { grid-template-columns: 1fr; }
}
```

Keep row number tokens on one line inside a card-local horizontal scroller. No new page-level horizontal overflow is allowed at 390px.

- [ ] **Step 8: Run UI and PIN regression tests GREEN**

```powershell
node tests\verify-four-pin-ui.js
node tests\verify-backtest-ui.js
node tests\verify-pinned-forms.js
node tests\verify-analyzer-core-integration.js
```

- [ ] **Step 9: Commit Task 7**

```powershell
git add lotto_analyzer.html tests/verify-four-pin-ui.js tests/verify-pinned-forms.js tests/verify-pinned-forms-playwright.js
git commit -m "feat: render and PIN four optimized forms"
```

---

### Task 8: Real-Browser Verification, Performance Gate, and Full Regression

**Files:**
- Create: `tests/verify-four-pin-playwright.js`
- Modify: `tests/verify-pinned-forms-playwright.js` only for confirmed integration findings
- Modify: `tests/verify-backtest-playwright.js` only for confirmed integration findings
- Modify: `.gitignore` only if a new screenshot output path is not already ignored

**Interfaces:**
- Consumes: the completed core, worker, cache, Backtest UI, and PIN mapping.
- Produces: reproducible desktop/mobile evidence and a full-suite release gate.

- [ ] **Step 1: Write the failing Playwright workflow**

Create `tests/verify-four-pin-playwright.js` following the local HTTP-server and iframe helpers in `tests/verify-backtest-playwright.js`. Use a deterministic injected compatible result rather than waiting for the full real backtest in every viewport. Verify at 1440x900 and 390x844:

```text
the Backtest workspace opens
the binary 3+ summary contains no NaN or Infinity
all four approved form cards contain 14 rows
all four PIN buttons are visible and enabled
PIN 1 writes only main/baseline
PIN 4 writes only form2/improved
overwrite cancellation preserves the previous snapshot
reload preserves custom portfolio labels and rows
an unvalidated result exposes metrics but no row numbers or active PIN buttons
document scrollWidth is no greater than document clientWidth
```

Save screenshots to `test-results/four-pin-desktop.png` and `test-results/four-pin-mobile.png`.

- [ ] **Step 2: Load the bundled Playwright runtime and observe RED**

Use the workspace dependency paths:

```powershell
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\verify-four-pin-playwright.js
```

Expected: the new workflow fails until all expected selectors and state transitions exist.

- [ ] **Step 3: Fix only confirmed browser integration findings**

For each failure, add the smallest permanent assertion to the focused Node or Playwright test first, rerun to confirm RED, make the minimal production change, then rerun the focused test GREEN. Do not refactor unrelated analyzer sections.

- [ ] **Step 4: Run the complete Node verification suite**

```powershell
node tests\test-lotto-combos.js
node tests\verify-strategy-core.js
node tests\verify-analyzer-core-integration.js
node tests\verify-backtest-core.js
node tests\verify-optimized-forms.js
node tests\verify-backtest-worker.js
node tests\verify-backtest-ui.js
node tests\verify-backtest-review-fixes.js
node tests\verify-backtest-shell.js
node tests\verify-form2-diversity.js
node tests\verify-pinned-forms.js
node tests\verify-four-pin-binary-metrics.js
node tests\verify-four-pin-generators.js
node tests\verify-four-pin-backtest.js
node tests\verify-four-pin-ui.js
```

Expected: every script exits zero and prints its success message.

- [ ] **Step 5: Run all browser verification**

```powershell
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\verify-backtest-playwright.js
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\verify-pinned-forms-playwright.js
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\verify-four-pin-playwright.js
```

Expected: all three scripts pass and screenshots show no clipping or overlap.

- [ ] **Step 6: Run the real-scale benchmark**

```powershell
$env:LOTTO_FULL_BENCHMARK='1'
node tests\verify-backtest-core.js
Remove-Item Env:LOTTO_FULL_BENCHMARK
```

Keep the existing release limits: under 60 seconds, less than 192 MB retained heap, and less than 512 MB peak RSS for 1,712 synthetic draws. If the portfolio path exceeds a limit, preserve exact output while optimizing precomputed subset keys, candidate metadata reuse, or iteration budgets; do not weaken statistical or structural constraints.

- [ ] **Step 7: Inspect the final diff and status**

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors, only scoped feature/test/docs changes, and no generated screenshots staged.

- [ ] **Step 8: Commit Task 8**

```powershell
git add .gitignore lotto-strategy-core.js lotto-backtest-worker.js lotto_analyzer.html tests/verify-four-pin-playwright.js tests/verify-backtest-playwright.js tests/verify-pinned-forms-playwright.js
git commit -m "test: verify four-PIN optimizer end to end"
```

Omit unchanged paths from `git add`. If Task 8 requires no production or existing-test correction, commit only `tests/verify-four-pin-playwright.js` and any necessary `.gitignore` change.

---

## Final Release Checklist

- [ ] All four forms contain exactly 14 valid rows.
- [ ] The new portfolio contains 56 unique regular-number combinations.
- [ ] Coverage rows reach 560 unique triples, overlap at most two, and number exposure four or five.
- [ ] The depth pool has 14 numbers and its candidate universe has exactly 3,003 rows.
- [ ] Strong numbers 1 through 7 appear twice per form.
- [ ] Every historical target sees only earlier draws.
- [ ] Every binary metric counts each draw once.
- [ ] New and legacy policies compare the same 56-line budget.
- [ ] Validation uses the untouched holdout and documented gates.
- [ ] Confidence intervals and paired counts use the same target observations.
- [ ] Unvalidated rows cannot be pinned or exposed as improved.
- [ ] Existing PIN snapshots remain unchanged until explicit replacement.
- [ ] Desktop and mobile browser checks pass without page-level overflow.
- [ ] The full real-scale benchmark stays within time and memory limits.
- [ ] All existing analysis, Backtest, Form 2, PIN, prize, sorting, RTL, and transfer tests remain green.
