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
