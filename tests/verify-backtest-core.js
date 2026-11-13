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

const backtestOptions = {
  coverageSearchIterations: 50,
  depthSearchIterations: 50,
  bootstrapSamples: 500,
};
const progress = [];
const result = core.runWalkForwardBacktest(rows, {
  ...backtestOptions,
  onProgress: update => progress.push(update),
});
const repeatedResult = core.runWalkForwardBacktest(rows, backtestOptions);
assert.deepStrictEqual(result, repeatedResult);
assert.deepStrictEqual(result.windows, [100, 200, 500]);
assert.deepStrictEqual(result.split, { eligibleCount: 40, calibrationCount: 28, holdoutCount: 12 });
assert.strictEqual(result.currentForms.main.length, 14);
assert.strictEqual(result.currentForms.form2.length, 14);
assert.strictEqual(typeof result.policies.main.validated, 'boolean');
assert.strictEqual(typeof result.policies.form2.validated, 'boolean');
assert.ok(result.portfolio);
assert.strictEqual(result.portfolio.version, core.FOUR_PIN_PORTFOLIO_VERSION);
assert.strictEqual(result.portfolio.constraintVersion, core.PORTFOLIO_CONSTRAINT_VERSION);
assert.strictEqual(result.portfolio.metricVersion, core.BINARY_METRIC_VERSION);
assert.strictEqual(result.portfolio.confidenceVersion, core.CONFIDENCE_METHOD_VERSION);
assert.deepStrictEqual(Object.keys(result.portfolio.current.forms), [
  'coverage1', 'coverage2', 'depth1', 'depth2',
]);
assert.ok(Object.values(result.portfolio.current.forms).every(form => form.length === 14));
for (const comparison of Object.values(result.portfolio.comparisons)) {
  assert.strictEqual(comparison.total, result.split.holdoutCount);
}
assert.strictEqual(
  result.portfolio.diagnostics.portfolio3PlusStrong.total,
  result.split.holdoutCount,
);
assert.strictEqual(
  progress.filter(update => update.phase === 'identity-evaluation').length,
  result.split.eligibleCount,
  'The integrated run must reuse its existing calibration rankings',
);
assert.strictEqual(
  progress.filter(update => update.phase === 'portfolio-holdout').length,
  result.split.holdoutCount,
);
assert.strictEqual(
  progress.filter(update => update.phase === 'portfolio-current').length,
  1,
);

if (process.env.LOTTO_FULL_BENCHMARK === '1' || process.argv.includes('--full-benchmark')) {
  const benchmarkRows = buildSyntheticDraws(1712);
  const startingHeap = process.memoryUsage().heapUsed;
  const startedAt = Date.now();
  const benchmark = core.runWalkForwardBacktest(benchmarkRows, backtestOptions);
  const elapsedMs = Date.now() - startedAt;
  const endingHeap = process.memoryUsage().heapUsed;
  const peakRssKb = process.resourceUsage().maxRSS;
  assert.deepStrictEqual(benchmark.split, {
    eligibleCount: 1212,
    calibrationCount: 848,
    holdoutCount: 364,
  });
  assert.strictEqual(benchmark.currentForms.main.length, 14);
  assert.strictEqual(benchmark.currentForms.form2.length, 14);
  assert.ok(elapsedMs < 60000, `Full Backtest exceeded 60 seconds: ${elapsedMs} ms`);
  assert.ok(endingHeap - startingHeap < 192 * 1024 * 1024, 'Full Backtest retained over 192 MB of heap');
  assert.ok(peakRssKb < 512 * 1024, `Full Backtest peak RSS exceeded 512 MB: ${peakRssKb} KB`);
  console.log(`Full Backtest benchmark: ${elapsedMs} ms, heap delta ${endingHeap - startingHeap} bytes, peak RSS ${peakRssKb} KB`);
}

console.log('Backtest core verification passed');
