'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { openLearningHarness, configureLearningPage } = require('./helpers/learning-browser');
const { buildLearningDraws, toLearningMatrix } = require('./fixtures/learning-fixture');
const startName = 'התחל ניסוי ושמור טופס';
const panel = page => page.locator('#learningExperimentCard');
const button = (page, name) => panel(page).getByRole('button', { name, exact: true });
const inputFile = json => ({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(json) });

async function verifyFinalPresentation(h) {
  const page = h.page;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async () => {
    const core = LottoLearningCore; const arms = ['learner', 'legacy', 'random'];
    const lines = win => Array.from({ length: 14 }, (_, i) => ({ comboNum: i + 1, strategy: 'נתוני בדיקה סינתטיים',
      numbers: win ? [1, 2, 3, 10 + i, 25, 26] : [7 + i, 22, 23, 24, 25, 26], strong: 1 }));
    const experiment = { id: 'synthetic-ui-only', protocolVersion: core.PROTOCOL_VERSION, coreVersion: core.CORE_VERSION,
      seedHex: '00112233445566778899aabbccddeeff', originAnchor: 3999, lastProcessedDraw: 4199,
      sourceCutoff: 3999, sourceDigest: 'a'.repeat(64), status: 'paused' };
    // Commit valid active snapshots first, then pause through the real store API.
    experiment.status = 'active';
    const change = { experiment, decisions: [], snapshots: [], observations: [], prizes: [], faults: [] };
    for (let i = 0; i < 200; i++) {
      if (i % 20 === 0) change.decisions.push({ cutoff: 3999 + i, window: 500, counts: { 100: 0, 200: 0, 500: 0 } });
      const target = 4000 + i; const draw = { drawNumber: target, date: '2026-09-22', numbers: [1, 2, 3, 4, 5, 6], strong: 1 };
      const snapshot = { experimentId: experiment.id, target, anchor: target - 1, createdAt: '2026-09-21T12:00:00Z',
        protocolVersion: core.PROTOCOL_VERSION, coreVersion: core.CORE_VERSION, seedHex: experiment.seedHex, window: 500,
        source: { kind: 'canonical', url: 'NUMBERS.xlsx', fetchedAt: '2026-09-21T12:00:00Z', generation: 1, digest: 'a'.repeat(64) },
        arms: { learner: lines(true), legacy: lines(false).map(line => ({ ...line, numbers: [20, 21, 22, 23, 24, 25] })), random: lines(i < 100) } };
      change.snapshots.push(snapshot);
      change.observations.push({ experimentId: experiment.id, target, draw, kind: 'eligible',
        scores: Object.fromEntries(arms.map(arm => [arm, core.scoreArm(snapshot.arms[arm], draw)])) });
    }
    function winnings(value) {
      return { status: value === null ? 'unavailable' : 'available', totalPrizeIls: value,
        winningCombinationCount: value === null ? null : Number(value > 0), sourceUrl: null,
        lines: Array.from({ length: 14 }, (_, i) => value === null ? { status: 'unavailable', tierKey: null, prizeIls: null }
          : i === 0 && value > 0 ? { status: 'won', tierKey: '3', prizeIls: value } : { status: 'no-prize', tierKey: '0', prizeIls: null }) };
    }
    change.prizes = [{ experimentId: experiment.id, target: 4000, checkedAt: '2026-09-22T12:00:00Z',
      drawDigest: await core.hashHistory([change.observations[0].draw]),
      arms: { learner: winnings(25), legacy: winnings(0), random: winnings(null) } }];
    const store = await LottoLearningStore.open(); await store.commit(0, change); await store.setPaused(1, true); store.close();
  });
  await configureLearningPage(page);
  await page.goto(h.baseUrl + '/lotto_analyzer.html');
  await page.waitForFunction(() => lottoLearningView?.stored?.snapshots.length === 200);
  await page.evaluate(() => {
    document.querySelector('#learningExperimentCard .learning-disclaimer').prepend('נתוני בדיקה סינתטיים — לא המלצה ולא תוצאות ניסוי אמיתי. ');
  });
  const failures = [];
  async function check(name, fn) {
    try { await fn(); console.log('PASS ' + name); }
    catch (error) { failures.push(name); console.error('FAIL ' + name + ': ' + error.message); }
  }
  await check('paired differences, qualifying bounds/method and distinct-six counts are disclosed', async () => {
    assert.match(await panel(page).locator('[data-learning-paired="legacy"]').textContent(), /100\.0.*נקודות אחוז/);
    assert.match(await panel(page).locator('[data-learning-paired="random"]').textContent(), /50\.0.*נקודות אחוז/);
    const block = panel(page).locator('[data-learning-block="1"]');
    assert.match(await block.locator('[data-learning-evidence-bound="legacy"]').textContent(), /79\.1.*נקודות אחוז/);
    assert.match(await block.locator('[data-learning-evidence-bound="random"]').textContent(), /29\.1.*נקודות אחוז/);
    assert.match(await block.locator('[data-learning-evidence-method]').textContent(), /0\.0125/);
    assert.match(await block.locator('[data-learning-evidence-method]').textContent(), /Hoeffding/);
    assert.equal(await block.locator('bdi[dir="ltr"]').count() >= 3, true);
    const saved = panel(page).locator('[data-learning-saved]');
    for (const [arm, count] of [['learner', 14], ['legacy', 1], ['random', 14]])
      assert.match(await saved.locator(`[data-learning-distinct="${arm}"]`).textContent(), new RegExp(count + ' מתוך 14'));
  });
  await check('closed history shows per-arm known zero/unavailable totals without opening tables', async () => {
    const entry = panel(page).locator('[data-learning-history-target="4000"]');
    const text = await entry.locator(':scope > summary').textContent();
    assert.match(text, /לומד.*₪25/); assert.match(text, /שיטה קיימת.*₪0/); assert.match(text, /אקראי.*לא זמין/);
    assert.equal(await entry.getAttribute('open'), null);
    assert.equal(await entry.locator('table').count(), 0);
    assert.match(await panel(page).locator('[data-learning-prize-total="learner"]').textContent(), /ידוע.*₪25.*199/);
  });
  await check('collapsed 200-target history is lazy, opens once and restores expanded entries on revision', async () => {
    assert.equal(await panel(page).locator('[data-learning-history-target]').count(), 200);
    assert.equal(await panel(page).locator('[data-learning-history-target] table').count(), 0);
    const entry = panel(page).locator('[data-learning-history-target="4000"]');
    await entry.locator(':scope > summary').click();
    await page.waitForFunction(() => document.querySelector('[data-learning-history-target="4000"]').querySelectorAll('table').length === 3);
    await page.evaluate(() => { window.firstHistoryTable = document.querySelector('[data-learning-history-target="4000"] table'); });
    await entry.locator(':scope > summary').click(); await entry.locator(':scope > summary').click();
    assert.equal(await page.evaluate(() => firstHistoryTable === document.querySelector('[data-learning-history-target="4000"] table')), true);
    await entry.locator('[data-learning-key="technical-4000"] > summary').click();
    await page.evaluate(async () => { await lottoLearningController.pause(false); });
    assert.equal(await entry.getAttribute('open'), '');
    await page.waitForFunction(() => document.querySelector('[data-learning-history-target="4000"]').querySelectorAll('table').length === 3);
    assert.equal(await entry.locator('[data-learning-key="technical-4000"]').getAttribute('open'), '');
    assert.equal(await panel(page).locator('[data-learning-history-target] table').count(), 3);
  });
  assert.deepEqual(failures, [], 'Final presentation findings');
  // Show just a few closed records in screenshots, with all summary disclosures above them.
  await page.evaluate(() => {
    document.querySelectorAll('[data-learning-history-target]').forEach(node => { node.open = false; node.hidden = !['4199', '4000'].includes(node.dataset.learningHistoryTarget); });
  });
  fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' document does not overflow');
    await panel(page).screenshot({ path: path.join(__dirname, `../test-results/learning-final-${name}.png`) });
  }
  const backup = await page.evaluate(() => LottoLearningReport.exportBackup(lottoLearningView.stored));
  await panel(page).getByLabel('פתח גיבוי לקריאה בלבד').setInputFiles(inputFile(backup));
  await panel(page).locator('[data-learning-import]').waitFor();
  assert.equal(await panel(page).locator('[data-learning-evidence-bound]').count(), 0, 'Readonly import never gains live evidence bounds');
  assert.doesNotMatch(await panel(page).innerText(), /עדות לתקופה/);
  await button(page, 'חזרה למעקב המקומי').click();
  await page.evaluate(() => {
    const state = lottoLearningView.stored;
    const replay = { mode: 'historical', sampleCount: 200, seed: LottoLearningCore.HISTORICAL_SEED,
      targets: state.observations.map((observation, index) => ({ target: observation.target, draw: observation.draw, arms: state.snapshots[index].arms })) };
    learningUI.render({ ...lottoLearningView, mode: 'historical', report: LottoLearningReport.summarizeHistoricalReplay(replay), pendingReplay: { digest: 'synthetic-history' } });
  });
  await panel(page).getByRole('tab', { name: 'סימולציה היסטורית' }).click();
  const historical = panel(page).locator('#learning-historical');
  assert.equal(await historical.locator('[data-learning-evidence-bound]').count(), 0);
  assert.doesNotMatch(await historical.innerText(), /עדות לתקופה/);
  await page.evaluate(() => {
    const empty = { compatibility: 'compatible', incompatibilityCodes: [], rawBackup: null, revision: 0,
      experiment: null, decisions: [], snapshots: [], observations: [], prizes: [], faults: [] };
    learningUI.render({ ...lottoLearningView, mode: 'live', stored: empty, report: LottoLearningReport.summarizeExperiment(empty) });
  });
  for (const arm of ['legacy', 'random']) assert.match(await panel(page).locator(`#learning-live [data-learning-paired="${arm}"]`).textContent(), /לא זמין/);
  assert.deepEqual(errors, []);
  console.log('PASS historical/import evidence suppression and unavailable paired differences');
  console.log('SCREENSHOTS synthetic: test-results/learning-final-desktop.png and learning-final-mobile.png');
}

async function main() {
  const h = await openLearningHarness();
  try {
    const page = h.page;
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let draws = buildLearningDraws(700);
    let prizeDocument = { schemaVersion: 1, draws: {} };
    const routes = await configureLearningPage(page, { workbook: () => toLearningMatrix(draws), prizes: () => prizeDocument });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(h.baseUrl + '/lotto_analyzer.html');
    await page.evaluate(() => lottoLearningReady);
    // Catches a missing/hidden panel and accidental implicit experiment creation.
    assert.equal(await panel(page).count(), 1, 'Learning panel exists outside hidden results');
    assert.equal(await panel(page).isVisible(), true);
    assert.equal(await button(page, startName).isDisabled(), true);
    assert.equal(await page.evaluate(() => lottoLearningController.readView().stored.experiment), null);
    assert.deepEqual(errors, []);
    console.log('PASS empty learning panel is visible, disabled and non-mutating');

    // A filename must never mint canonical provenance, and range selection must not change learning input.
    const bytes = routes.workbookBytes(toLearningMatrix(draws));
    await page.locator('#fileInput').setInputFiles({ name: 'NUMBERS.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes });
    await page.locator('#analyzeBtn').click();
    await page.waitForFunction(() => lottoLearningView.sourceState.status === 'ready');
    assert.equal(await button(page, startName).isDisabled(), true);
    assert.match(await panel(page).innerText(), /ידני/);
    await page.locator('#defaultDataBtn').click();
    await page.waitForFunction(() => lottoLearningView.sourceState.status === 'ready' && lottoLearningView.sourceState.kind === 'canonical');
    const digest = await panel(page).locator('[data-learning-digest]').textContent();
    await page.locator('#rowSelection').fill('1-20');
    await page.locator('#analyzeBtn').click();
    assert.equal(await panel(page).locator('[data-learning-digest]').textContent(), digest);
    assert.equal(await button(page, startName).isEnabled(), true);
    console.log('PASS manual NUMBERS.xlsx stays ineligible; canonical full-source digest survives selected ranges');

    // Uses actual controller, worker and raw SheetJS ingestion. Cancellation must leave no saved snapshot.
    await button(page, startName).click();
    await panel(page).locator('[role="status"]').filter({ hasText: /חישוב/ }).waitFor();
    await button(page, 'בטל חישוב').click();
    assert.equal(await page.evaluate(() => lottoLearningController.readView().stored.experiment), null);
    await button(page, startName).click();
    await panel(page).locator('[data-learning-saved="true"]').waitFor({ timeout: 180000 });
    assert.equal(await panel(page).locator('[data-learning-active-line]').count(), 14);
    const original = await panel(page).locator('[data-learning-snapshot-id]').first().getAttribute('data-learning-snapshot-id');
    const saved = await page.evaluate(() => lottoLearningController.readView().stored);
    assert.equal(await button(page, startName).isDisabled(), true);
    assert.match(await panel(page).innerText(), /שיטה קיימת \+ השלמה קבועה/);
    await page.reload();
    await panel(page).locator(`[data-learning-snapshot-id="${original}"]`).waitFor();
    assert.equal(await panel(page).locator('[data-learning-history-count]').textContent(), '0');
    assert.equal(await page.evaluate(() => lottoLearningView.sourceState.status), 'empty');
    const technical = panel(page).getByText('פרטים טכניים', { exact: true });
    assert.equal(await technical.count(), 1, 'Technical provenance is available without overwhelming the main summary');
    assert.equal(await technical.locator('..').getAttribute('open'), null);
    assert.match(await panel(page).innerText(), /Asia\/Jerusalem/);
    await technical.click();
    assert.match(await technical.locator('..').innerText(), /Seed:/);
    assert.equal(await technical.locator('..').locator('[dir="ltr"]').count() > 0, true);
    await technical.click();
    console.log('PASS real start/cancel/retry saves 14 rows and restores snapshot before workbook reload');
    fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
    for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' document has no horizontal overflow');
      await panel(page).screenshot({ path: path.join(__dirname, `../test-results/learning-${name}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    console.log('SCREENSHOTS ready: test-results/learning-desktop.png and learning-mobile.png');
    if (process.argv.includes('--presentation-only')) return;

    await button(page, 'השהה יצירת טפסים').click();
    await button(page, 'המשך ניסוי').waitFor();
    draws = buildLearningDraws(702);
    await page.locator('#defaultDataBtn').click();
    await page.waitForFunction(() => lottoLearningView.stored.observations.length === 2, null, { timeout: 180000 });
    assert.equal(await panel(page).locator('[data-learning-history-count]').textContent(), '2');
    assert.match(await panel(page).locator('[data-learning-prize-total="learner"]').innerText(), /₪0.*2/);
    await panel(page).locator('[data-learning-history-target="3700"] > summary').click();
    assert.match(await panel(page).locator('[data-learning-history-target="3700"]').innerText(), /לא זמין/);
    assert.match(await panel(page).locator('[data-learning-history-target="3701"]').innerText(), /חסר/);
    const snapshotBefore = await page.evaluate(() => JSON.stringify(lottoLearningView.stored.snapshots));
    const date = draws[700].date.split('-').reverse().join('/');
    prizeDocument = { schemaVersion: 1, updatedAt: '2026-09-22T12:00:00Z', draws: { '3700': {
      drawNumber: 3700, drawDate: date, sourceUrl: 'https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=3700',
      regular: Object.fromEntries(['3', '3+strong', '4', '4+strong', '5', '5+strong', '6', '6+strong'].map(tier => [tier, { winnerCount: 1, prizeIls: 25 }]))
    } } };
    await button(page, 'רענן נתוני זכייה').click();
    await page.waitForFunction(() => lottoLearningView.report.prizes.learner.knownCount === 1);
    assert.match(await panel(page).locator('[data-learning-prize-total="learner"]').innerText(), /חסרים: 1/);
    assert.equal(await page.evaluate(() => JSON.stringify(lottoLearningView.stored.snapshots)), snapshotBefore);
    console.log('PASS late prizes update partial totals without rewriting rows; missing targets remain explicit');
    await button(page, 'המשך ניסוי').click();
    await page.waitForFunction(() => lottoLearningView.stored.snapshots.at(-1).target === 3702, null, { timeout: 180000 });
    assert.equal(await panel(page).locator('[data-learning-active-line]').count(), 14);
    await button(page, 'השהה יצירת טפסים').click();
    await button(page, 'המשך ניסוי').waitFor();
    const downloadReady = page.waitForEvent('download');
    await button(page, 'ייצא גיבוי').click();
    const download = await downloadReady;
    const downloaded = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(downloaded.state.experiment.id, saved.experiment.id);
    assert.equal(downloaded.state.snapshots.length, 2);
    console.log('PASS resume prepares current target and backup download retains both immutable snapshots');

    // Imported labels must stay inert and readonly; exiting must restore the exact local experiment.
    const backup = await page.evaluate(() => LottoLearningReport.exportBackup(lottoLearningView.stored));
    const malicious = JSON.parse(backup);
    malicious.state.snapshots[0].arms.learner[0].strategy = '<img src=x onerror="window.learningInjected=true">';
    await panel(page).getByLabel('פתח גיבוי לקריאה בלבד').setInputFiles(inputFile(JSON.stringify(malicious)));
    await panel(page).locator('[data-learning-import="true"]').waitFor();
    assert.equal(await panel(page).locator('img').count(), 0);
    assert.equal(await page.evaluate(() => window.learningInjected), undefined);
    assert.equal(await button(page, startName).isDisabled(), true);
    assert.equal(await button(page, 'המשך ניסוי').isDisabled(), true);
    assert.match(await panel(page).innerText(), /לא מאומת/);
    await button(page, 'חזרה למעקב המקומי').click();
    assert.equal(await page.evaluate(() => LottoLearningReport.exportBackup(lottoLearningView.stored).includes('learningInjected')), false);
    assert.equal(await page.evaluate(() => lottoLearningView.stored.experiment.id), saved.experiment.id);
    await panel(page).getByLabel('פתח גיבוי לקריאה בלבד').setInputFiles(inputFile('{"schemaVersion":99}'));
    await panel(page).locator('[role="status"]').filter({ hasText: /UNSUPPORTED_BACKUP/ }).waitFor();
    console.log('PASS readonly imports isolate active storage and safely render HTML labels');

    // Tabs retain keyboard semantics; replay does not erase local history or steal focus during progress.
    draws = buildLearningDraws(900);
    await page.locator('#fileInput').setInputFiles({ name: 'simulation.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: routes.workbookBytes(toLearningMatrix(draws)) });
    await page.locator('#analyzeBtn').click();
    await page.waitForFunction(() => lottoLearningView.sourceState.rowCount === 900 && !lottoLearningView.progress, null, { timeout: 180000 });
    const liveTab = panel(page).getByRole('tab', { name: 'מעקב מקומי' });
    await liveTab.focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(await panel(page).getByRole('tab', { name: 'סימולציה היסטורית' }).getAttribute('aria-selected'), 'true');
    await button(page, 'בדיקה היסטורית').click();
    await panel(page).locator('[role="status"]').filter({ hasText: /חישוב/ }).waitFor();
    await liveTab.click();
    const history = panel(page).locator('[data-learning-history-target="3700"]');
    if (await history.getAttribute('open') === null) await history.locator(':scope > summary').click();
    await history.locator(':scope > summary').focus();
    await page.waitForFunction(() => lottoLearningView.progress?.completed > 0, null, { timeout: 30000 });
    assert.equal(await history.getAttribute('open'), '');
    assert.equal(await history.locator(':scope > summary').evaluate(node => node === document.activeElement), true);
    await button(page, 'בטל חישוב').click();
    assert.equal(await history.getAttribute('open'), '');
    await panel(page).getByRole('tab', { name: 'סימולציה היסטורית' }).click();
    await button(page, 'בדיקה היסטורית').click();
    await page.waitForFunction(() => lottoLearningView.mode === 'historical', null, { timeout: 240000 });
    assert.match(await panel(page).getByRole('tabpanel', { name: 'סימולציה היסטורית' }).innerText(), /200/);
    assert.match(await panel(page).getByRole('tabpanel', { name: 'סימולציה היסטורית' }).innerText(), /תיאורי/);
    await liveTab.click();
    console.log('PASS accessible tabs, genuine replay/cancel/retry and stable open history/focus during progress');

    for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollToSection('learningExperimentCard'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' document has no horizontal overflow');
    }
    assert.deepEqual(errors, []);
    await verifyUnavailable(h);
    await verifyImportIsolation(h);
    await verifyShell(h);
    await verifyResumeOwnership(h);
    console.log('Learning UI verification passed');
  } finally { await h.close(); }
}

async function verifyUnavailable(h) {
  for (const failure of ['short', 'worker', 'storage', 'readonly', 'readonly-map', 'readonly-array']) {
    const context = await h.browser.newContext(); const page = await context.newPage();
    try {
      await configureLearningPage(page, { workbook: () => toLearningMatrix(buildLearningDraws(699)) });
      if (failure === 'worker') await page.addInitScript(() => { window.Worker = undefined; });
      if (failure === 'storage') await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: null }); });
      if (failure.startsWith('readonly')) {
        await page.goto(h.baseUrl + '/tests/fixtures/learning-harness.html');
        await page.evaluate(kind => new Promise((resolve, reject) => {
          const request = indexedDB.open('lottoLearningExperimentV1', 99);
          request.onupgradeneeded = () => request.result.createObjectStore('unknown').put(kind === 'readonly-map'
            ? new Map([['opaque', 7]]) : kind === 'readonly-array' ? Object.assign(new Array(1), { note: 7 }) : 1n, 'opaque');
          request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
        }), failure);
      }
      await page.goto(h.baseUrl + '/lotto_analyzer.html');
      await page.evaluate(() => lottoLearningReady);
      assert.equal(await panel(page).isVisible(), true);
      assert.equal(await button(page, startName).isDisabled(), true);
      await page.locator('#defaultDataBtn').click();
      await page.waitForFunction(() => loadedExcelRows?.length === 699);
      assert.equal(await button(page, startName).isDisabled(), true);
      if (failure.startsWith('readonly')) {
        await button(page, 'ייצא גיבוי').click();
        await panel(page).locator('[role="status"]').filter({ hasText: /EXPORT_UNSUPPORTED/ }).waitFor();
      }
      console.log('PASS ' + failure + ' prohibition isolates learning failure from legacy workbook loading');
    } finally { await context.close(); }
  }
}

async function verifyShell(h) {
  const context = await h.browser.newContext(); const page = await context.newPage();
  try {
    await configureLearningPage(page);
    let release; const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/lotto_analyzer.html', async route => { await gate; await route.continue(); });
    await page.goto(h.baseUrl + '/Lotto_All_In_One.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#navAnalyzerBtn').click();
    await page.locator('[data-target="learningExperimentCard"]').click();
    await page.locator('#navBacktestBtn').click();
    release();
    const frame = page.frameLocator('#analyzerIframe');
    await frame.locator('#backtestWorkspace').waitFor();
    assert.equal(await frame.locator('#learningExperimentCard').isVisible(), false);
    await page.locator('[data-target="learningExperimentCard"]').click();
    await frame.locator('#learningExperimentCard').waitFor();
    assert.equal(await frame.locator('#backtestWorkspace').isVisible(), false);
    await page.waitForFunction(() => document.querySelector('#analyzerIframe').contentDocument.activeElement?.id === 'learningExperimentCard');
    await page.locator('[data-target="pinnedFutureCard"]').click();
    await page.locator('#navFormBtn').click();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#formSection').isVisible(), true);
    assert.equal(await page.locator('#analyzerSection').isVisible(), false);
    // Early requested learning focus must replay after a fresh iframe load.
    let releaseAgain; const again = new Promise(resolve => { releaseAgain = resolve; });
    await page.unroute('**/lotto_analyzer.html');
    await page.route('**/lotto_analyzer.html?reload=1', async route => { await again; await route.continue(); });
    await page.evaluate(() => { document.querySelector('#analyzerIframe').src = 'lotto_analyzer.html?reload=1'; });
    await page.waitForTimeout(30);
    await page.evaluate(() => goToAnalyzerSection('learningExperimentCard'));
    await page.waitForTimeout(250); // Exercise the delayed focus callback while the old document is still present.
    releaseAgain();
    await page.waitForFunction(() => document.querySelector('#analyzerIframe').contentDocument.URL.includes('reload=1'));
    await page.waitForFunction(() => document.querySelector('#analyzerIframe').contentDocument.activeElement?.id === 'learningExperimentCard');
    console.log('PASS pending iframe focus replays; latest Backtest/learning/PIN/form navigation wins');
  } finally { await context.close(); }
}
async function verifyImportIsolation(h) {
  const context = await h.browser.newContext(); const page = await context.newPage();
  try {
    await configureLearningPage(page, { workbook: () => toLearningMatrix(buildLearningDraws(700)) });
    await page.goto(h.baseUrl + '/lotto_analyzer.html');
    await page.waitForFunction(() => lottoLearningView?.stored);
    const backup = await page.evaluate(() => LottoLearningReport.exportBackup(lottoLearningView.stored));
    await panel(page).getByLabel('פתח גיבוי לקריאה בלבד').setInputFiles(inputFile(backup));
    await panel(page).locator('[data-learning-import="true"]').waitFor();
    assert.equal(await panel(page).getByRole('tab', { name: 'סימולציה היסטורית' }).isDisabled(), true, 'Readonly import cannot reveal an unrelated local replay');
    await panel(page).getByRole('tab', { name: 'מעקב מקומי' }).focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(await panel(page).getByRole('tab', { name: 'מעקב מקומי' }).getAttribute('aria-selected'), 'true');
    await button(page, 'חזרה למעקב המקומי').click();
    assert.equal(await panel(page).getByRole('tab', { name: 'סימולציה היסטורית' }).isEnabled(), true);
    console.log('PASS readonly import isolates both keyboard and pointer replay navigation');
    await page.locator('#defaultDataBtn').click();
    await page.waitForFunction(() => lottoLearningView.sourceState.status === 'ready');
    assert.match(await panel(page).innerText(), /קובץ התוצאות הראשי של האתר/);
    for (const label of ['3+', '4+', '5+']) {
      const metric = panel(page).locator('bdi[dir="ltr"]').filter({ hasText: new RegExp('^' + label.replace('+', '\\+') + ':') });
      assert.equal(await metric.count(), 3, 'Each arm isolates the ' + label + ' metric for RTL reading');
    }
    console.log('PASS source labels and metric directions remain readable in Hebrew');
  } finally { await context.close(); }
}
async function verifyResumeOwnership(h, invalidationsOnly = false) {
  // One real generated transition reused across fresh IndexedDB origins/contexts.
  await h.page.goto(h.baseUrl + '/tests/fixtures/learning-harness.html');
  const transition = await h.page.evaluate(() => makeStartTransition());
  const failures = [];
  for (const scenario of ['cancel-before-save', 'controller-cancel-before-save', 'cancel-after-save', 'source-after-save', 'unmount-after-save', ...(!invalidationsOnly ? ['normal'] : [])]) {
    const context = await h.browser.newContext(); const page = await context.newPage();
    try {
      await page.goto(h.baseUrl + '/tests/fixtures/learning-harness.html');
      await page.addScriptTag({ url: h.baseUrl + '/lotto-learning-ui.js' });
      await page.evaluate(async ({ initial, scenario }) => {
        const store = await LottoLearningStore.open();
        await store.commit(0, initial); await store.setPaused(1, true);
        window.resumeStore = store;
        window.resumeEntered = false; window.synchronizationCalls = 0;
        const gate = new Promise(resolve => { window.releaseResume = resolve; });
        const beforeSave = scenario.endsWith('before-save');
        const controlledStore = { ...store, setPaused: async (...args) => {
          if (beforeSave && !args[1]) { window.resumeEntered = true; await gate; }
          return store.setPaused(...args);
        } };
        const controller = LottoLearningController.create({ store: controlledStore, workerFactory: () => new Worker('/lotto-learning-worker.js'), now: () => '2025-10-10T12:00:00Z',
          onState: view => window.resumeUI?.render(view) });
        window.resumeController = controller;
        const actualPause = controller.pause;
        controller.pause = paused => {
          const response = (async () => {
            await actualPause(paused);
            // A delayed response after the real write also exposes an active view;
            // checking status alone cannot establish that the UI still owns it.
            if (!beforeSave && scenario !== 'normal' && !paused) { window.resumeEntered = true; await gate; }
          })();
          window.resumeResponse = response; return response;
        };
        const actualSynchronize = controller.synchronize;
        controller.synchronize = (...args) => {
          window.synchronizationCalls++;
          window.resumeSynchronization = actualSynchronize(...args); return window.resumeSynchronization;
        };
      }, { initial: transition, scenario });
      await page.waitForFunction(() => resumeController.readView().stored);
      await page.evaluate(async () => {
        const root = document.createElement('section'); root.id = 'learningExperimentCard'; document.body.append(root);
        window.resumeUI = LottoLearningUI.mount(root, resumeController);
        const generation = resumeController.beginSource('canonical');
        await resumeController.acceptSource(LottoLearningFixture.toLearningMatrix(LottoLearningFixture.buildLearningDraws(701)), {
          kind: 'canonical', generation, url: 'NUMBERS.xlsx', fetchedAt: '2025-10-10T12:00:00Z' });
      });
      assert.equal(await page.evaluate(() => resumeController.readView().sourceState.status), 'ready');
      assert.equal(await page.evaluate(() => resumeController.readView().error), null);
      await button(page, 'המשך ניסוי').click();
      if (scenario !== 'normal') {
        await page.waitForFunction(() => resumeEntered);
        if (scenario.startsWith('cancel-')) await button(page, 'בטל חישוב').click();
        else if (scenario === 'controller-cancel-before-save') await page.evaluate(() => resumeController.cancel());
        else if (scenario === 'unmount-after-save') await page.evaluate(() => resumeUI.unmount());
        else await page.evaluate(async () => {
          const generation = resumeController.beginSource('canonical');
          await resumeController.acceptSource(LottoLearningFixture.toLearningMatrix(LottoLearningFixture.buildLearningDraws(701)), {
            kind: 'canonical', generation, url: 'NUMBERS.xlsx', fetchedAt: '2025-10-11T12:00:00Z' });
        });
        const beforeRelease = await page.evaluate(() => resumeStore.read());
        const result = await page.evaluate(async () => {
          releaseResume(); await resumeResponse;
          // Flush the UI await continuation, then await any real work it incorrectly launched.
          await new Promise(resolve => setTimeout(resolve, 0));
          if (window.resumeSynchronization) await resumeSynchronization;
          return { calls: synchronizationCalls, state: await resumeStore.read() };
        });
        assert.equal(result.calls, 0, scenario + ' must not start follow-up synchronization');
        assert.deepEqual(result.state, beforeRelease, scenario + ' must not write after its continuation was invalidated');
      } else {
        await page.waitForFunction(() => resumeController.readView().stored.snapshots.at(-1).target === 3701, null, { timeout: 180000 });
        assert.equal(await page.evaluate(() => resumeController.readView().stored.experiment.status), 'active');
        assert.equal(await page.evaluate(() => synchronizationCalls), 1);
        assert.equal(await panel(page).locator('[data-learning-active-line]').count(), 14);
      }
      console.log('PASS resume continuation ownership: ' + scenario);
    } catch (error) { failures.push(scenario); console.error('FAIL resume continuation ownership: ' + scenario + ': ' + error.message); }
    finally { await context.close(); }
  }
  assert.deepEqual(failures, [], 'Resume continuation ownership cases');
}
(process.argv.includes('--final-presentation-only') || process.argv.includes('--unavailable-only') || process.argv.includes('--shell-only') || process.argv.includes('--import-only') || process.argv.includes('--resume-only') || process.argv.includes('--resume-invalidations-only') ? (async () => {
  const h = await openLearningHarness();
  try { await (process.argv.includes('--final-presentation-only') ? verifyFinalPresentation(h) : process.argv.includes('--resume-only') || process.argv.includes('--resume-invalidations-only')
    ? verifyResumeOwnership(h, process.argv.includes('--resume-invalidations-only'))
    : process.argv.includes('--shell-only') ? verifyShell(h) : process.argv.includes('--import-only') ? verifyImportIsolation(h) : verifyUnavailable(h)); }
  finally { await h.close(); }
})() : main()).catch(error => { console.error(error); process.exitCode = 1; });
