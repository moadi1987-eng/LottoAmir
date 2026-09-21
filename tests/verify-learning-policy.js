'use strict';

const assert = require('assert');
const core = require('../lotto-learning-core.js');
const strategy = require('../lotto-strategy-core.js');
const { buildLearningDraws } = require('./fixtures/learning-fixture');

const seedHex = '00112233445566778899aabbccddeeff';
const options = { originAnchor: 3699, decisions: [], cutoff: 3699, seedHex, mode: 'live' };
const expectCode = (fn, code) => assert.throws(fn, error => error.code === code);
const rejectsCode = (fn, code) => assert.rejects(fn, error => error.code === code);

async function main() {
  // Catches replacing incumbent-first ties with a fixed window preference.
  assert.equal(core.selectWindow({ 100: 11, 200: 12, 500: 12 }, 200), 200);
  assert.equal(core.selectWindow({ 100: 11, 200: 12, 500: 12 }, 100), 500);
  assert.equal(core.selectWindow({ 100: 13, 200: 12, 500: 12 }, 500), 100);
  assert.equal(core.selectWindow({ 100: 12, 200: 12, 500: 12 }), 500);
  for (const bad of [-1, 201, 1.5, '12', NaN]) {
    expectCode(() => core.selectWindow({ 100: bad, 200: 12, 500: 12 }, 200), 'INVALID_DECISIONS');
  }

  const rows = buildLearningDraws(941);
  const before = structuredClone(rows);
  expectCode(() => core.evaluateDecision(rows.slice(0, 699), 3698, 500), 'INSUFFICIENT_HISTORY');
  await rejectsCode(() => core.prepareAtCutoff(rows.slice(0, 699), { ...options, cutoff: 3698, originAnchor: 3698 }), 'INSUFFICIENT_HISTORY');
  await rejectsCode(() => core.runHistoricalReplay(rows.slice(0, 899)), 'INSUFFICIENT_HISTORY');

  // Literal boundaries catch a 19- or 21-draw scheduling interval.
  console.time('Learning policy scheduling');
  const trainingCalls = [];
  const independentCounts = { 100: 0, 200: 0, 500: 0 };
  const originalGenerate = strategy.generateBaselineForms;
  let stepped;
  try {
    // Observe real generation, independently checking which outcome each form
    // would win. No generated forms or score results are mocked.
    strategy.generateBaselineForms = training => {
      trainingCalls.push([training.length, training[0].drawNumber, training.at(-1).drawNumber]);
      const generated = originalGenerate(training);
      const target = rows[training[0].drawNumber + 1 - 3000];
      independentCounts[training.length] += Number(generated.form2.some(line =>
        line.numbers.filter(number => target.numbers.includes(number)).length >= 3));
      return generated;
    };
    stepped = [core.evaluateDecision(rows, 3699, 500)];
  } finally {
    strategy.generateBaselineForms = originalGenerate;
  }
  assert.equal(trainingCalls.length, 600);
  assert.deepStrictEqual(trainingCalls.slice(0, 3), [[100, 3499, 3400], [200, 3499, 3300], [500, 3499, 3000]]);
  assert.deepStrictEqual(trainingCalls.slice(-3), [[100, 3698, 3599], [200, 3698, 3499], [500, 3698, 3199]]);
  for (let index = 0; index < 200; index++) {
    assert.deepStrictEqual(trainingCalls.slice(index * 3, index * 3 + 3).map(call => call[1]), [3499 + index, 3499 + index, 3499 + index]);
  }
  assert.deepStrictEqual(stepped[0].counts, independentCounts);
  for (let cutoff = 3700; cutoff <= 3740; cutoff++) {
    stepped = core.advancePolicy(rows, 3699, stepped, cutoff);
  }
  const batched = core.advancePolicy(rows, 3699, [], 3740);
  assert.deepStrictEqual(batched, stepped);
  assert.deepStrictEqual(batched.map(decision => decision.cutoff), [3699, 3719, 3739]);
  assert.deepStrictEqual(core.advancePolicy(rows, 3699, [batched[0], batched[2]], 3740), batched);
  const decisionsBefore = structuredClone(batched);
  core.advancePolicy(rows, 3699, batched, 3740);
  assert.deepStrictEqual(batched, decisionsBefore);
  console.timeEnd('Learning policy scheduling');

  for (const invalid of [null, [batched[1]], [batched[0], batched[0]], [batched[1], batched[0]],
    [{ ...batched[0], cutoff: 3700 }], [{ ...batched[0], window: 300 }],
    [{ ...batched[0], counts: { 100: 0, 200: 201, 500: 0 } }],
    [{ ...batched[0], protocolVersion: 'old' }], [{ ...batched[0], coreVersion: 'old' }]]) {
    expectCode(() => core.advancePolicy(rows, 3699, invalid, 3740), 'INVALID_DECISIONS');
  }
  expectCode(() => core.advancePolicy(rows, 3699, batched, 3718), 'INVALID_DECISIONS');
  await rejectsCode(() => core.prepareAtCutoff(rows, { ...options, protocolVersion: 'old' }), 'INVALID_VERSION');
  await rejectsCode(() => core.prepareAtCutoff(rows, { ...options, coreVersion: 'old' }), 'INVALID_VERSION');

  // Stored decisions with deliberately different winners isolate application
  // timing from whichever windows happen to win this generator fixture.
  const storedSwitch = [
    { cutoff: 3699, window: 100, counts: { 100: 20, 200: 10, 500: 10 } },
    { cutoff: 3719, window: 500, counts: { 100: 10, 200: 10, 500: 20 } },
  ];
  const beforeSwitch = await core.prepareAtCutoff(rows, { ...options, decisions: storedSwitch.slice(0, 1), cutoff: 3718 });
  const afterSwitch = await core.prepareAtCutoff(rows, { ...options, decisions: storedSwitch, cutoff: 3719 });
  assert.equal(beforeSwitch.window, 100); // target 3719, twentieth live target
  assert.equal(afterSwitch.window, 500); // target 3720, twenty-first live target
  assert.deepStrictEqual(beforeSwitch.arms.learner, core.generatePolicyForm(rows, 3718, 100));
  assert.deepStrictEqual(afterSwitch.arms.learner, core.generatePolicyForm(rows, 3719, 500));

  const progress = [];
  console.time('Learning policy cutoff invariants');
  const prepared = await core.prepareAtCutoff(rows, options, value => progress.push(value));
  assert.equal(prepared.cutoff, 3699);
  assert.equal(prepared.window, prepared.decisions[0].window);
  assert.equal(prepared.digest, await core.hashHistory(rows.slice(0, 700)));
  assert.ok(progress.length > 0);
  assert.ok(Object.values(prepared.arms).every(lines => lines.length === 14));
  assert.ok(prepared.arms.legacy.some(line => line.strategy.endsWith(' • השלמה קבועה')));
  assert.deepStrictEqual(await core.prepareAtCutoff(rows.slice(0, 700), options), prepared);

  // Mutating the target AND every future outcome must not influence any arm,
  // completion, decision, or source digest at the preceding anchor.
  const changedFuture = rows.map((draw, index) => index < 700 ? draw : {
    ...draw, numbers: [2, 3, 4, 5, 6, 7], strong: 8,
  });
  assert.deepStrictEqual(await core.prepareAtCutoff(changedFuture, options), prepared);
  const changedPast = rows.map((draw, index) => index >= 200 && index < 700 ? {
    ...draw, numbers: [1, 2, 3, 4, 5, 6], strong: 7,
  } : draw);
  const pastPrepared = await core.prepareAtCutoff(changedPast, options);
  assert.notEqual(pastPrepared.digest, prepared.digest);
  assert.notDeepStrictEqual(pastPrepared.arms.learner, prepared.arms.learner);
  assert.notDeepStrictEqual(pastPrepared.arms.legacy, prepared.arms.legacy);
  assert.deepStrictEqual(pastPrepared.arms.random, prepared.arms.random);

  const older = buildLearningDraws(701);
  older[0].strong = 8;
  const olderOptions = { ...options, originAnchor: 3700, cutoff: 3700 };
  const olderPrepared = await core.prepareAtCutoff(older, olderOptions);
  assert.equal(olderPrepared.digest, await core.hashHistory(older));
  assert.notEqual(olderPrepared.digest, await core.hashHistory(older.slice(1)));
  await rejectsCode(() => core.prepareAtCutoff(rows, { ...options, cutoff: 5000 }), 'INVALID_CUTOFF');
  console.timeEnd('Learning policy cutoff invariants');

  const replayProgress = [];
  console.time('Learning policy first replay');
  const replay = await core.runHistoricalReplay(rows.slice(0, 900), value => replayProgress.push(value));
  console.timeEnd('Learning policy first replay');
  assert.equal(replay.mode, 'historical');
  assert.equal(replay.sampleCount, 200);
  assert.equal(replay.seed, 'learning-history-v1');
  assert.equal(replay.targets.length, 200);
  assert.deepStrictEqual(replay.targets.map(row => row.target), Array.from({ length: 200 }, (_, i) => 3700 + i));
  assert.deepStrictEqual(replay.decisions.map(decision => decision.cutoff), [3699, 3719, 3739, 3759, 3779, 3799, 3819, 3839, 3859, 3879]);
  assert.deepStrictEqual(replay.targets[0].arms.learner, prepared.arms.learner);
  assert.deepStrictEqual(replay.targets[0].arms.legacy, prepared.arms.legacy);
  assert.notDeepStrictEqual(replay.targets[0].arms.random, prepared.arms.random);
  assert.equal(replay.targets[0].draw.drawNumber, 3700);
  for (const item of replay.targets) {
    for (const name of ['learner', 'legacy', 'random']) {
      const independentWin = Number(item.arms[name].some(line => line.numbers.filter(n => item.draw.numbers.includes(n)).length >= 3));
      assert.equal(item.scores[name].win3Plus, independentWin);
    }
  }
  assert.ok(replayProgress.length > 0);
  console.time('Learning policy deterministic replay');
  assert.deepStrictEqual(await core.runHistoricalReplay(rows.slice(0, 900)), replay);
  console.timeEnd('Learning policy deterministic replay');
  assert.deepStrictEqual(rows, before);
  console.log('Learning policy verification passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
