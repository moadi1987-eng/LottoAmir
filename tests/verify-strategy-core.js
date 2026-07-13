'use strict';

const assert = require('assert');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');
const core = require('../lotto-strategy-core.js');

const rows = buildSyntheticDraws(540);
assert.deepStrictEqual(core.BACKTEST_WINDOWS, [100, 200, 500]);
assert.ok(rows.every(core.isValidDraw));

const chronological = core.toChronological(rows);
assert.strictEqual(chronological[0].drawNumber, 2233);
assert.strictEqual(chronological.at(-1).drawNumber, 2772);

const snapshot = core.buildAnalysisSnapshot(rows.slice(0, 500));
assert.strictEqual(snapshot.totalDraws, 500);
assert.strictEqual(snapshot.hot.length + snapshot.medium.length + snapshot.cold.length, 37);

const main = core.generateMainCandidates(snapshot, rows.slice(0, 500));
const form2Raw = core.generateForm2RawCandidates(snapshot, rows.slice(0, 500));
assert.strictEqual(main.length, 14);
assert.strictEqual(form2Raw.length, 14);

const raw = core.generateRawCandidates(rows, 500);
assert.strictEqual(raw.length, 28);
assert.strictEqual(new Set(raw.map(candidate => candidate.identity)).size, 28);

const baseline = core.generateBaselineForms(rows);
const repeated = core.generateBaselineForms(rows);
assert.strictEqual(baseline.main.length, 14);
assert.strictEqual(baseline.form2.length, 14);
assert.deepStrictEqual(baseline, repeated);

for (const combo of [...baseline.main, ...baseline.form2]) {
  assert.strictEqual(combo.numbers.length, 6);
  assert.strictEqual(new Set(combo.numbers).size, 6);
  assert.ok(combo.numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 37));
}

console.log('Shared strategy core verification passed');
