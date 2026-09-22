'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { openLearningHarness, configureLearningPage, routeLearningWorkbook } = require('./helpers/learning-browser');
const { buildLearningDraws, toLearningMatrix } = require('./fixtures/learning-fixture');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');
const strategy = require('../lotto-strategy-core');

const panel = page => page.locator('#learningExperimentCard');
const action = (page, name) => panel(page).getByRole('button', { name, exact: true });
const stored = page => page.evaluate(async () => {
  const store = await LottoLearningStore.open();
  try { return await store.read(); } finally { store.close(); }
});
const preserved = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
  .filter(key => /pinned|backtest/i.test(key)).sort().map(key => [key, localStorage.getItem(key)])));
const pinRows = () => [
  { comboNum: 1, strategy: '3 + strong', numbers: [1, 2, 3, 20, 21, 22], strong: 1 },
  { comboNum: 2, strategy: '3', numbers: [1, 2, 3, 23, 24, 25], strong: 2 },
  { comboNum: 3, strategy: '3 second', numbers: [4, 5, 6, 26, 27, 28], strong: 2 },
  { comboNum: 4, strategy: 'two', numbers: [1, 2, 20, 21, 22, 23], strong: 2 },
  ...Array.from({ length: 10 }, (_, i) => ({ comboNum: i + 5, strategy: 'no prize', numbers: [20, 21, 22, 23, 24, 25], strong: 2 })),
];
// Same persisted schema as verify-pinned-forms-playwright, without importing its runner.
function pins() {
  return { version: 2, ...Object.fromEntries(['main', 'form2'].map(source => [source,
    Object.fromEntries(['baseline', 'improved'].map(mode => [mode, {
      source, mode, label: `${source}-${mode}`, pinnedAt: '2026-07-14T12:00:00.000Z',
      anchorDrawNumber: 4001, anchorDrawDate: '17/07/2026', combinations: pinRows(),
    }]))])) };
}

async function verifyPinControls(page, originals) {
  // Detects changed numbers, wrong sort scope/order, LTR regressions, lost collapsed winnings,
  // or opening one PIN mutating any of the other three cards.
  assert.deepEqual(await page.evaluate(() => pinnedForms), originals);
  await page.evaluate(() => {
    currentData = [
      { drawNumber: 4002, date: '20/07/2026', numbers: [1, 2, 3, 4, 5, 6], strong: 1 },
      { drawNumber: null, date: '21/07/2026', numbers: [7, 8, 9, 10, 11, 12], strong: 2 },
    ];
    lottoPrizeDocument = normalizeLottoPrizeDocument({ schemaVersion: 1, draws: { 4002: {
      drawNumber: 4002, drawDate: '20/07/2026', sourceUrl: 'https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=4002',
      regular: { '3+strong': { winnerCount: 10, prizeIls: 59 }, 3: { winnerCount: 20, prizeIls: 15 } },
    } } });
    lottoPrizeLoadState = 'ready';
    document.querySelector('#results').style.display = 'block';
    renderPinnedFormStatus(); renderPinnedFutureComparisons();
  });
  const cards = page.locator('.pinned-future-source');
  assert.equal(await cards.count(), 4);
  const cardStates = () => cards.evaluateAll(nodes => nodes.map(card => ({
    open: [...card.querySelectorAll('details[open]')].map(d => d.dataset.pinDrawLabel),
    summary: card.querySelector('[data-pin-open-draw-summary]').textContent,
  })));
  for (let i = 0; i < 4; i++) {
    const card = cards.nth(i);
    const draw = card.locator('[data-pin-draw-label="#4002"]');
    assert.equal((await draw.locator('summary [data-pin-draw-prize]').innerText()).trim(), 'זכייה: ₪89');
    const before = await cardStates();
    await draw.locator('summary').click();
    await page.waitForFunction(index => document.querySelectorAll('.pinned-future-source')[index]
      .querySelector('[data-pin-winnings="value"]').textContent.trim() === '₪89', i);
    const after = await cardStates();
    assert.notDeepEqual(after[i], before[i]);
    for (let j = 0; j < 4; j++) if (i !== j) assert.deepEqual(after[j], before[j]);
    const rows = () => draw.locator('tbody tr').evaluateAll(nodes => nodes.map(row => [
      Number(row.dataset.pinComboNumber), Number(row.dataset.pinRegularMatches), Number(row.dataset.pinStrongMatch),
    ]));
    const combo = draw.locator('button[data-pin-sort-key="combo"]');
    await combo.click();
    assert.deepEqual((await rows()).map(row => row[0]), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    await combo.click();
    assert.deepEqual((await rows()).map(row => row[0]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const tokens = draw.locator('[data-pin-combo-number="1"] .pinned-number-token');
    assert.deepEqual(await tokens.allTextContents(), ['1', '2', '3', '20', '21', '22']);
    const positions = await tokens.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().left));
    assert.ok(positions[0] > positions.at(-1), 'PIN numbers retain RTL visual order');
    await draw.locator('button[data-pin-sort-key="hits"]').press('Enter');
    assert.deepEqual((await rows()).slice(0, 4), [[1, 3, 1], [3, 3, 0], [2, 3, 0], [4, 2, 0]]);
    await draw.locator('button[data-pin-sort-key="hits"]').press('Enter');
    assert.deepEqual((await rows()).slice(-4), [[4, 2, 0], [2, 3, 0], [3, 3, 0], [1, 3, 1]]);
    await draw.locator('summary').click();
    await page.waitForFunction(index => document.querySelectorAll('.pinned-future-source')[index]
      .querySelector('[data-pin-winnings="value"]').textContent.trim() === '—', i);
    assert.equal((await draw.locator('summary [data-pin-draw-prize]').innerText()).trim(), 'זכייה: ₪89');
  }
}

async function canonical(page) {
  await page.locator('#defaultDataBtn').click();
  await page.waitForFunction(() => lottoLearningView.sourceState.status === 'ready' && !lottoLearningView.progress);
  assert.equal(await page.evaluate(() => lottoLearningView.error), null);
}

async function verifyLayout(page) {
  for (const [width, height] of [[1440, 900], [900, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    if (width > 768) {
      assert.equal(await page.locator('#sideNav').isVisible(), true);
      const clear = await panel(page).evaluate(card => card.getBoundingClientRect().right
        <= document.querySelector('#sideNav').getBoundingClientRect().left);
      assert.equal(clear, true, `All learning columns and controls must clear the ${width}px desktop rail`);
    }
    const cells = panel(page).locator('[data-learning-active-line] td:first-child');
    assert.equal(await cells.count(), 14);
    for (let i = 0; i < 14; i++) {
      await cells.nth(i).scrollIntoViewIfNeeded();
      assert.equal(await cells.nth(i).evaluate(cell => {
        const rect = cell.getBoundingClientRect();
        const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return top === cell || cell.contains(top);
      }), true, `Learner row ${i + 1} must not be covered by floating navigation at ${width}px`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function main() {
  assert.equal(typeof routeLearningWorkbook, 'function', 'Independent Python XLSX route must be available');
  const h = await openLearningHarness();
  const errors = [];
  try {
    const { page } = h;
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await configureLearningPage(page);
    let draws = buildLearningDraws(700);
    const initialBytes = await routeLearningWorkbook(page, draws);
    await page.goto(h.baseUrl + '/lotto_analyzer.html');
    await page.evaluate(() => lottoLearningReady);
    let originalPins = pins();
    const backtestRows = buildSyntheticDraws(502);
    const cache = strategy.runWalkForwardBacktest(backtestRows);
    await page.evaluate(({ originals, cache }) => {
      localStorage.setItem('lottoPinnedFormsV2', JSON.stringify(originals));
      saveBacktestCache(cache);
    }, { originals: originalPins, cache });
    await page.reload();
    await page.evaluate(() => lottoLearningReady);
    const normalizedPins = await page.evaluate(() => pinnedForms);
    for (const source of ['main', 'form2']) for (const mode of ['baseline', 'improved']) {
      assert.deepEqual(normalizedPins[source][mode].combinations, originalPins[source][mode].combinations);
    }
    originalPins = normalizedPins;
    assert.equal(await page.evaluate(rows => !!loadCompatibleBacktestCache(rows), backtestRows), true);
    const bytesBefore = await preserved(page); // Only AFTER existing startup/normalization.
    assert.equal(Object.keys(bytesBefore).length, 2);
    await verifyPinControls(page, originalPins);

    await canonical(page);
    assert.deepEqual(await page.evaluate(() => loadedExcelRows), toLearningMatrix(draws));
    // Independent digest encoding, not core.hashHistory used on both sides.
    const expectedDigest = createHash('sha256').update(JSON.stringify(draws.map(d => [d.drawNumber, d.date, ...d.numbers, d.strong]))).digest('hex');
    assert.equal(await page.evaluate(() => lottoLearningView.sourceState.digest), expectedDigest);
    assert.equal(await page.evaluate(() => lottoLearningView.sourceState.latestDraw), 3699);
    await page.locator('#fileInput').setInputFiles({ name: 'NUMBERS.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: initialBytes });
    await page.locator('#analyzeBtn').click();
    await page.waitForFunction(() => lottoLearningView.sourceState.status === 'ready');
    assert.equal(await page.evaluate(() => lottoLearningView.sourceState.kind), 'manual');
    assert.equal(await action(page, 'התחל ניסוי ושמור טופס').isDisabled(), true);
    await canonical(page);
    await action(page, 'התחל ניסוי ושמור טופס').click();
    await panel(page).locator('[data-learning-saved="true"]').waitFor({ timeout: 180000 });
    const initial = await stored(page);
    assert.deepEqual(initial.snapshots.map(snapshot => snapshot.target), [3700]);
    assert.equal(initial.snapshots[0].arms.learner.length, 14);
    assert.deepEqual(await preserved(page), bytesBefore);
    console.log('PASS independent openpyxl XLSX decoding, canonical/manual provenance, and live start preserve PIN/Backtest bytes');
    await verifyLayout(page);
    console.log('PASS learning row IDs remain hit-test visible with legacy navigation at desktop/tablet/mobile widths');
    if (process.argv.includes('--layout-only')) return;

    await action(page, 'השהה יצירת טפסים').click();
    await action(page, 'המשך ניסוי').waitFor();
    await routeLearningWorkbook(page, buildLearningDraws(701));
    await canonical(page);
    let state = await stored(page);
    assert.equal(state.observations.length, 1);
    assert.equal(state.observations[0].target, 3700);
    assert.equal(state.observations[0].kind, 'same-day-or-late');
    assert.deepEqual(state.snapshots, initial.snapshots);
    await routeLearningWorkbook(page, buildLearningDraws(703));
    await canonical(page);
    state = await stored(page);
    assert.deepEqual(state.observations.map(o => [o.target, o.kind]), [[3700, 'same-day-or-late'], [3701, 'missing'], [3702, 'missing']]);
    assert.deepEqual(state.snapshots, initial.snapshots, 'Skipped targets must never create retrospective snapshots');
    console.log('PASS new draw settlement and two missed targets retain original immutable snapshot');

    const second = await h.context.newPage();
    second.on('pageerror', error => errors.push(error.message));
    await configureLearningPage(second);
    await routeLearningWorkbook(second, buildLearningDraws(703));
    await second.goto(h.baseUrl + '/lotto_analyzer.html');
    await second.evaluate(() => lottoLearningReady);
    await canonical(second);
    await Promise.all([action(page, 'המשך ניסוי').click(), action(second, 'המשך ניסוי').click()]);
    await Promise.all([page, second].map(p => p.waitForFunction(() => !lottoLearningView.progress &&
      lottoLearningView.stored.snapshots.some(s => s.target === 3703), null, { timeout: 180000 })));
    for (const p of [page, second]) assert.equal(await p.evaluate(() => lottoLearningView.error), null);
    state = await stored(page);
    assert.deepEqual(state.snapshots.map(s => s.target), [3700, 3703]);
    assert.equal(state.experiment.seedHex, initial.experiment.seedHex);
    assert.equal(state.experiment.id, initial.experiment.id);
    assert.ok(state.snapshots.every(s => s.seedHex === initial.experiment.seedHex));
    assert.deepEqual(await stored(second), state);
    await second.close();
    assert.deepEqual(await preserved(page), bytesBefore);
    console.log('PASS same-context two-tab UI resume retains one seed and one snapshot per target');

    await action(page, 'השהה יצירת טפסים').click();
    await action(page, 'המשך ניסוי').waitFor();
    const beforeReplay = await stored(page);
    const replayBytes = await routeLearningWorkbook(page, buildLearningDraws(900));
    await page.locator('#fileInput').setInputFiles({ name: 'historical.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: replayBytes });
    await page.locator('#analyzeBtn').click();
    await page.waitForFunction(() => lottoLearningView.sourceState.rowCount === 900 && !lottoLearningView.progress);
    await panel(page).getByRole('tab', { name: 'סימולציה היסטורית' }).click();
    await action(page, 'בדיקה היסטורית').click();
    await page.waitForFunction(() => lottoLearningView.mode === 'historical', null, { timeout: 240000 });
    assert.equal(await page.evaluate(() => lottoLearningView.pendingReplay.sampleCount), 200);
    assert.deepEqual(await stored(page), beforeReplay, 'Replay must make zero store writes, including revision');
    assert.deepEqual(await preserved(page), bytesBefore);
    console.log('PASS genuine 200-target worker replay makes zero learning/PIN/Backtest writes');

    await panel(page).getByRole('tab', { name: 'מעקב מקומי' }).click();
    const downloadReady = page.waitForEvent('download');
    await action(page, 'ייצא גיבוי').click();
    const download = await downloadReady;
    const backup = fs.readFileSync(await download.path());
    assert.deepEqual(JSON.parse(backup).state.snapshots, beforeReplay.snapshots);
    await panel(page).getByLabel('פתח גיבוי לקריאה בלבד').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
    await panel(page).locator('[data-learning-import="true"]').waitFor();
    assert.equal(await action(page, 'המשך ניסוי').isDisabled(), true);
    assert.deepEqual(await stored(page), beforeReplay);
    await action(page, 'חזרה למעקב המקומי').click();
    await verifyPinControls(page, originalPins);
    await page.locator('[data-pin-action="compare"]').first().click();
    assert.equal(await page.locator('#pinnedFutureCard').isVisible(), true);
    await page.getByRole('button', { name: 'ניסוי למידה', exact: true }).click();
    assert.equal(await panel(page).isVisible(), true);
    assert.deepEqual(await preserved(page), bytesBefore);
    assert.equal(await page.evaluate(rows => !!loadCompatibleBacktestCache(rows), backtestRows), true);
    assert.deepEqual(await stored(page), beforeReplay);
    fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
    for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await panel(page).screenshot({ path: path.join(__dirname, `../test-results/learning-regression-${name}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log('PASS export/readonly import/navigation preserve all four PIN numbers, sorting, RTL, closed winnings and independent cards');
    console.log('Learning cross-feature regression passed');
  } finally { await h.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
