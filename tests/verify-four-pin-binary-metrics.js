'use strict';

const assert = require('assert');
const core = require('../lotto-strategy-core.js');

const goldenMulberry32Words = new Map([
  [1, 1144304738],
  [2, 1416247],
  [3, 958946056],
  [4917756, 3080388141],
  [4917757, 2385370908],
  [4917758, 1272314900],
  [4917759, 3767445004],
  [4917760, 3928256918],
  [4917761, 1012473366],
  [4917762, 100882671],
]);
const goldenRandom = core.createMulberry32ForTesting(0);
for (let call = 1; call <= 4917762; call += 1) {
  const outputWord = goldenRandom() * 4294967296;
  if (goldenMulberry32Words.has(call)) {
    assert.strictEqual(
      outputWord,
      goldenMulberry32Words.get(call),
      `Mulberry32 seed-0 word must conform at call ${call}`,
    );
  }
}
assert.strictEqual(core.CONFIDENCE_METHOD_VERSION, 'wilson-paired-bootstrap-v2');

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
assert.deepStrictEqual(comparison.differenceInterval, { low: -0.75, high: 0.75 });
for (const interval of [
  comparison.newInterval,
  comparison.legacyInterval,
  comparison.differenceInterval,
]) {
  assert.ok(Number.isFinite(interval.low) && Number.isFinite(interval.high));
  assert.ok(interval.low <= interval.high);
}
assert.deepStrictEqual(
  comparison,
  core.comparePairedBinaryOutcomes(
    [true, true, false, false],
    [true, false, true, false],
    { bootstrapSamples: 1000, seed: 'binary-fixture' },
  ),
);

assert.deepStrictEqual(
  core.comparePairedBinaryOutcomes([], [], { bootstrapSamples: 10, seed: 'empty' }),
  {
    total: 0,
    newWins: 0,
    legacyWins: 0,
    newRate: 0,
    legacyRate: 0,
    difference: 0,
    newInterval: { low: 0, high: 0 },
    legacyInterval: { low: 0, high: 0 },
    differenceInterval: { low: 0, high: 0 },
    paired: { both: 0, newOnly: 0, legacyOnly: 0, neither: 0 },
  },
);

assert.throws(
  () => core.comparePairedBinaryOutcomes([true], [true, false]),
  error => error && error.code === 'PAIRED_LENGTH_MISMATCH',
);

console.log('Four-PIN binary metrics verification passed');
