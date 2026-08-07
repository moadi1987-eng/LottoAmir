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
    const includesMedium = index < 1;
    const includesSpike = windowSize === 100 && index === 0;
    candidates.push({
      identity,
      source: 'main',
      strategyId: index + 1,
      window: windowSize,
      numbers: [
        ...(includesStable ? [1] : []),
        ...(includesMedium ? [3] : []),
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
const ranked = core.rankPortfolioIdentities(rankings, windows);
assert.deepStrictEqual(
  ranked.filter(record => record.window === 100).map(record => record.identity),
  ['main:1:100', 'main:2:100'],
);
assert.deepStrictEqual(
  ranked.filter(record => record.window === 100).map(record => record.rankWeight),
  [1, 0.5],
);
assert.strictEqual(support.numbers.length, 37);
assert.strictEqual(support.strong.length, 7);
assert.ok(support.byNumber[1].stableSupport > support.byNumber[3].stableSupport);
assert.ok(support.byNumber[3].stableSupport > support.byNumber[2].stableSupport);
assert.strictEqual(Object.keys(support.byNumber[1].windowScores).length, 3);
assert.strictEqual(support.byNumber[1].windowScores[100], 1);
assert.strictEqual(support.byNumber[3].windowScores[100], 2 / 3);
assert.ok(Math.abs(support.byNumber[3].stableSupport - (2 / 3)) < 1e-12);
assert.strictEqual(support.byStrong[2].windowScores[100], 1);
assert.strictEqual(support.byStrong[2].windowScores[200], 1);
assert.strictEqual(support.byStrong[2].windowScores[500], 1);

const invalidStrongRows = buildSyntheticDraws(500).map((row, index) => ({
  ...row,
  strong: index === 0 ? 1 : 8,
}));
const invalidStrongSupport = core.buildStablePortfolioSupport(
  candidates,
  rankings,
  invalidStrongRows,
  windows,
);
assert.deepStrictEqual(invalidStrongSupport.byStrong[1].windowScores, {
  100: 1,
  200: 1,
  500: 1,
});

const pool = core.selectDepthPool(support, 14);
assert.strictEqual(pool.length, 14);
assert.strictEqual(new Set(pool).size, 14);
assert.ok(pool.every(number => Number.isInteger(number) && number >= 1 && number <= 37));
assert.deepStrictEqual(pool, core.selectDepthPool(support, 14));
assert.throws(
  () => core.selectDepthPool(support, 5),
  error => error && error.code === 'INVALID_DEPTH_POOL_SIZE',
);

const coverage = core.buildCoveragePair(support, {
  seed: 'coverage-fixture',
  searchIterations: 500,
});
const repeatedCoverage = core.buildCoveragePair(support, {
  seed: 'coverage-fixture',
  searchIterations: 500,
});
assert.deepStrictEqual(coverage, repeatedCoverage);
assert.strictEqual(core.PORTFOLIO_CONSTRAINT_VERSION, 'four-pin-constraints-v1');
assert.deepStrictEqual(core.COVERAGE_FORM_IDS, ['coverage1', 'coverage2']);
assert.strictEqual(coverage.seed, 'coverage-fixture');
assert.deepStrictEqual(Object.keys(coverage.forms), ['coverage1', 'coverage2']);
assert.strictEqual(coverage.forms.coverage1.length, 14);
assert.strictEqual(coverage.forms.coverage2.length, 14);
assert.ok(Object.values(coverage.forms).every(form => form.every((row, index) => (
  row.comboNum === index + 1 && row.strategy === 'כיסוי 3+'
))));

const coverageRows = [...coverage.forms.coverage1, ...coverage.forms.coverage2];
assert.ok(coverageRows.every(row => (
  row.numbers.length === 6
  && new Set(row.numbers).size === 6
  && row.numbers.every((number, index, numbers) => (
    Number.isInteger(number)
    && number >= 1
    && number <= 37
    && (index === 0 || numbers[index - 1] < number)
  ))
)));
assert.strictEqual(new Set(coverageRows.map(row => row.numbers.join('-'))).size, 28);
const coverageMetrics = core.getCoverageGroupMetrics(coverageRows);
assert.deepStrictEqual(coverage.metrics, coverageMetrics);
assert.strictEqual(coverageMetrics.maximumOverlap, 2);
assert.strictEqual(coverageMetrics.uniqueTripleCount, 28 * 20);
assert.ok(Object.values(coverageMetrics.numberExposure).every(count => count === 4 || count === 5));
const rankedCoverageNumbers = support.numbers.slice().sort((first, second) => (
  second.stableSupport - first.stableSupport || first.number - second.number
));
rankedCoverageNumbers.slice(0, 20).forEach(record => {
  assert.strictEqual(coverageMetrics.numberExposure[record.number], 5);
});
rankedCoverageNumbers.slice(20).forEach(record => {
  assert.strictEqual(coverageMetrics.numberExposure[record.number], 4);
});

assert.deepStrictEqual(
  core.getSubsetKeys([1, 2, 3, 4, 5, 6], 3),
  [
    '1-2-3', '1-2-4', '1-2-5', '1-2-6', '1-3-4',
    '1-3-5', '1-3-6', '1-4-5', '1-4-6', '1-5-6',
    '2-3-4', '2-3-5', '2-3-6', '2-4-5', '2-4-6',
    '2-5-6', '3-4-5', '3-4-6', '3-5-6', '4-5-6',
  ],
);
assert.throws(
  () => core.buildCoveragePair(null, { seed: 'coverage-fixture' }),
  error => error && error.code === 'COVERAGE_INVALID_SUPPORT',
);
assert.throws(
  () => core.buildCoveragePair(support, { seed: 'coverage-fixture', searchIterations: -1 }),
  error => error && error.code === 'COVERAGE_INVALID_SEARCH_ITERATIONS',
);
assert.throws(
  () => core.buildCoveragePair(support, null),
  error => error && error.code === 'COVERAGE_INVALID_SEED',
);

const depthPool = core.selectDepthPool(support, 14);
const universe = core.enumerateNumberCombinations(depthPool, 6);
assert.strictEqual(universe.length, 3003);
assert.strictEqual(new Set(universe.map(numbers => numbers.join('-'))).size, 3003);
assert.deepStrictEqual(
  core.enumerateNumberCombinations([3, 1, 2], 2),
  [[1, 2], [1, 3], [2, 3]],
);
assert.throws(
  () => core.enumerateNumberCombinations([1, 1, 2], 2),
  error => error && error.code === 'INVALID_COMBINATION_VALUES',
);
assert.throws(
  () => core.enumerateNumberCombinations([1, '2', 3], 2),
  error => error && error.code === 'INVALID_COMBINATION_VALUES',
);
assert.throws(
  () => core.enumerateNumberCombinations([1, 2, 3], 0),
  error => error && error.code === 'INVALID_COMBINATION_SIZE',
);

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

const legacy = core.buildLegacy56Portfolio(portfolioRows);
assert.deepStrictEqual(Object.keys(legacy), [
  'coverage1', 'coverage2', 'depth1', 'depth2',
]);
assert.strictEqual(Object.values(legacy).flat().length, 56);
assert.deepStrictEqual(legacy, core.buildLegacy56Portfolio(portfolioRows));
