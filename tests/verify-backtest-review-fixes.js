'use strict';

const assert = require('assert');
const core = require('../lotto-strategy-core.js');
const { buildSyntheticDraws, buildCandidate } = require('./fixtures/backtest-fixture');

const identityMetrics = core.aggregateIdentityMetrics({
  totalRegularPoints: 120,
  totalRegularMatches: 8,
  sampleCount: 4,
  hitCounts: [0, 0, 4, 0, 0, 0, 0],
  bucketPoints: [10, 20, 90],
  bucketCounts: [1, 1, 2],
});
assert.ok(Math.abs(identityMetrics.stability - 0.4) < 1e-9);
assert.ok(Math.abs(identityMetrics.score - 26.4) < 1e-9);

const cleanRows = buildSyntheticDraws(500);
const malformedRows = cleanRows.slice();
malformedRows.splice(25, 0, { numbers: [1, 2], strong: 1, drawNumber: 'bad' });
assert.strictEqual(core.fingerprintRows(malformedRows), core.fingerprintRows(cleanRows));
assert.deepStrictEqual(
  core.generateRawCandidates(malformedRows, 500),
  core.generateRawCandidates(cleanRows, 500),
  'Current candidate windows must contain 500 valid draws, not 500 raw rows',
);

const dueRows = buildSyntheticDraws(30);
const dueSnapshot = core.buildAnalysisSnapshot(dueRows);
const dueCombo = core.generateMainCandidates(dueSnapshot, dueRows)
  .find(combo => combo.comboNum === 5);
const lastAppearance = {};
dueRows.forEach((row, index) => row.numbers.forEach(number => {
  if (lastAppearance[number] === undefined) lastAppearance[number] = index;
}));
const expectedDueNumbers = dueSnapshot.numbers.slice(0, 20).map(stat => {
  const gap = lastAppearance[stat.number] ?? dueRows.length;
  const gapBonus = gap >= 5 && gap <= 20 ? gap * 3 : gap;
  return { number: stat.number, score: stat.count + gapBonus };
}).sort((first, second) => second.score - first.score)
  .slice(0, 6)
  .map(item => item.number)
  .sort((a, b) => a - b);
assert.deepStrictEqual(dueCombo.numbers, expectedDueNumbers);

const strongGaps = {};
dueRows.forEach((row, index) => {
  if (strongGaps[row.strong] === undefined) strongGaps[row.strong] = index;
});
const expectedDueStrong = [...dueSnapshot.strongHot, ...dueSnapshot.strongMedium]
  .sort((first, second) => (
    (strongGaps[second.number] ?? 100) - (strongGaps[first.number] ?? 100)
  ))[0].number;
assert.strictEqual(dueCombo.strong, expectedDueStrong);

function candidate(identity, numbers, source, strategyId, score) {
  return {
    comboNum: strategyId,
    strategy: identity,
    numbers: numbers.slice(),
    strong: 1,
    source,
    strategyId,
    window: 500,
    identity,
    score,
  };
}

const crowded = Array.from({ length: 14 }, (_, index) => (
  candidate(`crowded-${index}`, [33, 34, 35, 36, 37, index + 1], 'main', index + 1, 1000 - index)
));
const spreadNumbers = [
  [1, 2, 3, 4, 5, 6],
  [7, 8, 9, 10, 11, 12],
  [13, 14, 15, 16, 17, 18],
  [19, 20, 21, 22, 23, 24],
  [25, 26, 27, 28, 29, 30],
  [1, 2, 3, 6, 31, 32],
  [4, 7, 13, 19, 25, 31],
  [5, 8, 14, 20, 26, 32],
  [6, 9, 15, 21, 27, 30],
  [10, 11, 16, 22, 28, 29],
  [12, 17, 18, 23, 24, 30],
  [1, 7, 14, 21, 28, 32],
  [2, 8, 15, 22, 29, 31],
  [3, 9, 16, 23, 27, 30],
];
const spread = spreadNumbers.map((numbers, index) => (
  candidate(`spread-${index}`, numbers, 'form2', index + 1, 500 - index)
));
const performanceCandidates = [...crowded, ...spread];
const performanceRankings = performanceCandidates.map(item => ({
  identity: item.identity,
  source: item.source,
  strategyId: item.strategyId,
  window: item.window,
  calibration: { score: item.score, stability: 1, rate3Plus: 0.2 },
  holdout: { score: item.score, stability: 1, rate3Plus: 0.2 },
}));
const performanceForm = core.selectPerformanceForm(
  performanceCandidates,
  performanceRankings,
  cleanRows,
);
assert.strictEqual(performanceForm.length, 14);
assert.ok(performanceForm.some(row => row.identity.startsWith('spread-')));
const performanceMetrics = core.getFormDiversityMetrics(performanceForm);
assert.ok(performanceMetrics.coveredNumberCount >= 28);
assert.ok(performanceMetrics.maximumExposure <= 8);
assert.ok(performanceMetrics.maximumOverlap <= 5);

const highRows = Array.from({ length: 14 }, (_, index) => buildCandidate(index * 2, 'form2', 500, index + 1));
const medianCandidates = [];
for (let index = 0; index < 50; index += 1) {
  medianCandidates.push({ ...highRows[0], identity: `duplicate-high-${index}`, strategy: `duplicate-high-${index}` });
}
for (let index = 1; index < highRows.length; index += 1) {
  medianCandidates.push({ ...highRows[index], identity: `unique-high-${index}`, strategy: `unique-high-${index}` });
}
for (let index = 0; index < 21; index += 1) {
  const row = buildCandidate(index * 2 + 1, 'main', 500, (index % 14) + 1);
  medianCandidates.push({ ...row, identity: `unique-low-${index}`, strategy: `unique-low-${index}` });
}
const medianRankings = medianCandidates.map((item, index) => ({
  identity: item.identity,
  source: item.source,
  strategyId: item.strategyId,
  window: item.window,
  calibration: { score: index < 63 ? 100 : 0, stability: 1, rate3Plus: 0.2 },
  holdout: { score: index < 63 ? 100 : 0, stability: 1, rate3Plus: 0.2 },
}));
const diversityForm = core.selectDiversityForm(medianCandidates, medianRankings, cleanRows, []);
assert.ok(
  diversityForm.every(row => row.backtestScore >= 100),
  'Form 2 must calculate its threshold from all identity scores before row deduplication',
);

assert.ok(
  !core.diversifyForm2Combinations.toString().includes('getNumberSelections'),
  'Diversification should stream candidate combinations instead of materializing Cartesian products',
);

const policyResult = core.runWalkForwardBacktest(buildSyntheticDraws(504));
for (const source of ['main', 'form2']) {
  for (const mode of ['baseline', 'optimized']) {
    const metrics = policyResult.policies[source][mode];
    assert.strictEqual(metrics.bucketAverages.length, 3);
    assert.ok(Number.isFinite(metrics.stability));
    assert.ok(Math.abs(metrics.score - metrics.averageScore * (0.8 + 0.2 * metrics.stability)) < 1e-9);
  }
}

console.log('Backtest review-fix verification passed');
