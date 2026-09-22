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
(process.argv.includes('--unavailable-only') || process.argv.includes('--shell-only') || process.argv.includes('--import-only') ? (async () => {
  const h = await openLearningHarness();
  try { await (process.argv.includes('--shell-only') ? verifyShell(h) : process.argv.includes('--import-only') ? verifyImportIsolation(h) : verifyUnavailable(h)); }
  finally { await h.close(); }
})() : main()).catch(error => { console.error(error); process.exitCode = 1; });
