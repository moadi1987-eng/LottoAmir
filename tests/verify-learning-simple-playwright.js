'use strict';
const assert = require('assert/strict');
const { openLearningHarness, configureLearningPage, openLearningAdvanced } = require('./helpers/learning-browser');
const { buildLearningDraws, toLearningMatrix } = require('./fixtures/learning-fixture');

async function verifyRestart(h) {
  const result = await h.page.evaluate(async () => {
    const original = await makeStartTransition();
    const store = await LottoLearningStore.open();
    try {
      const before = await store.commit(0, original);
      localStorage.setItem('lottoPinnedFormsV2', ' {"keep":"PIN bytes"} ');
      const fresh = structuredClone(original);
      fresh.experiment.id = 'fresh-experiment';
      fresh.snapshots.forEach(s => { s.experimentId = fresh.experiment.id; });
      const after = await store.restart(before.revision, fresh, { archivedAt: '2026-11-06T12:00:00Z' });
      const archives = await store.readArchives();
      const older = structuredClone(original);
      older.experiment.id = 'older-experiment'; older.snapshots[0].experimentId = older.experiment.id;
      older.experiment.originAnchor--; older.experiment.lastProcessedDraw--; older.experiment.sourceCutoff--;
      older.decisions[0].cutoff--; older.snapshots[0].anchor--; older.snapshots[0].target--;
      let rollback;
      try { await store.restart(after.revision, older, { archivedAt: '2026-11-06T12:00:00Z' }); }
      catch (error) { rollback = error.code; }
      let stale;
      try { await store.restart(before.revision, original, { archivedAt: '2026-11-06T12:00:00Z' }); }
      catch (error) { stale = error.code; }
      const aborter = new AbortController(); aborter.abort();
      let aborted;
      try { await store.restart(after.revision, original, { signal: aborter.signal, archivedAt: '2026-11-06T12:00:00Z' }); }
      catch (error) { aborted = error.code; }
      return { id: after.experiment.id, revision: after.revision, count: after.snapshots.length,
        sameTarget: after.snapshots[0].target === before.snapshots[0].target,
        archiveExact: JSON.stringify(archives[0].state) === JSON.stringify(before), archiveCount: archives.length,
        stillSame: JSON.stringify(await store.read()) === JSON.stringify(after),
        stillArchives: (await store.readArchives()).length, stale, aborted, rollback,
        pin: localStorage.getItem('lottoPinnedFormsV2') };
    } finally { store.close(); }
  });
  assert.deepEqual(result, { id: 'fresh-experiment', revision: 2, count: 1, sameTarget: true,
    archiveExact: true, archiveCount: 1, stillSame: true, stillArchives: 1,
    stale: 'REVISION_CONFLICT', aborted: 'STORAGE_ABORTED', rollback: 'SOURCE_ROLLBACK', pin: ' {"keep":"PIN bytes"} ' });
  console.log('PASS atomic same-target restart preserves exact prior state/PINs and rejects stale/aborted writes');
}

async function verifyControllerRestart(h) {
  const result = await h.page.evaluate(async () => {
    const store = await LottoLearningStore.open();
    const restartStore = store.restart.bind(store);
    let restartFailure;
    store.restart = async (...args) => { try { return await restartStore(...args); } catch (error) { restartFailure = error.stack; throw error; } };
    const controller = LottoLearningController.create({ store, makeSeed: () => 'ffeeddccbbaa99887766554433221100',
      workerFactory: () => new Worker('/lotto-learning-worker.js') });
    try {
      await controller.restart();
      const guard = controller.readView().error.code;
      const generation = controller.beginSource('canonical');
      await controller.acceptSource(LottoLearningFixture.toLearningMatrix(LottoLearningFixture.buildLearningDraws(700)),
        { kind: 'canonical', generation, url: 'NUMBERS.xlsx', fetchedAt: '2026-11-06T12:00:00Z' });
      if (controller.readView().error) throw new Error(JSON.stringify(controller.readView().error));
      await controller.restart();
      const view = controller.readView();
      if (view.error) throw new Error(restartFailure || JSON.stringify(view.error));
      const archives = await controller.readArchives();
      return { guard, error: view.error, id: view.stored.experiment.id, count: view.stored.snapshots.length,
        archives: archives.length, oldId: archives.at(-1).state.experiment.id };
    } finally { controller.close(); }
  });
  assert.deepEqual(result, { guard: 'CANONICAL_SOURCE_REQUIRED', error: null,
    id: 'learning-ffeeddccbbaa99887766554433221100', count: 1, archives: 2, oldId: 'fresh-experiment' });
  console.log('PASS controller fresh start requires canonical source and archives the prior experiment');
}

async function verifySimplePresentation(h) {
  const page = h.page;
  await page.addScriptTag({ url: h.baseUrl + '/lotto-learning-ui.js' });
  await page.addStyleTag({ url: h.baseUrl + '/lotto-learning.css' });
  await page.evaluate(async () => {
    const store = await LottoLearningStore.open();
    const state = await store.read(); store.close();
    const root = document.createElement('section'); root.id = 'learningExperimentCard'; root.dir = 'rtl'; document.body.append(root);
    window.simpleView = { stored: state, mode: 'live', sourceState: { status: 'ready', kind: 'canonical', rowCount: 700, latestDraw: 3699 },
      report: LottoLearningReport.summarizeExperiment(state) };
    window.simpleUI = LottoLearningUI.mount(root, null); simpleUI.render(simpleView);
  });
  const panel = page.locator('#learningExperimentCard');
  assert.equal(await panel.locator('[data-learning-active-line]:visible').count(), 14, 'One readable current learner form');
  assert.equal(await panel.locator('[data-learning-active-line] .learning-numbers .learning-number').count(), 84, 'Each number is distinct and readable');
  assert.match(await panel.locator('[data-learning-active-line]').first().textContent(), /ממתין לתוצאה/);
  assert.equal(await panel.locator('table:visible').count(), 1, 'Benchmarks stay out of the main form');
  assert.equal(await panel.getByRole('button', { name: 'ייצא גיבוי', exact: true }).isVisible(), false);
  const technical = await panel.locator('[data-learning-key="comparisons-3700"]').textContent();
  assert.match(technical, /3720/, 'Advanced policy review target remains available');
  assert.match(technical, /בחירת מדיניות/, 'Saved policy decision remains inspectable under advanced details');
  await page.evaluate(() => {
    const state = structuredClone(simpleView.stored); const snapshot = state.snapshots[0];
    const draw = LottoLearningFixture.buildLearningDraws(701).at(-1);
    state.experiment.lastProcessedDraw = draw.drawNumber;
    state.observations = [{ experimentId: state.experiment.id, target: draw.drawNumber, draw, kind: 'same-day-or-late',
      scores: Object.fromEntries(['learner', 'legacy', 'random'].map(arm => [arm, LottoLearningCore.scoreArm(snapshot.arms[arm], draw)])) }];
    state.revision++;
    simpleView.stored = state; simpleView.report = LottoLearningReport.summarizeExperiment(state); simpleUI.render(simpleView);
  });
  assert.match(await panel.locator('[data-learning-latest-result]').textContent(), /ממתין לנתוני פרסים/);
  assert.match(await panel.locator('[data-learning-latest-result]').textContent(), /מאוחר|באותו יום/);
  await page.evaluate(async () => {
    const state = simpleView.stored;
    const zero = { status: 'available', totalPrizeIls: 0, winningCombinationCount: 0, sourceUrl: null,
      lines: Array.from({ length: 14 }, () => ({ status: 'no-prize', tierKey: '0', prizeIls: null })) };
    state.prizes = [{ experimentId: state.experiment.id, target: state.observations[0].target,
      checkedAt: '2026-11-06T12:00:00Z', drawDigest: await LottoLearningCore.hashHistory([state.observations[0].draw]),
      arms: { learner: zero, legacy: zero, random: zero } }];
    state.revision++; simpleView.report = LottoLearningReport.summarizeExperiment(state); simpleUI.render(simpleView);
  });
  assert.match(await panel.locator('[data-learning-latest-result] [data-learning-result-total]').textContent(), /₪0/);
  assert.equal(await panel.locator('[data-learning-latest-result] > section tbody tr').count(), 14);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log('PASS simple form distinguishes pending results, missing prizes and known zero; benchmarks collapsed; mobile fits');
}

async function verifyUserCycle(h) {
  const context = await h.browser.newContext(); const page = await context.newPage();
  try {
    let draws = buildLearningDraws(700); let prizes = { schemaVersion: 1, draws: {} };
    await configureLearningPage(page, { workbook: () => toLearningMatrix(draws), prizes: () => prizes });
    await page.goto(h.baseUrl + '/lotto_analyzer.html');
    await page.waitForFunction(() => window.lottoLearningView?.stored);
    const panel = page.locator('#learningExperimentCard');
    const update = panel.locator('[data-learning-update]');
    await update.click();
    await page.waitForFunction(() => lottoLearningView.stored.snapshots.length === 1 && !document.querySelector('[data-learning-update]').disabled, null, { timeout: 180000 });
    const first = await page.evaluate(() => lottoLearningView.stored);
    await update.click();
    await page.waitForFunction(() => !document.querySelector('[data-learning-update]').disabled);
    assert.deepEqual(await page.evaluate(() => lottoLearningView.stored.snapshots), first.snapshots);
    draws = buildLearningDraws(701); const draw = draws.at(-1);
    prizes.draws[draw.drawNumber] = { drawNumber: draw.drawNumber, drawDate: draw.date.split('-').reverse().join('/'),
      sourceUrl: 'https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=' + draw.drawNumber,
      regular: Object.fromEntries(['3', '3+strong', '4', '4+strong', '5', '5+strong', '6', '6+strong'].map(tier => [tier, { winnerCount: 1, prizeIls: 10 }])) };
    await update.click();
    await page.waitForFunction(() => lottoLearningView.stored.snapshots.at(-1).target === 3701 && !document.querySelector('[data-learning-update]').disabled, null, { timeout: 180000 });
    const settled = await page.evaluate(() => lottoLearningView.stored);
    assert.deepEqual(settled.snapshots[0], first.snapshots[0]);
    assert.equal(settled.observations.length, 1);
    const expectedMoney = first.snapshots[0].arms.learner.filter(line => line.numbers.filter(n => draw.numbers.includes(n)).length >= 3).length * 10;
    assert.equal(settled.prizes[0].arms.learner.totalPrizeIls, expectedMoney);
    assert.match(await panel.locator('[data-learning-result-total]').textContent(), new RegExp('₪' + expectedMoney));
    assert.equal(await panel.locator('[data-learning-active-line]:visible').count(), 14);
    assert.equal(await panel.locator('[data-learning-advanced]').getAttribute('open'), null);
    draws = buildLearningDraws(700);
    page.once('dialog', dialog => dialog.accept()); await panel.locator('[data-learning-restart]').click();
    await page.waitForFunction(() => !document.querySelector('[data-learning-restart]').disabled, null, { timeout: 180000 });
    assert.equal(await page.evaluate(() => lottoLearningView.error?.code), 'SOURCE_ROLLBACK');
    assert.equal(await page.evaluate(() => lottoLearningView.stored.experiment.id), first.experiment.id);
    await page.evaluate(() => lottoLearningController.restart());
    assert.equal(await page.evaluate(() => lottoLearningView.error?.code), 'SOURCE_ROLLBACK', 'Direct controller cannot bypass rejected old source');
    assert.equal((await page.evaluate(() => lottoLearningController.readArchives())).length, 0);
    draws = buildLearningDraws(701);
    page.once('dialog', dialog => dialog.dismiss()); await panel.locator('[data-learning-restart]').click();
    assert.equal(await page.evaluate(() => lottoLearningView.stored.experiment.id), first.experiment.id);
    page.once('dialog', dialog => dialog.accept()); await panel.locator('[data-learning-restart]').click();
    await page.waitForFunction(oldId => lottoLearningView.stored.experiment.id !== oldId && !document.querySelector('[data-learning-restart]').disabled, first.experiment.id, { timeout: 180000 });
    const fresh = await page.evaluate(() => lottoLearningView.stored);
    assert.equal(fresh.snapshots[0].target, 3701);
    assert.equal(fresh.observations.length, 0);
    const archives = await page.evaluate(() => lottoLearningController.readArchives());
    assert.equal(archives.length, 1); assert.deepEqual(archives[0].state.snapshots, settled.snapshots);
    await openLearningAdvanced(page);
    await panel.getByRole('button', { name: 'מעקבים קודמים', exact: true }).click();
    await panel.locator('[data-learning-archives] button').click();
    assert.equal(await update.isDisabled(), true);
    assert.match(await panel.locator('[data-learning-import]').textContent(), /ארכיון/);
    await panel.getByRole('button', { name: 'חזרה למעקב המקומי', exact: true }).click();
    assert.equal(await page.evaluate(() => lottoLearningView.stored.experiment.id), fresh.experiment.id);
    await page.reload();
    await page.waitForFunction(() => window.lottoLearningView?.stored?.experiment);
    await panel.locator('[data-learning-update]').click();
    await page.waitForFunction(() => !document.querySelector('[data-learning-update]').disabled);
    assert.deepEqual(await page.evaluate(() => lottoLearningView.stored.snapshots), fresh.snapshots);
    const fs = require('fs'); const path = require('path'); fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
    for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await panel.screenshot({ path: path.join(__dirname, `../test-results/learning-simple-${name}.png`) });
    }
    console.log('PASS real primary-button cycle, known payouts, immutable prior form, restart confirmation/archive and reload idempotency');
  } finally { await context.close(); }
}

async function verifyRestartRace(h) {
  const context = await h.browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(h.baseUrl + '/tests/fixtures/learning-harness.html');
    await page.evaluate(async () => {
      window.raceStore = await LottoLearningStore.open();
      window.raceInitial = await makeStartTransition();
      await raceStore.commit(0, raceInitial);
      const gate = new Promise(resolve => { window.releaseRestart = resolve; });
      window.restartEntered = false;
      const boundary = { ...raceStore, restart: async (...args) => { window.restartEntered = true; await gate; return raceStore.restart(...args); } };
      window.raceController = LottoLearningController.create({ store: boundary, workerFactory: () => new Worker('/lotto-learning-worker.js') });
      const generation = raceController.beginSource('canonical');
      await raceController.acceptSource(LottoLearningFixture.toLearningMatrix(LottoLearningFixture.buildLearningDraws(700)),
        { kind: 'canonical', generation, url: 'NUMBERS.xlsx', fetchedAt: '2026-11-06T12:00:00Z' });
      window.restartPending = raceController.restart();
    });
    await page.waitForFunction(() => restartEntered, null, { timeout: 180000 });
    const result = await page.evaluate(async () => {
      const otherTab = await LottoLearningStore.open();
      try {
        const current = await otherTab.read();
        const rows = LottoLearningFixture.buildLearningDraws(701); const draw = rows.at(-1);
        const newer = { experiment: { ...current.experiment, lastProcessedDraw: draw.drawNumber,
          sourceCutoff: draw.drawNumber, sourceDigest: await LottoLearningCore.hashHistory(rows) },
          decisions: [], snapshots: [], prizes: [], faults: [], observations: [{ experimentId: current.experiment.id,
            target: draw.drawNumber, draw, kind: 'same-day-or-late',
            scores: Object.fromEntries(['learner', 'legacy', 'random'].map(arm => [arm, LottoLearningCore.scoreArm(current.snapshots[0].arms[arm], draw)])) }] };
        await otherTab.commit(current.revision, newer);
        releaseRestart(); await restartPending;
        const saved = await otherTab.read();
        return { code: raceController.readView().error?.code, latest: saved.experiment.lastProcessedDraw,
          id: saved.experiment.id, archives: (await otherTab.readArchives()).length, snapshots: saved.snapshots.length };
      } finally { otherTab.close(); raceController.close(); }
    });
    assert.deepEqual(result, { code: 'SOURCE_ROLLBACK', latest: 3700, id: 'fixture-experiment', archives: 0, snapshots: 1 });
    console.log('PASS settlement winning the restart race cannot be replaced by a retrospective form');
  } finally { await context.close(); }
}

(async () => {
  const h = await openLearningHarness();
  try {
    if (process.argv.includes('--cycle-only')) { await verifyUserCycle(h); return; }
    await verifyRestart(h);
    if (!process.argv.includes('--store-only')) { await verifyControllerRestart(h); await verifySimplePresentation(h); await verifyUserCycle(h); await verifyRestartRace(h); }
  }
  finally { await h.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
