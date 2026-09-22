'use strict';

const assert = require('assert');
const core = require('../lotto-learning-core.js');
const report = require('../lotto-learning-report.js');
const arms = ['learner', 'legacy', 'random'];
const clone = value => JSON.parse(JSON.stringify(value));
const draw = { drawNumber: 4000, date: '2026-09-22', numbers: [1, 2, 3, 4, 5, 6], strong: 1 };
function check(name, run) { run(); console.log(`PASS ${name}`); }
function primary({ sampleCount, winCount, rate }) { return { sampleCount, winCount, rate }; }
function lineSet(win, strong = 1) {
  return Array.from({ length: 14 }, (_, i) => ({ comboNum: i + 1, strategy: 'test',
    numbers: win ? [1, 2, 3, 10 + i, 25, 26] : [7 + i, 22, 23, 24, 25, 26], strong }));
}
function stateWith(count = 1) {
  const experiment = { id: 'report-test', protocolVersion: core.PROTOCOL_VERSION, coreVersion: core.CORE_VERSION,
    seedHex: '00112233445566778899aabbccddeeff', originAnchor: 3999, lastProcessedDraw: 3999 + count,
    status: 'active', sourceDigest: 'a'.repeat(64), sourceCutoff: 3999 };
  const state = { compatibility: 'compatible', incompatibilityCodes: [], rawBackup: null,
    revision: 1, experiment, decisions: [], snapshots: [], observations: [], prizes: [], faults: [] };
  for (let i = 0; i < Math.max(1, count); i += 20) state.decisions.push({ cutoff: 3999 + i, window: 500, counts: { 100: 0, 200: 0, 500: 0 } });
  for (let i = 0; i < count; i++) {
    const target = 4000 + i;
    const snapshot = { experimentId: experiment.id, target, anchor: target - 1,
      createdAt: '2026-09-21T20:59:59Z', protocolVersion: core.PROTOCOL_VERSION, coreVersion: core.CORE_VERSION,
      seedHex: experiment.seedHex, window: 500,
      source: { kind: 'canonical', url: null, fetchedAt: '2026-09-21T20:00:00Z', generation: 1, digest: 'a'.repeat(64) },
      arms: { learner: lineSet(true), legacy: lineSet(false), random: lineSet(false) } };
    const targetDraw = { ...clone(draw), drawNumber: target };
    state.snapshots.push(snapshot);
    state.observations.push({ experimentId: experiment.id, target, draw: targetDraw, kind: 'eligible',
      scores: Object.fromEntries(arms.map(arm => [arm, core.scoreArm(snapshot.arms[arm], targetDraw)])) });
  }
  return state;
}
function outcome(target, learner, legacy, random, kind = 'eligible') {
  return { target, kind, scores: Object.fromEntries(arms.map((arm, i) => [arm, { win3Plus: [learner, legacy, random][i] }])) };
}
function envelope(state) { return JSON.stringify({ schemaVersion: 1, protocolVersion: core.PROTOCOL_VERSION, exportedAt: '2026-09-22T12:00:00Z', state }); }

check('readonly imports reject duplicate learner/random sixes but preserve legacy duplicates', () => {
  for (const arm of ['learner', 'random']) {
    const state = stateWith();
    state.snapshots[0].arms[arm][1].numbers = state.snapshots[0].arms[arm][0].numbers.slice();
    assert.throws(() => report.readBackup(envelope(state)), { code: 'MALFORMED_RECORD' }, arm);
  }
  const legacy = stateWith();
  legacy.snapshots[0].arms.legacy[1].numbers = legacy.snapshots[0].arms.legacy[0].numbers.slice();
  assert.deepEqual(report.readBackup(envelope(legacy)).state.snapshots, legacy.snapshots);
});

check('Jerusalem midnight and winter dates never use host timezone', () => {
  assert.equal(report.classifySnapshot({ target: 4000, createdAt: '2026-09-21T20:59:59Z' }, draw), 'eligible');
  assert.equal(report.classifySnapshot({ target: 4000, createdAt: '2026-09-21T21:00:00Z' }, draw), 'same-day-or-late');
  assert.equal(report.localDateAt('2026-01-01T22:00:00Z'), '2026-01-02');
  for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
    const prior = process.env.TZ; process.env.TZ = timezone;
    try { assert.equal(report.localDateAt('2026-09-21T21:00:00Z'), '2026-09-22'); }
    finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
  }
  for (const value of ['2026-02-30T12:00:00Z', '2026-09-21', '2026-09-21T23:00:00+03:00',
    '0000-01-01T12:00:00Z', '9999-12-31T23:00:00Z', 'bad']) assert.throws(() => report.localDateAt(value));
  assert.throws(() => report.classifySnapshot({ target: 4001, createdAt: '2026-09-21T20:00:00Z' }, draw));
});

check('audit scores each exact target and never reuses a missing snapshot', () => {
  const state = stateWith(1); state.experiment.lastProcessedDraw = 3999; state.observations = [];
  const rows = [draw, { ...draw, drawNumber: 4001, date: '2026-09-23' }];
  const before = JSON.stringify(state);
  const result = report.buildObservations(state, rows);
  assert.deepEqual(result.observations.map(o => [o.target, o.kind, o.scores && o.scores.learner.win3Plus]), [[4000, 'eligible', 1], [4001, 'missing', null]]);
  assert.deepEqual(result.faults, []);
  assert.equal(JSON.stringify(state), before);
  state.snapshots[0].createdAt = '2026-09-21T21:00:00Z';
  assert.equal(report.buildObservations(state, rows).observations[0].kind, 'same-day-or-late');
});

check('stored draw edits, including strong-only changes, return separate faults', () => {
  const state = stateWith(); const before = JSON.stringify(state);
  assert.deepEqual(report.buildObservations(state, [draw]), { observations: [], faults: [] });
  for (const changed of [{ ...draw, strong: 2 }, { ...draw, numbers: [1, 2, 3, 4, 5, 7] }, { ...draw, date: '2026-09-23' }]) {
    assert.deepEqual(report.buildObservations(state, [changed]), { observations: [], faults: [{ target: 4000, code: 'DRAW_CONFLICT' }] });
  }
  assert.equal(JSON.stringify(state), before);
});

check('evidence requires 200 clean positions and superiority to both controls', () => {
  const all = Array.from({ length: 200 }, (_, i) => outcome(4000 + i, 1, 0, 0));
  const evidence = report.evaluateEvidenceBlock(all, 1);
  assert.equal(evidence.status, 'period-evidence'); assert.equal(evidence.alpha, 0.0125);
  assert.equal(evidence.n, 200); assert.equal(evidence.eligibleCount, 200);
  assert.equal(evidence.paired.legacy.meanDifference, 1);
  assert(evidence.paired.legacy.lowerBound > 0.79 && evidence.paired.legacy.lowerBound < 0.80);
  assert.equal(report.evaluateEvidenceBlock(all.slice(1), 1).status, 'insufficient');
  const twenty = all.map((o, i) => outcome(o.target, i < 20 ? 1 : 0, 0, 0));
  assert.equal(report.evaluateEvidenceBlock(twenty, 1).status, 'no-clear-advantage');
  assert(report.evaluateEvidenceBlock(twenty, 1).paired.legacy.lowerBound < 0);
  assert.equal(report.evaluateEvidenceBlock(all.map(o => outcome(o.target, 1, 0, 1)), 1).status, 'no-clear-advantage');
  for (const kind of ['missing', 'same-day-or-late', 'conflict']) {
    const changed = clone(all); changed[45].kind = kind;
    const result = report.evaluateEvidenceBlock(changed, 1);
    assert.equal(result.status, 'descriptive'); assert.equal(result.eligibleCount, 199);
    assert.equal(result.paired.legacy.lowerBound, null);
  }
  for (const k of [0, -1, 1.2, '1', NaN, Infinity, 51]) assert.throws(() => report.evaluateEvidenceBlock(all, k));
  for (const mode of ['historical', 'readonly-import']) assert.equal(report.evaluateEvidenceBlock(all, 1, { mode }).status, 'descriptive');
});

check('zero denominators, losses, scattered hits and excluded same-day targets are explicit', () => {
  const empty = report.summarizeExperiment(stateWith(0));
  assert.deepEqual(primary(empty.arms.learner), { sampleCount: 0, winCount: 0, rate: null });
  assert.equal(empty.paired.legacy.meanDifference, null);
  const state = stateWith(5);
  state.snapshots.forEach(s => { s.arms.learner = lineSet(false); });
  // Four individual matching rows do not add up to a three-number hit in any one row.
  state.snapshots[0].arms.learner.slice(0, 4).forEach((line, i) => { line.numbers = [i + 1, 20, 21, 22, 23, 24]; });
  state.snapshots[4].createdAt = '2026-09-21T21:00:00Z';
  const summary = report.summarizeExperiment(state);
  assert.deepEqual(primary(summary.arms.learner), { sampleCount: 4, winCount: 0, rate: 0 });
  assert.equal(summary.exclusions['same-day-or-late'], 1);
  assert.equal(summary.prizes.learner.knownPrizeIls, 0); assert.equal(summary.prizes.learner.missingCount, 5);
  state.snapshots[0].arms.learner.forEach(line => { line.strong = 2; });
  for (const arm of arms) assert.deepEqual(primary(report.summarizeExperiment(state).arms[arm]), primary(summary.arms[arm]));
});

check('secondary outcomes share eligible targets and strong totals count rows, not wins', () => {
  const state = stateWith(4);
  state.snapshots.forEach(snapshot => { snapshot.arms.learner = lineSet(false, 2); });
  state.snapshots[0].arms.learner[0] = { ...state.snapshots[0].arms.learner[0], numbers: [1, 2, 3, 4, 20, 21], strong: 1 };
  state.snapshots[0].arms.learner[1].strong = 1;
  state.snapshots[1].arms.learner[0].numbers = [1, 2, 3, 4, 5, 20];
  for (const index of [2, 3]) state.snapshots[index].arms.learner[0] = { ...state.snapshots[index].arms.learner[0], numbers: [1, 2, 3, 4, 5, 6], strong: 1 };
  state.snapshots[3].createdAt = '2026-09-21T21:00:00Z';
  const expected = { win4PlusCount: 3, win4PlusRate: 1, win5PlusCount: 2, win5PlusRate: 2 / 3,
    win6Count: 1, win6Rate: 1 / 3, strongMatchCount: 3 };
  const live = report.summarizeExperiment(state);
  assert.equal(live.arms.learner.sampleCount, 3);
  assert.deepEqual(live.arms.learner.secondary, expected);
  assert.deepEqual(report.readBackup(envelope(state)).report.arms.learner.secondary, expected);
  assert.deepEqual(report.summarizeExperiment(stateWith(0)).arms.learner.secondary,
    { win4PlusCount: 0, win4PlusRate: null, win5PlusCount: 0, win5PlusRate: null, win6Count: 0, win6Rate: null, strongMatchCount: 0 });
  const replay = { mode: 'historical', sampleCount: 200, seed: core.HISTORICAL_SEED, decisions: [],
    targets: Array.from({ length: 200 }, (_, i) => ({ target: 4000 + i, draw: { ...clone(draw), drawNumber: 4000 + i },
      arms: clone(state.snapshots[0].arms), scores: {} })) };
  assert.deepEqual(report.summarizeHistoricalReplay(replay).arms.learner.secondary,
    { win4PlusCount: 200, win4PlusRate: 1, win5PlusCount: 0, win5PlusRate: 0, win6Count: 0, win6Rate: 0, strongMatchCount: 400 });
});

check('fixed block index progresses through gaps and is stable on reload', () => {
  const state = stateWith(401);
  state.snapshots.splice(10, 1); state.observations.splice(10, 1);
  const result = report.summarizeExperiment(state);
  assert.deepEqual(result.blocks.map(b => [b.k, b.n, b.status]), [[1, 200, 'descriptive'], [2, 200, 'period-evidence'], [3, 1, 'insufficient']]);
  assert.equal(result.blocks[1].alpha, 0.05 / 12);
  assert.equal(result.exclusions.missing, 1);
  assert.deepEqual(report.summarizeExperiment(clone(state)), result);
  state.faults.push({ target: 4000, code: 'DRAW_CONFLICT' });
  assert(report.summarizeExperiment(state).blocks.every(b => b.status !== 'period-evidence'));
  assert.equal(report.summarizeExperiment(state).exclusions.conflict, 1);
});

check('backup imports recompute outcomes and eligibility, retain safe labels and cannot confer evidence', () => {
  const state = stateWith(200);
  state.snapshots[0].arms.legacy[0] = { ...state.snapshots[0].arms.legacy[0], numbers: [25, 20, 24, 21, 23, 22], strategy: '<img src=x onerror=alert(1)>', extra: { note: 'retained' } };
  [state.snapshots[0].arms.legacy[0].comboNum, state.snapshots[0].arms.legacy[1].comboNum] = [2, 1];
  state.observations[0].scores.legacy = core.scoreArm(state.snapshots[0].arms.legacy, state.observations[0].draw);
  const saved = report.exportBackup(state); const imported = report.readBackup(saved);
  assert.equal(imported.mode, 'readonly-import');
  assert.deepEqual(imported.state, state);
  assert.equal(imported.report.blocks[0].status, 'descriptive');
  assert.deepEqual(imported.report.verification, { digestValidation: 'syntax-only', sourceAuthenticity: 'unverified', prizeAuthenticity: 'unverified' });
  assert.deepEqual(report.readBackup(saved), imported);
  state.observations[0].scores.learner.win3Plus = 0;
  state.snapshots[0].createdAt = '2026-09-21T21:00:00Z';
  const corrected = report.readBackup(envelope(state));
  assert.equal(corrected.state.observations[0].scores.learner.win3Plus, 1);
  assert.equal(corrected.state.observations[0].kind, 'same-day-or-late');
  assert.equal(corrected.report.arms.learner.sampleCount, 199);
  assert.equal(state.observations[0].kind, 'eligible');
});

check('historical replay adapter uses actual arms/draws without persistent snapshots', () => {
  const replay = { mode: 'historical', sampleCount: 200, seed: core.HISTORICAL_SEED, decisions: [],
    targets: Array.from({ length: 200 }, (_, i) => ({ target: 4000 + i, draw: { ...clone(draw), drawNumber: 4000 + i },
      arms: { learner: lineSet(true), legacy: lineSet(false), random: lineSet(false) },
      scores: { learner: { win3Plus: 0 }, legacy: { win3Plus: 1 }, random: { win3Plus: 1 } } })) };
  const before = JSON.stringify(replay); const summary = report.summarizeHistoricalReplay(replay);
  assert.equal(summary.mode, 'historical');
  assert.deepEqual(primary(summary.arms.learner), { sampleCount: 200, winCount: 200, rate: 1 });
  assert.deepEqual(primary(summary.arms.random), { sampleCount: 200, winCount: 0, rate: 0 });
  assert.equal(summary.blocks[0].status, 'descriptive');
  assert.equal(summary.blocks[0].paired.legacy.lowerBound, null);
  assert.equal(JSON.stringify(replay), before);
  replay.targets[0].target = 4001;
  assert.throws(() => report.summarizeHistoricalReplay(replay));
});

function winnings(amount) {
  return { status: 'available', totalPrizeIls: amount, winningCombinationCount: Number(amount > 0), sourceUrl: 'https://example.test/prizes',
    lines: Array.from({ length: 14 }, (_, i) => i === 0 && amount > 0
      ? { status: 'won', tierKey: '3+strong', prizeIls: amount } : { status: 'no-prize', tierKey: '0', prizeIls: null }) };
}
check('partial prize totals separate known zero from unavailable money and validate monetary shape', () => {
  const state = stateWith(3);
  const unavailable = { status: 'unavailable', totalPrizeIls: null, winningCombinationCount: null, sourceUrl: null,
    lines: Array.from({ length: 14 }, () => ({ status: 'unavailable', tierKey: null, prizeIls: null })) };
  state.prizes = [{ experimentId: state.experiment.id, target: 4000, drawDigest: 'b'.repeat(64), checkedAt: '2026-09-22T12:00:00Z',
    arms: { learner: winnings(25), legacy: winnings(0), random: unavailable } }];
  const totals = report.summarizeExperiment(state).prizes;
  assert.deepEqual(totals.learner, { knownPrizeIls: 25, knownCount: 1, missingCount: 2 });
  assert.deepEqual(totals.legacy, { knownPrizeIls: 0, knownCount: 1, missingCount: 2 });
  assert.deepEqual(totals.random, { knownPrizeIls: 0, knownCount: 0, missingCount: 3 });
  assert.deepEqual(report.readBackup(envelope(state)).report.prizes, totals);
  for (const amount of [-1, 1.5, '25', Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = clone(state); invalid.prizes[0].arms.learner.totalPrizeIls = amount;
    assert.throws(() => report.readBackup(envelope(invalid)));
  }
  const bad = clone(state); bad.prizes[0].arms.learner.lines[0].prizeIls = 26;
  assert.throws(() => report.readBackup(envelope(bad)));
  const notDistributed = clone(state);
  notDistributed.prizes[0].arms.legacy.lines[0] = { status: 'not-distributed', tierKey: '6+strong', prizeIls: 0 };
  assert.equal(report.readBackup(envelope(notDistributed)).report.prizes.legacy.knownCount, 1);
});

check('untrusted envelopes reject duplicate/prototype keys, bad versions and oversized work', () => {
  assert.throws(() => report.readBackup('{"schemaVersion":99}'), { code: 'UNSUPPORTED_BACKUP' });
  for (const json of ['{"schemaVersion":1,"schemaVersion":1}', '{"a":1,"\\u0061":2}', '{"__proto__":{}}', '{"x":{"constructor":{}}}', '{} trailing']) assert.throws(() => report.readBackup(json));
  assert.throws(() => report.readBackup(' '.repeat(25 * 1024 * 1024 + 1)), { code: 'BACKUP_TOO_LARGE' });
  for (const mutate of [
    s => { s.experiment.coreVersion = 'old'; },
    s => { s.experiment.sourceDigest = 'z'.repeat(64); },
    s => { s.snapshots[0].source.digest = 'a'.repeat(63); },
    s => { s.snapshots[0].experimentId = 'another'; },
    s => { s.snapshots[0].target = '4000'; },
    s => { s.snapshots[0].arms.learner[0].strong = 8; },
    s => { s.snapshots.push(clone(s.snapshots[0])); },
    s => { s.observations[0].kind = 'invented'; },
    s => { s.observations[0].draw.strong = '1'; },
    s => { s.experiment.lastProcessedDraw = s.experiment.originAnchor + 10001; },
    s => { s.faults = [{ target: Number.MAX_SAFE_INTEGER, code: 'huge' }]; },
    s => { s.observations = Array(10001).fill(s.observations[0]); },
  ]) { const state = stateWith(); mutate(state); assert.throws(() => report.readBackup(envelope(state))); }
  const state = stateWith(0); state.experiment.lastProcessedDraw = Number.MAX_SAFE_INTEGER;
  assert.throws(() => report.summarizeExperiment(state));
  assert.throws(() => report.buildObservations(stateWith(0), [{ ...draw, drawNumber: 999999999 }]));
  const rawBackup = '{"schemaVersion":99,"opaque":"<script>do not execute</script>"}';
  assert.equal(report.exportBackup({ compatibility: 'readonly', rawBackup }), rawBackup);
  assert.equal(report.exportBackup({ compatibility: 'readonly', rawBackup: JSON.parse(rawBackup) }), rawBackup);
  const empty = { compatibility: 'compatible', incompatibilityCodes: [], rawBackup: null, revision: 0,
    experiment: null, decisions: [], snapshots: [], observations: [], prizes: [], faults: [] };
  assert.equal(report.readBackup(envelope(empty)).report.targetCount, 0);
  for (const invalidExperiment of [false, 0, '']) {
    assert.throws(() => report.readBackup(envelope({ ...empty, experiment: invalidExperiment })));
  }
});

console.log('Learning report verification passed');
