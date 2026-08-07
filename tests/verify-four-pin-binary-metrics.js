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
