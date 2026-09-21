'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const strategy = require('../lotto-strategy-core.js');
const core = require('../lotto-learning-core.js');
const fixture = require('./fixtures/learning-fixture');
const { buildLearningDraws, toLearningMatrix } = fixture;

function expectCode(fn, code) {
  assert.throws(fn, error => error && error.code === code);
}

function makeLines({ duplicate = false, invalid = false, label = 'fixture' } = {}) {
  return Array.from({ length: 14 }, (_, index) => {
    const offset = duplicate ? 0 : index;
    const numbers = Array.from({ length: 6 }, (_, numberIndex) => ((offset + numberIndex * 7) % 37) + 1)
      .sort((a, b) => a - b);
    return {
      comboNum: index + 1,
      strategy: label,
      numbers,
      strong: invalid && index === 13 ? 9 : (index % 7) + 1,
    };
  });
}

function buildFrequencyLearningDraws() {
  return buildLearningDraws(700).map((draw, index) => {
    if (index < 200) return draw;
    const trainingIndex = index - 200;
    let numbers;
    if (trainingIndex < 200) numbers = [1, 2, 3, 4, 5, 6];
    else if (trainingIndex < 300) numbers = [1, 2, 3, 4, 9, 10];
    else if (trainingIndex < 400) numbers = [1, 2, 3, 8, 9, 10];
    else numbers = [1, 2, 7, 8, 9, 10];
    return { ...draw, numbers };
  });
}

async function main() {
  const history = buildLearningDraws(700);
  assert.deepStrictEqual(toLearningMatrix(history.slice(0, 1)), [
    [3000, '2020-01-01', 1, 6, 11, 16, 21, 26, 1],
  ]);

  assert.equal(core.PROTOCOL_VERSION, 'learning-experiment-v1');
  assert.equal(core.LEGACY_COMPLETION_VERSION, 'frequency-fill-v1');
  assert.equal(
    core.CORE_VERSION,
    `${strategy.ALGORITHM_VERSION}:${strategy.CONSTRAINT_VERSION}:legacy-frequency-fill-v1`,
  );
  assert.equal(core.parseLearningDate('2026-02-28'), '2026-02-28');
  assert.equal(core.parseLearningDate('28/02/2026'), '2026-02-28');
  assert.equal(core.parseLearningDate('28.02.2026'), '2026-02-28');
  assert.equal(core.parseLearningDate('28-02-2026'), '2026-02-28');
  assert.equal(core.parseLearningDate(43831), '2020-01-01');
  assert.equal(core.parseLearningDate('43831'), '2020-01-01');
  expectCode(() => core.parseLearningDate('31/02/2026'), 'INVALID_DATE');
  expectCode(() => core.parseLearningDate('2026-02-29'), 'INVALID_DATE');
  expectCode(() => core.parseLearningDate('2026/02/28'), 'INVALID_DATE');
  expectCode(() => core.parseLearningDate('12junk'), 'INVALID_DATE');
  expectCode(() => core.parseLearningDate(1577836800000), 'INVALID_DATE');

  const normalized = core.validateHistory(history);
  assert.equal(normalized.excludedHistoricalCount, 0);
  assert.equal(normalized.rows.length, 700);
  assert.notStrictEqual(normalized.rows[0], history[0]);
  assert.deepStrictEqual(normalized.rows[0], history[0]);

  const stringValues = structuredClone(history);
  stringValues[0] = {
    ...stringValues[0],
    drawNumber: '3000',
    date: '01/01/2020',
    numbers: stringValues[0].numbers.map(String),
    strong: '1',
  };
  assert.deepStrictEqual(core.validateHistory(stringValues).rows[0], history[0]);

  const shuffled = history.slice().reverse();
  assert.deepStrictEqual(core.validateHistory(shuffled).rows, history);

  const badPrefix = structuredClone(history);
  badPrefix[50].numbers[0] = '12junk';
  expectCode(() => core.validateHistory(badPrefix), 'INVALID_DRAW');

  const duplicateIds = structuredClone(history);
  duplicateIds[20].drawNumber = duplicateIds[19].drawNumber;
  expectCode(() => core.validateHistory(duplicateIds), 'INVALID_DRAW');

  const gap = structuredClone(history);
  gap[20].drawNumber += 1;
  expectCode(() => core.validateHistory(gap), 'INVALID_DRAW');

  const reversedDates = structuredClone(history);
  reversedDates[20].date = '2019-12-31';
  expectCode(() => core.validateHistory(reversedDates), 'INVALID_DRAW');

  const strongNine = structuredClone(history);
  strongNine[20].strong = 9;
  expectCode(() => core.validateHistory(strongNine), 'INVALID_DRAW');

  const historicalPrefix = structuredClone(history);
  historicalPrefix[0].strong = 8;
  historicalPrefix[42].strong = 8;
  const retained = core.validateHistory(historicalPrefix);
  assert.equal(retained.excludedHistoricalCount, 43);
  assert.equal(retained.rows[0].drawNumber, 3043);
  assert.ok(retained.rows.every(row => row.strong >= 1 && row.strong <= 7));
  const changedExcludedPast = structuredClone(historicalPrefix);
  changedExcludedPast[0].strong = 7;
  assert.notEqual(
    await core.hashHistory(changedExcludedPast),
    await core.hashHistory(historicalPrefix),
  );

  assert.equal(core.canonicalHistory(shuffled), core.canonicalHistory(history));
  assert.equal(await core.hashHistory(shuffled), await core.hashHistory(history));
  const changedPast = structuredClone(history);
  changedPast[100].strong = changedPast[100].strong === 7 ? 6 : 7;
  assert.notEqual(await core.hashHistory(changedPast), await core.hashHistory(history));
  assert.match(await core.hashHistory(history), /^[0-9a-f]{64}$/);

  const random = core.generateRandomForm('fixed-fixture-seed');
  assert.equal(random.length, 14);
  assert.equal(new Set(random.map(row => row.numbers.join(','))).size, 14);
  assert.deepStrictEqual(core.generateRandomForm('fixed-fixture-seed'), random);
  assert.ok(random.every((row, index) => row.comboNum === index + 1
    && row.numbers.length === 6
    && new Set(row.numbers).size === 6
    && row.numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 37)));
  assert.deepStrictEqual(
    Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1,
      random.filter(row => row.strong === index + 1).length])),
    { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2 },
  );

  const loss = core.scoreArm([
    { comboNum: 1, numbers: [1, 2, 20, 21, 22, 23], strong: 1 },
    { comboNum: 2, numbers: [3, 4, 24, 25, 26, 27], strong: 1 },
  ], { numbers: [1, 2, 3, 4, 5, 6], strong: 1 });
  assert.deepStrictEqual(loss, {
    rows: [
      { comboNum: 1, regularMatches: 2, strongMatch: true },
      { comboNum: 2, regularMatches: 2, strongMatch: true },
    ],
    win3Plus: 0,
    win4Plus: 0,
    win5Plus: 0,
    win6: 0,
    strongMatches: 2,
  });

  const cutoff = history.at(-1).drawNumber;
  const policy = core.generatePolicyForm(history, cutoff, 100);
  assert.equal(policy.length, 14);
  assert.equal(new Set(policy.map(row => row.numbers.join(','))).size, 14);
  const arms = core.buildArms(history, cutoff, 100, 'abc123', 'historical');
  assert.deepStrictEqual(Object.keys(arms).sort(), ['learner', 'legacy', 'random']);
  assert.ok(Object.values(arms).every(lines => lines.length === 14));
  assert.ok(arms.legacy.every(line => line.numbers.length === 6));
  assert.ok(arms.legacy.some(line => line.strategy.endsWith(' • השלמה קבועה')));
  assert.deepStrictEqual(
    arms.random,
    core.generateRandomForm(`learning-experiment-v1|historical|abc123|${cutoff + 1}|random`),
  );

  const originalGenerate = strategy.generateBaselineForms;
  try {
    let receivedRows = null;
    strategy.generateBaselineForms = rows => {
      receivedRows = rows;
      return { form2: makeLines(), main: makeLines({ duplicate: true, label: 'legacy' }) };
    };
    const mockedPolicy = core.generatePolicyForm(history, cutoff, 100);
    assert.equal(mockedPolicy.length, 14);
    assert.equal(receivedRows[0].drawNumber, cutoff);
    assert.equal(receivedRows.at(-1).drawNumber, cutoff - 99);
    const duplicateLegacy = core.buildArms(history, cutoff, 100, 'abc123', 'live');
    assert.equal(new Set(duplicateLegacy.legacy.map(row => row.numbers.join(','))).size, 1);

    const frequencyHistory = buildFrequencyLearningDraws();
    const frequencyHistoryBefore = structuredClone(frequencyHistory);
    const shortLegacy = makeLines({ label: 'legacy' });
    for (let index = 0; index < 5; index += 1) {
      shortLegacy[index] = {
        comboNum: index + 1,
        strategy: `short-${index + 1}`,
        numbers: [2, 11, 12, 13, 14].slice(0, index + 1),
        strong: index + 1,
        marker: `keep-${index + 1}`,
      };
    }
    shortLegacy[5] = {
      comboNum: 6,
      strategy: 'valid-sentinel',
      numbers: [30, 1, 24, 7, 18, 12],
      strong: 4,
      marker: 'unchanged',
    };
    const shortLegacyBefore = structuredClone(shortLegacy);
    strategy.generateBaselineForms = rows => (rows.length === 500
      ? { main: shortLegacy }
      : { form2: makeLines() });
    const completed = core.buildArms(
      frequencyHistory,
      frequencyHistory.at(-1).drawNumber,
      100,
      'frequency-case',
      'historical',
    ).legacy;
    assert.deepStrictEqual(completed[0], {
      comboNum: 1,
      strategy: 'short-1 • השלמה קבועה',
      numbers: [1, 2, 3, 4, 9, 10],
      strong: 1,
      marker: 'keep-1',
    });
    assert.deepStrictEqual(completed[4], {
      comboNum: 5,
      strategy: 'short-5 • השלמה קבועה',
      numbers: [1, 2, 11, 12, 13, 14],
      strong: 5,
      marker: 'keep-5',
    });
    assert.ok(completed.slice(0, 5).every((line, index) => line.numbers.length === 6
      && line.strong === index + 1
      && shortLegacy[index].numbers.every(number => line.numbers.includes(number))));
    assert.deepStrictEqual(completed[5], shortLegacyBefore[5]);
    assert.deepStrictEqual(shortLegacy, shortLegacyBefore);
    assert.deepStrictEqual(frequencyHistory, frequencyHistoryBefore);

    strategy.generateBaselineForms = () => ({
      form2: makeLines({ invalid: true }),
      main: makeLines(),
    });
    expectCode(() => core.generatePolicyForm(history, cutoff, 100), 'GENERATION_FAILED');
    expectCode(() => core.buildArms(history, cutoff, 100, 'abc123', 'live'), 'GENERATION_FAILED');

    strategy.generateBaselineForms = rows => ({
      form2: makeLines(),
      main: rows.length === 500 ? makeLines({ invalid: true }) : makeLines(),
    });
    expectCode(() => core.buildArms(history, cutoff, 100, 'abc123', 'live'), 'GENERATION_FAILED');

    const malformedLegacyRows = [
      { numbers: [] },
      { numbers: 'not-an-array' },
      { numbers: [1, 1] },
      { numbers: ['1'] },
      { numbers: [0] },
      { numbers: [1, 2, 3, 4, 5, 6, 7] },
      { comboNum: 0, numbers: [1] },
      { comboNum: 15, numbers: [1] },
      { comboNum: '1', numbers: [1] },
      { strategy: null, numbers: [1] },
      { strategy: '', numbers: [1] },
      { strong: 9, numbers: [1] },
      { strong: '1', numbers: [1] },
    ];
    for (const malformed of malformedLegacyRows) {
      const main = makeLines({ label: 'legacy' });
      main[0] = { ...main[0], ...malformed };
      strategy.generateBaselineForms = rows => (rows.length === 500
        ? { main }
        : { form2: makeLines() });
      expectCode(
        () => core.buildArms(history, cutoff, 100, 'abc123', 'live'),
        'GENERATION_FAILED',
      );
    }
  } finally {
    strategy.generateBaselineForms = originalGenerate;
  }

  const fixtureSource = fs.readFileSync('tests/fixtures/learning-fixture.js', 'utf8');
  const browserContext = { self: {} };
  vm.runInNewContext(fixtureSource, browserContext);
  assert.equal(typeof browserContext.self.LottoLearningFixture.buildLearningDraws, 'function');
  assert.equal(browserContext.self.LottoLearningFixture.buildLearningDraws(2).length, 2);

  const coreSource = fs.readFileSync('lotto-learning-core.js', 'utf8');
  const coreBrowserContext = {
    self: { LottoStrategyCore: strategy, crypto: globalThis.crypto, TextEncoder },
  };
  vm.runInNewContext(coreSource, coreBrowserContext);
  assert.equal(typeof coreBrowserContext.self.LottoLearningCore.buildArms, 'function');

  console.log('Learning core verification passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
