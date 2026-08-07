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
assert.deepStrictEqual(
  depth,
  core.buildDepthPair(depthPool, support, coverageKeys, {
    seed: 'depth-fixture',
    searchIterations: 500,
  }),
);
assert.strictEqual(depth.forms.depth1.length, 14);
assert.strictEqual(depth.forms.depth2.length, 14);
const depthRows = [...depth.forms.depth1, ...depth.forms.depth2];
assert.strictEqual(new Set(depthRows.map(row => row.numbers.join('-'))).size, 28);
assert.ok(depthRows.every(row => row.numbers.every(number => depthPool.includes(number))));
assert.ok(depthRows.every(row => !coverageKeys.has(row.numbers.join('-'))));

const tiedDepthPool = Array.from({ length: 14 }, (_, index) => index + 1);
const tiedDepthSupport = {
  numbers: Array.from({ length: 37 }, (_, index) => ({
    number: index + 1,
    stableSupport: 1,
  })),
};
const tiedDepth = core.buildDepthPair(tiedDepthPool, tiedDepthSupport, new Set(), {
  seed: 'tied-depth-fixture',
  searchIterations: 0,
});
assert.deepStrictEqual({
  depth1: tiedDepth.forms.depth1.map(row => row.numbers.join('-')),
  depth2: tiedDepth.forms.depth2.map(row => row.numbers.join('-')),
  metrics: tiedDepth.metrics,
}, {
  depth1: [
    '1-10-11-12-13-14', '2-3-4-5-6-7', '5-6-8-9-10-11', '1-2-3-8-9-12',
    '3-5-7-11-13-14', '1-4-6-7-12-13', '1-2-4-5-9-14', '3-6-7-8-10-12',
    '2-3-9-10-13-14', '4-5-6-11-12-14', '1-2-7-8-11-13', '3-4-7-9-10-11',
    '2-6-8-12-13-14', '1-5-7-9-10-12',
  ],
  depth2: [
    '1-2-3-5-10-11', '4-7-8-9-13-14', '3-6-9-11-12-13', '1-4-6-8-10-14',
    '2-5-7-9-11-12', '1-3-5-6-8-13', '1-3-4-7-12-14', '2-4-6-10-11-13',
    '2-5-7-8-10-14', '2-4-8-9-10-12', '1-6-7-9-11-14', '3-4-5-10-12-13',
    '1-4-5-9-11-13', '2-3-4-8-11-14',
  ],
  metrics: {
    rowCount: 28,
    uniqueRowCount: 28,
    uniqueFourSubsetCount: 416,
    uniqueFiveSubsetCount: 168,
    numberExposure: {
      1: 12, 2: 12, 3: 12, 4: 13, 5: 12, 6: 11, 7: 12,
      8: 11, 9: 12, 10: 12, 11: 13, 12: 12, 13: 12, 14: 12,
    },
    maximumOverlap: 4,
    poolCoverage: 14,
  },
});

const portfolioRows = buildSyntheticDraws(540);
const portfolioPlan = core.createBacktestPlan(portfolioRows);
const portfolioTarget = 539;
const portfolioEarlierRows = portfolioPlan.chronological.slice(0, portfolioTarget).reverse();
const portfolioCandidatePool = core.buildWindowCandidatePool(
  portfolioPlan.chronological,
  portfolioTarget,
);
const portfolioRankings = core.evaluateStrategyWindows(portfolioRows).rankings;
const portfolioOptions = {
  seed: 'portfolio-fixture',
  coverageSearchIterations: 200,
  depthSearchIterations: 200,
};
const portfolio = core.buildFourPinPortfolio(
  portfolioEarlierRows,
  portfolioCandidatePool,
  portfolioRankings,
  portfolioOptions,
);
assert.deepStrictEqual(
  portfolio,
  core.buildFourPinPortfolio(
    portfolioEarlierRows,
    portfolioCandidatePool,
    portfolioRankings,
    portfolioOptions,
  ),
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

const formIds = ['coverage1', 'coverage2', 'depth1', 'depth2'];
const strongFixtureForms = Object.fromEntries(formIds.map(formId => [
  formId,
  portfolio.forms[formId].map(row => ({ ...row, numbers: row.numbers.slice() })),
]));
[strongFixtureForms.depth1[3], strongFixtureForms.depth1[6]] = [
  strongFixtureForms.depth1[6],
  strongFixtureForms.depth1[3],
];
const strongFixtureSupport = [
  { number: 4, stableSupport: 0.9 },
  { number: 2, stableSupport: 0.9 },
  { number: 7, stableSupport: 0.8 },
  { number: 1, stableSupport: 0.7 },
  { number: 6, stableSupport: 0.6 },
  { number: 3, stableSupport: 0.5 },
  { number: 5, stableSupport: 0.4 },
];
const expectedStrongOrder = [2, 4, 7, 1, 6, 3, 5];
const regularRowsBeforeStrongAssignment = Object.fromEntries(formIds.map(formId => [
  formId,
  strongFixtureForms[formId].map(row => row.numbers.slice()),
]));
const baseStrongFixture = Object.fromEntries(formIds.map(formId => [
  formId,
  strongFixtureForms[formId].map((row, index) => ({
    ...row,
    numbers: row.numbers.slice(),
    strong: expectedStrongOrder[index % 7],
  })),
]));
function getHighestOverlapStrongCollisions(forms) {
  const rows = formIds.flatMap(formId => forms[formId]);
  let highestOverlap = 0;
  let equalStrongCount = 0;
  for (let first = 0; first < rows.length; first += 1) {
    for (let second = first + 1; second < rows.length; second += 1) {
      const secondNumbers = new Set(rows[second].numbers);
      const overlap = rows[first].numbers.filter(number => secondNumbers.has(number)).length;
      if (overlap > highestOverlap) {
        highestOverlap = overlap;
        equalStrongCount = rows[first].strong === rows[second].strong ? 1 : 0;
      } else if (overlap === highestOverlap && rows[first].strong === rows[second].strong) {
        equalStrongCount += 1;
      }
    }
  }
  return { highestOverlap, equalStrongCount };
}
const collisionsBeforeStrongAssignment = getHighestOverlapStrongCollisions(baseStrongFixture);
const assignedStrongFixture = core.assignPortfolioStrongNumbers(
  strongFixtureForms,
  strongFixtureSupport,
);
const collisionsAfterStrongAssignment = getHighestOverlapStrongCollisions(assignedStrongFixture);
assert.deepStrictEqual(collisionsBeforeStrongAssignment, {
  highestOverlap: 4,
  equalStrongCount: 1,
});
assert.deepStrictEqual(collisionsAfterStrongAssignment, {
  highestOverlap: 4,
  equalStrongCount: 0,
});
assert.ok(
  collisionsAfterStrongAssignment.equalStrongCount
    < collisionsBeforeStrongAssignment.equalStrongCount,
);
assert.deepStrictEqual(
  assignedStrongFixture.coverage1.map(row => row.strong),
  [...expectedStrongOrder, ...expectedStrongOrder],
);
assert.deepStrictEqual(
  Object.fromEntries(formIds.map(formId => [
    formId,
    assignedStrongFixture[formId].map(row => row.numbers),
  ])),
  regularRowsBeforeStrongAssignment,
);
assert.deepStrictEqual(
  Object.fromEntries(formIds.map(formId => [
    formId,
    strongFixtureForms[formId].map(row => row.numbers),
  ])),
  regularRowsBeforeStrongAssignment,
);
for (const form of Object.values(assignedStrongFixture)) {
  const counts = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, 0]));
  form.forEach(row => { counts[row.strong] += 1; });
  assert.deepStrictEqual(counts, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2 });
}

assert.throws(
  () => core.buildFourPinPortfolio(
    portfolioEarlierRows,
    portfolioCandidatePool,
    portfolioRankings,
    {},
  ),
  error => error
    && error.code === 'FOUR_PIN_SEED_FAILED'
    && error.stage === 'seed'
    && error.causeCode === undefined,
);
assert.throws(
  () => core.buildFourPinPortfolio(
    portfolioEarlierRows,
    portfolioCandidatePool,
    portfolioRankings,
    { seed: 'stage-fixture', coverageSearchIterations: -1, depthSearchIterations: 0 },
  ),
  error => error
    && error.code === 'FOUR_PIN_COVERAGE_FAILED'
    && error.stage === 'coverage'
    && error.causeCode === 'COVERAGE_INVALID_SEARCH_ITERATIONS',
);
assert.throws(
  () => core.buildFourPinPortfolio(
    portfolioEarlierRows,
    portfolioCandidatePool,
    portfolioRankings,
    { seed: 'stage-fixture', coverageSearchIterations: 0, depthSearchIterations: -1 },
  ),
  error => error
    && error.code === 'FOUR_PIN_DEPTH_FAILED'
    && error.stage === 'depth'
    && error.causeCode === 'DEPTH_INVALID_SEARCH_ITERATIONS',
);

const legacy = core.buildLegacy56Portfolio(portfolioRows);
assert.deepStrictEqual(Object.keys(legacy), [
  'coverage1', 'coverage2', 'depth1', 'depth2',
]);
const legacyRows = Object.values(legacy).flat();
const legacyRowKeys = legacyRows.map(row => row.numbers.join('-'));
const legacyKeyCounts = legacyRowKeys.reduce((counts, key) => {
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});
assert.strictEqual(legacyRows.length, 56);
assert.strictEqual(new Set(legacyRowKeys).size, 39);
assert.strictEqual(legacyRows.length - new Set(legacyRowKeys).size, 17);
assert.deepStrictEqual(
  Object.entries(legacyKeyCounts)
    .filter(([, count]) => count > 1)
    .sort(([first], [second]) => first.localeCompare(second)),
  [
    ['1-2-3-4-5-6', 2],
    ['1-2-3-5-10-37', 2],
    ['1-2-5-10-15-37', 2],
    ['1-3-23-30-33-35', 2],
    ['1-3-5-6-8-10', 3],
    ['1-6-8-11-13-16', 2],
    ['2-7-12-17-22-27', 2],
    ['2-7-9-12-14-17', 3],
    ['3-5-10-15-20-25', 3],
    ['3-5-10-15-20-37', 3],
    ['3-5-10-30-35-37', 3],
    ['5-10-26-27-28-37', 2],
  ],
);
assert.deepStrictEqual(legacy, core.buildLegacy56Portfolio(portfolioRows));
