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
const progress = [];
const result = core.runFourPinPortfolioBacktest(rows, {
  ...options,
  onProgress: update => progress.push(update),
});

assert.deepStrictEqual(Object.keys(result), [
  'version',
  'constraintVersion',
  'metricVersion',
  'confidenceVersion',
  'validated',
  'reasons',
  'sampleCount',
  'selectionFailures',
  'current',
  'comparisons',
  'diagnostics',
  'bucketDifferences',
  'bucketSampleCounts',
]);
assert.strictEqual(result.version, core.FOUR_PIN_PORTFOLIO_VERSION);
assert.strictEqual(result.constraintVersion, core.PORTFOLIO_CONSTRAINT_VERSION);
assert.strictEqual(result.metricVersion, core.BINARY_METRIC_VERSION);
assert.strictEqual(result.confidenceVersion, core.CONFIDENCE_METHOD_VERSION);
assert.strictEqual(result.sampleCount, 12);
assert.strictEqual(result.selectionFailures, 0);
assert.strictEqual(typeof result.validated, 'boolean');
assert.ok(Array.isArray(result.reasons));
assert.deepStrictEqual(Object.keys(result.current.forms), [
  'coverage1', 'coverage2', 'depth1', 'depth2',
]);
assert.strictEqual(Object.values(result.current.forms).flat().length, 56);
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
assert.deepStrictEqual(result.bucketSampleCounts, [4, 4, 4]);
assert.strictEqual(result.bucketSampleCounts.reduce((sum, count) => sum + count, 0), 12);
assert.deepStrictEqual(result, core.runFourPinPortfolioBacktest(rows, options));

const holdoutProgress = progress.filter(update => update.phase === 'portfolio-holdout');
assert.deepStrictEqual(
  holdoutProgress.map(update => [update.completed, update.total]),
  Array.from({ length: 12 }, (_, index) => [index + 1, 12]),
);
assert.deepStrictEqual(
  progress.filter(update => update.phase === 'portfolio-current')
    .map(update => [update.completed, update.total]),
  [[1, 1]],
);

const plan = core.createBacktestPlan(rows, options.windows);
const rankings = core.evaluateStrategyWindows(rows, options.windows).rankings;
const firstHoldoutTarget = plan.holdoutTargets[0];
const firstPortfolio = core.buildPortfolioAtTarget(
  plan.chronological,
  firstHoldoutTarget,
  rankings,
  options,
);
const targetAndLaterMutation = plan.chronological.map((draw, index) => {
  if (index < firstHoldoutTarget) return { ...draw, numbers: draw.numbers.slice() };
  return {
    ...draw,
    numbers: draw.numbers.map(number => ((number + 10) % 37) + 1).sort((a, b) => a - b),
    strong: (draw.strong % 7) + 1,
  };
});
assert.deepStrictEqual(
  core.buildPortfolioAtTarget(
    targetAndLaterMutation,
    firstHoldoutTarget,
    rankings,
    options,
  ),
  firstPortfolio,
  'The target draw and all later rows must not influence its generated portfolio',
);

const earlierMutation = plan.chronological.map(draw => ({
  ...draw,
  numbers: draw.numbers.slice(),
}));
const earlierIndex = firstHoldoutTarget - 1;
earlierMutation[earlierIndex] = {
  ...earlierMutation[earlierIndex],
  numbers: earlierMutation[earlierIndex].numbers
    .map(number => (number % 37) + 1)
    .sort((a, b) => a - b),
};
const earlierPortfolio = core.buildPortfolioAtTarget(
  earlierMutation,
  firstHoldoutTarget,
  rankings,
  options,
);
assert.notStrictEqual(earlierPortfolio.fingerprintSeed, firstPortfolio.fingerprintSeed);
assert.notDeepStrictEqual(earlierPortfolio, firstPortfolio);

const currentNewestFirst = plan.chronological.slice().reverse();
const currentCandidatePool = plan.windows.flatMap(windowSize => (
  core.generateRawCandidates(currentNewestFirst, windowSize)
));
assert.deepStrictEqual(
  result.current,
  core.buildFourPinPortfolio(
    currentNewestFirst,
    currentCandidatePool,
    rankings,
    {
      ...options,
      seed: `${core.fingerprintRows(rows)}:${core.FOUR_PIN_PORTFOLIO_VERSION}`,
    },
  ),
  'Current generation must use all loaded rows without an invented target draw',
);

function createGateFixture() {
  return {
    selectionFailures: 0,
    comparisons: {
      portfolio3Plus: { difference: 0.10 },
      coverage3Plus: { difference: 0 },
      depth3Plus: { difference: -0.01 },
      depth4Plus: { difference: 0.10 },
    },
    diagnostics: {
      portfolio3PlusStrong: { difference: -1 },
    },
    bucketDifferences: [0.10, 0, -0.10],
    bucketSampleCounts: [1, 1, 1],
  };
}

function expectGateReason(name, mutate, expectedReasons) {
  const fixture = createGateFixture();
  mutate(fixture);
  assert.deepStrictEqual(
    core.validateFourPinPortfolioResult(fixture),
    { validated: false, reasons: expectedReasons || [name] },
    name,
  );
}

assert.deepStrictEqual(core.validateFourPinPortfolioResult(createGateFixture()), {
  validated: true,
  reasons: [],
});
expectGateReason('selection-failure', fixture => { fixture.selectionFailures = 1; });
expectGateReason('portfolio-three-plus-regression', fixture => {
  fixture.comparisons.portfolio3Plus.difference = 0;
});
expectGateReason('coverage-three-plus-regression', fixture => {
  fixture.comparisons.coverage3Plus.difference = -Number.EPSILON;
});
expectGateReason('depth-four-plus-regression', fixture => {
  fixture.comparisons.depth4Plus.difference = 0;
});
expectGateReason('depth-three-plus-guardrail', fixture => {
  fixture.comparisons.depth3Plus.difference = -0.0100000001;
});
expectGateReason('bucket-instability', fixture => {
  fixture.bucketDifferences = [-0.10, 0.10, -0.10];
});
expectGateReason('insufficient-bucket-samples', fixture => {
  fixture.bucketSampleCounts = [1, 0, 1];
  fixture.bucketDifferences = [0.10, 0.10, -0.10];
});
expectGateReason('all-reasons-in-contract-order', fixture => {
  fixture.selectionFailures = 1;
  fixture.comparisons.portfolio3Plus.difference = 0;
  fixture.comparisons.coverage3Plus.difference = -0.10;
  fixture.comparisons.depth4Plus.difference = 0;
  fixture.comparisons.depth3Plus.difference = -0.02;
  fixture.bucketSampleCounts = [0, 0, 0];
  fixture.bucketDifferences = [-0.10, -0.10, -0.10];
}, [
  'selection-failure',
  'portfolio-three-plus-regression',
  'coverage-three-plus-regression',
  'depth-four-plus-regression',
  'depth-three-plus-guardrail',
  'insufficient-bucket-samples',
  'bucket-instability',
]);

const failureOptions = {
  ...options,
  rankings,
  plan,
  coverageSearchIterations: -1,
};
const failureResult = core.runFourPinPortfolioBacktest(rows, failureOptions);
assert.strictEqual(failureResult.sampleCount, 12);
assert.strictEqual(failureResult.selectionFailures, 12);
assert.strictEqual(failureResult.current, null);
assert.ok(failureResult.reasons.includes('selection-failure'));
assert.ok(failureResult.reasons.includes('current-generation-failure'));
assert.deepStrictEqual(
  failureResult.diagnostics.selectionFailureCodes,
  Array(12).fill('FOUR_PIN_COVERAGE_FAILED'),
);

const expectedLegacy = {
  portfolio3Plus: [],
  coverage3Plus: [],
  depth3Plus: [],
  depth4Plus: [],
};
plan.holdoutTargets.forEach(targetIndex => {
  const earlierNewestFirst = plan.chronological.slice(0, targetIndex).reverse();
  const legacyForms = core.buildLegacy56Portfolio(earlierNewestFirst);
  const draw = plan.chronological[targetIndex];
  expectedLegacy.portfolio3Plus.push(core.hasRegularWin(Object.values(legacyForms), draw, 3));
  expectedLegacy.coverage3Plus.push(core.hasRegularWin(
    [legacyForms.coverage1, legacyForms.coverage2],
    draw,
    3,
  ));
  expectedLegacy.depth3Plus.push(core.hasRegularWin(
    [legacyForms.depth1, legacyForms.depth2],
    draw,
    3,
  ));
  expectedLegacy.depth4Plus.push(core.hasRegularWin(
    [legacyForms.depth1, legacyForms.depth2],
    draw,
    4,
  ));
});
for (const key of Object.keys(expectedLegacy)) {
  const comparison = failureResult.comparisons[key];
  const expectedWins = expectedLegacy[key].filter(Boolean).length;
  assert.strictEqual(comparison.total, 12);
  assert.strictEqual(comparison.newWins, 0);
  assert.strictEqual(comparison.legacyWins, expectedWins);
  assert.deepStrictEqual(comparison.paired, {
    both: 0,
    newOnly: 0,
    legacyOnly: expectedWins,
    neither: 12 - expectedWins,
  });
}

console.log('Four-PIN walk-forward backtest verification passed');
