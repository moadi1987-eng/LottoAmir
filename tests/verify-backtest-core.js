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

console.log('Backtest core verification passed');
