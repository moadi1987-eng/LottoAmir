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
