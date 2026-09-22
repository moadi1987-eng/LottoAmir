'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { buildLearningDraws, toLearningMatrix } = require('./fixtures/learning-fixture');
const { openLearningHarness } = require('./helpers/learning-browser');
async function verifyAnalyzer(h) {
  const context = await h.browser.newContext();
  const page = await context.newPage();
  try {
    const sheetjs = process.env.LOTTO_LEARNING_SHEETJS_PATH || 'C:/Users/amirmoa/AppData/Local/Temp/lotto-learning-tests-ec0460aa-e82d-43dc-861a-0a3bf5b96ef0/xlsx-0.20.3.min.js';
    const XLSX = require(sheetjs);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(toLearningMatrix(buildLearningDraws(700))), 'draws');
    const bytes = Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
    await page.route(/cdn\.sheetjs\.com/, route => route.fulfill({ path: sheetjs, contentType: 'text/javascript' }));
    await page.route(/fonts\.googleapis\.com/, route => route.abort());
    await page.route('**/lotto-learning-store.js', route => route.fulfill({ contentType: 'text/javascript',
      body: fs.readFileSync(path.join(__dirname, '../lotto-learning-store.js'), 'utf8') +
        '\n{ const actualOpen = LottoLearningStore.open; const gate = new Promise(resolve => window.releaseLearningOpen = resolve); LottoLearningStore.open = async (...args) => { const store = await actualOpen(...args); await gate; return store; }; }' }));
    let releaseFetch;
    let holdFetch = false;
    let failFetch = false;
    await page.route('**/NUMBERS.xlsx', async route => {
      if (holdFetch) await new Promise(resolve => { releaseFetch = resolve; });
      await route.fulfill(failFetch ? { status: 503, body: 'offline' } : { body: bytes });
    });
    await page.goto(h.baseUrl + '/lotto_analyzer.html');
    assert.equal(await page.evaluate(() => typeof window.lottoLearningReady?.then), 'function', 'Analyzer starts learning initialization independently of Analyze');
    await page.evaluate(() => { window.defaultDone = false; loadDefaultNumbersFile().finally(() => { window.defaultDone = true; }); });
    await page.waitForFunction(() => window.defaultDone);
    assert.equal(await page.evaluate(() => loadedExcelRows.length), 700);
    await page.locator('#fileInput').setInputFiles({ name: 'NUMBERS.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes });
    await page.evaluate(async () => { releaseLearningOpen(); await lottoLearningReady; });
    assert.equal(await page.evaluate(() => lottoLearningController.readView().sourceState.kind), 'manual');
    assert.equal(await page.evaluate(() => lottoLearningController.readView().sourceState.status), 'loading');
    await page.evaluate(() => lottoLearningController.start());
    assert.equal(await page.evaluate(() => lottoLearningController.readView().stored.experiment), null);
    console.log('PASS pre-init canonical success followed by manual selection cannot become live');
    await page.evaluate(() => runAnalysisWithFile(document.querySelector('#fileInput').files[0], selectedFileSource));
    await page.waitForFunction(() => lottoLearningController.readView().sourceState.status === 'ready');
    const manualSource = await page.evaluate(() => lottoLearningController.readView().sourceState);
    await page.evaluate(() => { setRowSelection('1-20'); return runAnalysisWithFile(document.querySelector('#fileInput').files[0], selectedFileSource); });
    await page.waitForFunction(() => lottoLearningController.readView().sourceState.fetchedAt === latestLearningSource.fetchedAt);
    assert.deepEqual(await page.evaluate(() => lottoLearningController.readView().sourceState), manualSource,
      'Reanalyzing a selected manual file at a different range must retain load provenance');
    console.log('PASS manual file is published after read and range-only reanalysis retains provenance');
    holdFetch = true;
    await page.evaluate(() => { window.loadingDefault = loadDefaultNumbersFile(); });
    await page.waitForFunction(() => document.querySelector('#defaultDataBtn').disabled);
    while (!releaseFetch) await new Promise(resolve => setImmediate(resolve));
    await page.locator('#fileInput').setInputFiles({ name: 'manual.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes });
    releaseFetch();
    await page.evaluate(() => loadingDefault);
    assert.equal(await page.evaluate(() => loadedExcelRows), null);
    assert.equal(await page.locator('#fileInput').evaluate(input => input.files[0].name), 'manual.xlsx');
    assert.equal(await page.evaluate(() => lottoLearningController.readView().sourceState.kind), 'manual');
    console.log('PASS slow default fetch cannot overwrite a newer manual selection or staging');
    holdFetch = false;
    await page.evaluate(() => loadDefaultNumbersFile());
    await page.waitForFunction(() => lottoLearningController.readView().sourceState.status === 'ready');
    const loaded = await page.evaluate(() => ({ source: lottoLearningController.readView().sourceState, analyzed: currentData }));
    assert.equal(loaded.source.kind, 'canonical');
    assert.equal(loaded.source.rowCount, 700);
    assert.equal(loaded.analyzed.length, 700, 'Canonical staging must not replace the prior legacy analysis');
    await page.evaluate(() => setRowSelection('1-20'));
    assert.deepEqual(await page.evaluate(() => lottoLearningController.readView().sourceState), loaded.source);
    failFetch = true;
    await page.evaluate(() => loadDefaultNumbersFile());
    await page.waitForFunction(() => lottoLearningController.readView().sourceState.status === 'error');
    await page.evaluate(() => lottoLearningController.start());
    assert.equal(await page.evaluate(() => lottoLearningController.readView().error.code), 'CANONICAL_SOURCE_REQUIRED');
    failFetch = false;
    await page.evaluate(() => loadDefaultNumbersFile());
    await page.waitForFunction(() => lottoLearningController.readView().sourceState.status === 'ready');
    console.log('PASS failed canonical fetch does not restore previously eligible history');
    await page.evaluate(async () => { await runAnalysisWithRows(loadedExcelRows); });
    assert.equal(await page.evaluate(() => lottoLearningController.readView().sourceState.kind), 'manual');
    console.log('PASS default raw history publishes without Analyze; ranges do not mint provenance; generic calls are manual');
    const prize = await page.evaluate(async () => {
      const draw = { drawNumber: 3700, date: '2025-10-01', numbers: [1, 2, 3, 4, 5, 6], strong: 7 };
      const lines = [{ comboNum: 9, strategy: 'first identity', numbers: [1, 2, 3, 10, 11, 12], strong: 7 },
        { comboNum: 2, strategy: 'second identity', numbers: [1, 2, 3, 4, 5, 6], strong: 1 }];
      const score = { results: [{ regularMatches: 3, strongMatch: true }, { regularMatches: 6, strongMatch: false }] };
      const doc = { draws: { 3700: { drawDate: '01/10/2025', sourceUrl: 'source', regular: {
        '3+strong': { prizeIls: 43, winnerCount: 1 }, '6': { prizeIls: 1000, winnerCount: 1 } } } } };
      lottoPrizeDocument = { draws: { 3700: { ...doc.draws[3700], regular: { '3+strong': { prizeIls: 10, winnerCount: 1 } } } } };
      const old = calculatePinnedDrawWinnings(score, draw);
      const own = calculatePinnedDrawWinnings(score, draw, doc);
      const learning = calculateLearningDrawWinnings(lines, draw, doc);
      delete doc.draws[3700].regular['6'];
      const missing = calculateLearningDrawWinnings(lines, draw, doc);
      doc.draws[3700].drawDate = '02/10/2025';
      const wrongDate = calculateLearningDrawWinnings(lines, draw, doc);
      return { old, own, learning, missing, wrongDate, after: calculatePinnedDrawWinnings(score, draw) };
    });
    assert.equal(prize.old.totalPrizeIls, 10);
    assert.deepEqual(prize.old, prize.after);
    assert.equal(prize.own.totalPrizeIls, 1043);
    assert.deepEqual(prize.learning, prize.own);
    assert.deepEqual(prize.learning.lines.map(line => line.prizeIls), [43, 1000]);
    assert.equal(prize.missing.status, 'unavailable');
    assert.equal(prize.wrongDate.status, 'unavailable');
    console.log('PASS independent prize document preserves PIN behavior and original unsorted row identities');
    const prizeDocument = { schemaVersion: 1, updatedAt: '2025-10-10T12:00:00Z', draws: { '3700': {
      drawNumber: 3700, drawDate: '01/10/2025', sourceUrl: 'https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=3700',
      regular: { '3+strong': { winnerCount: 1, prizeIls: 43 }, '6': { winnerCount: 1, prizeIls: 1000 } },
    } } };
    await page.route('**/LOTTO_PRIZES.json', route => route.fulfill({ json: prizeDocument }));
    const fetchedPrize = await page.evaluate(async () => {
      const draw = { drawNumber: 3700, date: '2025-10-01', numbers: [1, 2, 3, 4, 5, 6], strong: 7 };
      const lines = Array.from({ length: 14 }, (_, i) => ({ comboNum: 14 - i, strategy: 'identity ' + i,
        numbers: i === 0 ? [1, 2, 3, 10, 11, 12] : i === 1 ? [1, 2, 3, 4, 5, 6] : [11, 12, 13, 14, 15, 16], strong: i === 0 ? 7 : 1 }));
      const state = { experiment: { id: 'adapter-fixture' }, observations: [{ target: 3700, draw, kind: 'eligible' }],
        snapshots: [{ target: 3700, arms: { learner: lines, legacy: lines, random: lines } }] };
      const memo = lottoPrizeLoadPromise; const previous = JSON.stringify(lottoPrizeDocument);
      let cache; const originalFetch = fetch;
      window.fetch = (url, options) => { cache = options.cache; return originalFetch(url, options); };
      try {
        const reports = await fetchLearningPrizes({ state, signal: new AbortController().signal, now: () => '2025-10-10T12:00:00Z' });
        return { reports, cache, unchanged: previous === JSON.stringify(lottoPrizeDocument) && memo === lottoPrizeLoadPromise };
      } finally { window.fetch = originalFetch; }
    });
    assert.equal(fetchedPrize.cache, 'no-store');
    assert.equal(fetchedPrize.unchanged, true);
    assert.equal(fetchedPrize.reports[0].arms.learner.totalPrizeIls, 1043);
    assert.deepEqual(fetchedPrize.reports[0].arms.learner.lines.slice(0, 2).map(l => l.prizeIls), [43, 1000]);
    assert.match(fetchedPrize.reports[0].drawDigest, /^[a-f0-9]{64}$/);
    console.log('PASS learning fetches and normalizes its own no-store prize document without touching the PIN memo');
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('lottoLearningExperimentV1', 2);
      request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
    }));
    await page.evaluate(() => loadDefaultNumbersFile());
    assert.equal(await page.evaluate(() => loadedExcelRows.length), 700);
    console.log('PASS learning database closure does not break legacy source staging');
  } finally { await context.close(); }
}
async function verifyLifecycle(h, fixture, pauseOnly = false) {
  async function check(name, run, expected, seedStore = true, argument) {
    const context = await h.browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(h.baseUrl + '/tests/fixtures/learning-harness.html');
      await page.evaluate(async ({ initial, seedStore }) => {
        window.savedFixture = initial;
        window.realStore = await LottoLearningStore.open();
        const transition = Object.fromEntries(['experiment', 'decisions', 'snapshots', 'observations', 'prizes', 'faults'].map(key => [key, initial[key]]));
        if (seedStore) await realStore.commit(0, transition);
        window.makeController = options => LottoLearningController.create({ store: realStore,
          workerFactory: () => new Worker('/lotto-learning-worker.js'), now: () => '2025-10-10T12:00:00Z', ...options });
        window.publish = async (controller, count = 701, kind = 'canonical') => {
          const generation = controller.beginSource(kind);
          return controller.acceptSource(LottoLearningFixture.toLearningMatrix(LottoLearningFixture.buildLearningDraws(count)), {
            kind, generation, url: kind === 'canonical' ? 'NUMBERS.xlsx' : null, fetchedAt: '2025-10-10T12:00:00Z' });
        };
      }, { initial: fixture, seedStore });
      assert.deepEqual(await page.evaluate(run, argument), expected, name);
      console.log('PASS ' + name);
    } finally { await context.close(); }
  }
  for (const paused of [true, false]) {
    for (const invalidation of ['cancel', 'source']) {
      await check(`pending ${paused ? 'pause' : 'resume'} is aborted by ${invalidation}`, async ({ paused, invalidation }) => {
        if (!paused) await realStore.setPaused(1, true);
        const before = await realStore.read();
        let release; let entered;
        const gate = new Promise(resolve => { release = resolve; });
        const waiting = new Promise(resolve => { entered = resolve; });
        const c = makeController({ store: { ...realStore,
          setPaused: async (...args) => { entered(); await gate; return realStore.setPaused(...args); },
        } });
        try {
          const pending = c.pause(paused);
          await waiting;
          if (invalidation === 'cancel') c.cancel(); else c.beginSource('manual');
          release(); await pending;
          const after = await realStore.read(); const view = c.readView();
          return [after.experiment.status, after.revision, JSON.stringify(after) === JSON.stringify(before),
            view.error, view.sourceState.kind];
        } finally { release(); c.close(); }
      }, [paused ? 'active' : 'paused', paused ? 1 : 2, true, null,
        invalidation === 'source' ? 'manual' : null], true, { paused, invalidation });
    }
  }
  if (pauseOnly) return;
  await check('a competing tab wins start without rerolling the losing experiment seed', async () => {
    let minted = 0; let competing;
    const c = makeController({ makeSeed: () => { minted += 1; return 'ffeeddccbbaa99887766554433221100'; },
      workerFactory: () => {
        const w = new Worker('/lotto-learning-worker.js'); const post = w.postMessage.bind(w);
        w.postMessage = request => {
          if (request.operation === 'prepare' && !competing) {
            const change = Object.fromEntries(['experiment', 'decisions', 'snapshots', 'observations', 'prizes', 'faults'].map(key => [key, savedFixture[key]]));
            competing = realStore.commit(0, change).then(() => post(request));
          } else post(request);
        }; return w;
      } });
    await publish(c, 700); await c.start();
    const state = await realStore.read(); const view = c.readView(); c.close();
    return [minted, state.experiment.seedHex === savedFixture.experiment.seedHex, state.snapshots.length, view.error];
  }, [1, true, 1, null], false);
  await check('new snapshot time is captured after worker work, at its save attempt', async () => {
    let time = '2025-10-10T12:00:00Z';
    const c = makeController({ now: () => time, workerFactory: () => {
      const w = new Worker('/lotto-learning-worker.js'); const post = w.postMessage.bind(w);
      w.postMessage = request => {
        const receive = w.onmessage;
        if (request.operation === 'prepare') w.onmessage = event => {
          if (event.data.type === 'complete') time = '2025-10-11T12:00:00Z'; receive(event);
        };
        post(request);
      }; return w;
    } });
    await publish(c); const state = await realStore.read(); c.close();
    return state.snapshots.at(-1).createdAt;
  }, '2025-10-11T12:00:00Z');
  await check('clock rollback rejects a new form and preserves saved history', async () => {
    const c = makeController({ now: () => '2025-01-01T12:00:00Z' });
    await publish(c);
    const state = await realStore.read(); const view = c.readView(); c.close();
    return [view.error.code, state.revision, JSON.stringify(state.snapshots) === JSON.stringify(savedFixture.snapshots), state.observations.length];
  }, ['CLOCK_ROLLBACK', 1, true, 0]);
  await check('changed training prefix conflicts even without a scored changed target', async () => {
    const c = makeController(); const rows = LottoLearningFixture.toLearningMatrix(LottoLearningFixture.buildLearningDraws(700));
    rows[100][8] = rows[100][8] % 7 + 1;
    const generation = c.beginSource('canonical');
    await c.acceptSource(rows, { kind: 'canonical', generation, url: 'NUMBERS.xlsx', fetchedAt: '2025-10-10T12:00:00Z' });
    const state = await realStore.read(); c.close();
    return [state.experiment.status, state.faults, JSON.stringify(state.snapshots) === JSON.stringify(savedFixture.snapshots)];
  }, ['conflict', [{ target: null, code: 'SOURCE_CONFLICT' }], true]);
  await check('source loss during persistence aborts the actual IDB commit', async () => {
    let release; let entered;
    const gate = new Promise(resolve => { release = resolve; });
    const waiting = new Promise(resolve => { entered = resolve; });
    const boundary = { read: () => realStore.read(), close: () => realStore.close(), setPaused: (...args) => realStore.setPaused(...args),
      commit: async (...args) => { entered(); await gate; return realStore.commit(...args); } };
    const c = makeController({ store: boundary });
    const pending = publish(c); await waiting; c.beginSource('manual'); release(); await pending;
    const state = await realStore.read(); const view = c.readView(); c.close();
    return [state.revision, state.snapshots.length, state.observations.length, view.sourceState.kind, view.error];
  }, [1, 1, 0, 'manual', null]);
  await check('worker crash and messageerror cannot commit or show stale success', async () => {
    const codes = [];
    for (const type of ['onerror', 'onmessageerror']) {
      const c = makeController({ store: { ...realStore, close() {} }, workerFactory: () => {
        const w = new Worker('/lotto-learning-worker.js');
        w.postMessage = () => queueMicrotask(() => w[type]({}));
        return w;
      } });
      await publish(c); codes.push(c.readView().error.code); c.close();
    }
    const c = makeController({ workerFactory: () => { throw new Error('CSP refused worker'); } });
    await publish(c); codes.push(c.readView().error.code);
    const revision = (await realStore.read()).revision; c.close(); return [codes, revision];
  }, [['WORKER_ERROR', 'WORKER_MESSAGE_ERROR', 'WORKER_ERROR'], 1]);
  await check('one revision conflict retries but a persistent conflict is surfaced', async () => {
    let attempts = 0;
    const c = makeController({ store: { ...realStore, commit: async () => {
      attempts += 1; throw Object.assign(new Error('racing writer'), { code: 'REVISION_CONFLICT' });
    } } });
    await publish(c); const view = c.readView(); const revision = (await realStore.read()).revision; c.close();
    return [attempts, view.error.code, view.error.message, revision, view.stored.snapshots.length];
  }, [2, 'REVISION_CONFLICT', 'הטופס לא נשמר', 1, 1]);
  await check('storage failures retain the prior saved forms and report unsaved', async () => {
    const c = makeController({ store: { ...realStore, commit: async () => { throw Object.assign(new Error('quota'), { code: 'STORAGE_QUOTA' }); } } });
    await publish(c); const view = c.readView(); const revision = (await realStore.read()).revision; c.close();
    return [view.error.code, view.error.message, revision, JSON.stringify(view.stored.snapshots) === JSON.stringify(savedFixture.snapshots)];
  }, ['STORAGE_QUOTA', 'הטופס לא נשמר', 1, true]);
  await check('late prize refresh updates only prizes under the same draw digest', async () => {
    let amount = 10;
    const c = makeController({ prizeAdapter: async ({ state }) => {
      const observation = state.observations.find(o => o.target === 3700);
      if (!observation) return [];
      const winnings = { status: 'available', totalPrizeIls: amount, winningCombinationCount: 1, sourceUrl: 'source',
        lines: Array.from({ length: 14 }, (_, i) => ({ status: i ? 'no-prize' : 'won', tierKey: i ? '0' : '3', prizeIls: i ? null : amount })) };
      return [{ experimentId: state.experiment.id, target: 3700, drawDigest: await LottoLearningCore.hashHistory([observation.draw]),
        checkedAt: '2025-10-10T12:00:00Z', arms: { learner: winnings, legacy: winnings, random: winnings } }];
    } });
    await publish(c); const before = await realStore.read(); amount = 50; await c.refreshPrizes(); const after = await realStore.read(); c.close();
    return [before.prizes[0].arms.learner.totalPrizeIls, after.prizes[0].arms.learner.totalPrizeIls,
      before.prizes[0].drawDigest === after.prizes[0].drawDigest,
      ['experiment', 'decisions', 'snapshots', 'observations'].every(key => JSON.stringify(before[key]) === JSON.stringify(after[key]))];
  }, [10, 50, true, true]);
  await check('pause discards stale worker messages and never creates a resumed form', async () => {
    let respond; let signalPrepared;
    const prepared = new Promise(resolve => { signalPrepared = resolve; });
    const c = makeController({ workerFactory: () => {
      const w = new Worker('/lotto-learning-worker.js');
      const post = w.postMessage.bind(w);
      w.postMessage = request => {
        if (request.operation === 'prepare') {
          const listener = w.onmessage;
          respond = () => listener({ data: { ...request, type: 'progress', phase: 'obsolete' } });
          signalPrepared();
        } else post(request);
      };
      return w;
    } });
    const pending = publish(c); await prepared; await c.pause(true); respond(); await pending;
    const state = await realStore.read(); const view = c.readView(); c.close();
    return [state.experiment.status, state.snapshots.length, state.observations.length, view.progress, view.error];
  }, ['paused', 1, 0, null, null]);
}
async function main() {
  const h = await openLearningHarness();
  try {
    if (process.argv.includes('--pause-only')) {
      console.time('Prepare reusable pause transition');
      const fixture = await h.page.evaluate(() => makeStartTransition());
      console.timeEnd('Prepare reusable pause transition');
      await verifyLifecycle(h, fixture, true);
      console.log('Learning controller pause verification passed');
      return;
    }
    await verifyAnalyzer(h);
    if (process.argv.includes('--analyzer-only')) return;
    assert.equal(await h.page.evaluate(() => typeof LottoLearningController), 'object',
      'Browser controller must be available after the real store and worker harness loads');
    const source = await h.page.evaluate(async () => {
      window.store = await LottoLearningStore.open();
      window.clockValue = '2025-09-29T12:00:00Z';
      window.controller = LottoLearningController.create({ store, now: () => clockValue,
        workerFactory: () => new Worker('/lotto-learning-worker.js') });
      window.publish = async (count, kind = 'canonical', mutate) => {
        const rows = LottoLearningFixture.toLearningMatrix(LottoLearningFixture.buildLearningDraws(count));
        if (mutate) mutate(rows);
        const generation = controller.beginSource(kind);
        await controller.acceptSource(rows, { kind, url: 'NUMBERS.xlsx', fetchedAt: clockValue, generation });
      };
      const old = controller.beginSource('canonical');
      const manual = controller.beginSource('manual');
      await controller.acceptSource(LottoLearningFixture.toLearningMatrix(LottoLearningFixture.buildLearningDraws(700)), {
        kind: 'canonical', url: 'NUMBERS.xlsx', fetchedAt: clockValue, generation: old });
      await controller.start();
      return { view: controller.readView(), saved: await store.read(), manual };
    });
    assert.equal(source.view.sourceState.generation, source.manual);
    assert.equal(source.saved.experiment, null);
    assert.equal(source.view.error.code, 'CANONICAL_SOURCE_REQUIRED');
    console.log('PASS real store remains empty after late canonical fetch');

    await h.page.evaluate(async () => { await publish(700); });
    assert.equal(await h.page.evaluate(() => controller.readView().sourceState.status), 'ready');
    await h.page.evaluate(async () => { window.startPromise = controller.start(); controller.cancel(); await startPromise; });
    assert.equal(await h.page.evaluate(async () => (await store.read()).experiment), null);
    console.log('PASS cancelled start never commits');
    await h.page.evaluate(() => { window.startPromise = controller.start().then(() => { window.started = true; }); });
    await h.page.waitForFunction(() => window.started, null, { timeout: 180000 });
    const started = await h.page.evaluate(async () => { window.initial = await store.read(); return { saved: initial, view: controller.readView() }; });
    assert.equal(started.view.error, null);
    assert.equal(started.saved.snapshots.length, 1);
    assert.equal(started.saved.snapshots[0].target, 3700);
    assert.equal(started.saved.snapshots[0].arms.learner.length, 14);
    assert.equal(started.saved.snapshots[0].arms.legacy.length, 14);
    assert.equal(started.saved.snapshots[0].arms.random.length, 14);
    console.log('PASS real worker saves one atomic three-arm live start');
    await verifyLifecycle(h, started.saved);
    await h.page.evaluate(async () => { clockValue = '2025-10-10T12:00:00Z'; await publish(703); });
    const updated = await h.page.evaluate(async () => ({ saved: await store.read(), view: controller.readView() }));
    assert.equal(updated.view.error, null);
    assert.deepEqual(updated.saved.observations.map(o => [o.target, o.kind]), [[3700, 'eligible'], [3701, 'missing'], [3702, 'missing']]);
    assert.deepEqual(updated.saved.snapshots[0], started.saved.snapshots[0]);
    assert.deepEqual(updated.saved.snapshots.map(s => s.target), [3700, 3703]);
    console.log('PASS batch refresh settles exact targets and creates only latest+1');
    await h.page.evaluate(async () => { await controller.pause(true); clockValue = '2025-12-20T12:00:00Z'; window.pausedDone = false; publish(722).then(() => { window.pausedDone = true; }); });
    await h.page.waitForFunction(() => window.pausedDone, null, { timeout: 180000 });
    const paused = await h.page.evaluate(async () => ({ saved: await store.read(), view: controller.readView() }));
    assert.equal(paused.view.error, null);
    assert.equal(paused.saved.experiment.status, 'paused');
    assert.deepEqual(paused.saved.snapshots, updated.saved.snapshots);
    assert.deepEqual(paused.saved.decisions.map(d => d.cutoff), [3699, 3719]);
    assert.equal(paused.saved.observations.length, 22);
    console.log('PASS paused canonical refresh settles and advances boundaries without forms');
    await h.page.evaluate(async () => { await controller.pause(false); await controller.synchronize(); });
    const resumed = await h.page.evaluate(async () => await store.read());
    assert.equal(resumed.experiment.status, 'active');
    assert.deepEqual(resumed.snapshots.map(s => s.target), [3700, 3703, 3722]);
    assert.deepEqual(resumed.snapshots.slice(0, 2), paused.saved.snapshots);
    console.log('PASS explicit resume creates only latest+1 with the preserved decision schedule');
    await h.page.evaluate(async () => { await publish(722, 'canonical', rows => { rows[700][8] = rows[700][8] % 7 + 1; }); });
    const conflict = await h.page.evaluate(async () => ({ saved: await store.read(), view: controller.readView() }));
    assert.equal(conflict.saved.experiment.status, 'conflict');
    assert.ok(conflict.saved.faults.some(f => f.code === 'DRAW_CONFLICT' && f.target === 3700));
    assert.deepEqual(conflict.saved.snapshots, resumed.snapshots);
    assert.deepEqual(conflict.saved.observations, paused.saved.observations);
    console.log('PASS historic edits quarantine state without rewriting observations or snapshots');
    await h.page.evaluate(async () => { await publish(900, 'manual'); window.replayDone = false; controller.replay().then(() => { window.replayDone = true; }); });
    await h.page.waitForFunction(() => controller.readView().progress !== null, null, { timeout: 180000 });
    await h.page.evaluate(() => controller.cancel());
    await h.page.waitForFunction(() => window.replayDone);
    assert.deepEqual(await h.page.evaluate(async () => await store.read()), conflict.saved);
    assert.equal(await h.page.evaluate(() => controller.readView().pendingReplay), null);
    console.log('PASS cancellation terminates a running real replay without store writes');
    await h.page.evaluate(() => { window.replayDone = false; controller.replay().then(() => { window.replayDone = true; }); });
    await h.page.waitForFunction(() => window.replayDone, null, { timeout: 180000 });
    const replay = await h.page.evaluate(async () => ({ saved: await store.read(), view: controller.readView() }));
    assert.equal(replay.view.error, null);
    assert.equal(replay.view.report.mode, 'historical');
    assert.equal(replay.view.report.targetCount, 200);
    assert.equal(replay.view.pendingReplay.targets.length, 200);
    assert.deepEqual(replay.saved, conflict.saved);
    console.log('PASS manual replay consumes actual worker output and never writes live state');
    await h.page.evaluate(() => controller.close());
  } finally { await h.close(); }
  console.log('Learning controller browser verification passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
