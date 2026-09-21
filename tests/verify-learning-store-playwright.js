'use strict';

const assert = require('assert');
const { openLearningHarness } = require('./helpers/learning-browser');

(async () => {
  const { page, context, baseUrl, close } = await openLearningHarness();
  try {
    assert.strictEqual(await page.evaluate(() => typeof LottoLearningCore.prepareAtCutoff), 'function', 'Real core loaded');
    assert.strictEqual(await page.evaluate(() => typeof LottoLearningStore), 'object', 'Store module must load in real Chromium');
    console.time('Prepare reusable learning transition');
    const transition = await page.evaluate(() => makeStartTransition());
    console.timeEnd('Prepare reusable learning transition');
    const second = await context.newPage();
    await second.goto(`${baseUrl}/tests/fixtures/learning-harness.html`);
    // Removing the in-transaction revision check lets both writers survive.
    const race = await Promise.all([page, second].map(tab => tab.evaluate(async change => {
      const store = await LottoLearningStore.open();
      try { await store.commit(0, change); return 'saved'; }
      catch (error) { return error.code; }
      finally { store.close(); }
    }, transition)));
    assert.deepStrictEqual(race.sort(), ['REVISION_CONFLICT', 'saved'].sort());
    console.log('PASS two-tab start serializes revision');
    await page.evaluate(change => {
      window.startFixture = change;
      window.copyStart = () => structuredClone(startFixture);
      window.codeOf = async operation => { try { await operation(); return 'saved'; } catch (error) { return error.code; } };
      window.resetLearning = () => new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase('lottoLearningExperimentV1');
        request.onsuccess = resolve; request.onerror = () => reject(request.error);
      });
      window.settlement = () => {
        const change = copyStart();
        const draw = LottoLearningFixture.buildLearningDraws(701).at(-1);
        change.experiment.lastProcessedDraw = draw.drawNumber;
        change.experiment.sourceCutoff = draw.drawNumber;
        change.observations = [{ experimentId: change.experiment.id, target: draw.drawNumber, draw,
          kind: 'eligible', scores: Object.fromEntries(['learner', 'legacy', 'random'].map(arm =>
            [arm, LottoLearningCore.scoreArm(change.snapshots[0].arms[arm], draw)])) }];
        return change;
      };
      // Deliberately preserve opaque PIN bytes; the learning module has no reason to parse them.
      localStorage.setItem('lottoPinnedFormsV1', ' {"old":"unchanged"} ');
      localStorage.setItem('lottoPinnedFormsV2', '{"slots":[1,2,3,4],"history":"untouched"}');
    }, transition);
    async function check(name, run, expected) {
      await page.evaluate(() => resetLearning());
      const actual = await page.evaluate(run);
      assert.deepStrictEqual(actual, expected, name);
      console.log(`PASS ${name}`);
    }
    await check('read returns complete compatible state and exact repeats are no-ops', async () => {
      const store = await LottoLearningStore.open();
      try {
        const empty = await store.read();
        const first = await store.commit(0, copyStart());
        const repeated = await store.commit(1, copyStart());
        return [empty.revision, empty.experiment, first.revision, repeated.revision,
          JSON.stringify(first) === JSON.stringify(repeated), repeated.snapshots.length,
          repeated.decisions.length, repeated.compatibility, repeated.rawBackup, repeated.incompatibilityCodes];
      } finally { store.close(); }
    }, [0, null, 1, 1, true, 1, 1, 'compatible', null, []]);

    // A differing-seed start must not mix one experiment's meta with another's arms.
    await page.evaluate(() => resetLearning());
    const alternative = structuredClone(transition);
    alternative.experiment.seedHex = 'ffeeddccbbaa99887766554433221100';
    alternative.snapshots[0].seedHex = alternative.experiment.seedHex;
    const seedRace = await Promise.all([page, second].map((tab, index) => tab.evaluate(async change => {
      const store = await LottoLearningStore.open();
      try { return { result: await store.commit(0, change), seed: change.experiment.seedHex }; }
      catch (error) { return { code: error.code }; }
      finally { store.close(); }
    }, index ? alternative : transition)));
    assert.strictEqual(seedRace.filter(result => result.code === 'REVISION_CONFLICT').length, 1);
    const survivor = await page.evaluate(async () => { const store = await LottoLearningStore.open(); try { return await store.read(); } finally { store.close(); } });
    assert.strictEqual(survivor.experiment.seedHex, seedRace.find(result => result.result).seed);
    assert.strictEqual(survivor.snapshots[0].seedHex, survivor.experiment.seedHex);
    assert.strictEqual(survivor.revision, 1);
    console.log('PASS differing-seed race has exactly one complete survivor');

    await check('pause defeats stale/active commits but permits paused settlement and resume', async () => {
      const store = await LottoLearningStore.open();
      try {
        await store.commit(0, copyStart());
        const paused = await store.setPaused(1, true);
        const stale = await codeOf(() => store.commit(1, settlement()));
        const active = await codeOf(() => store.commit(2, settlement()));
        const change = settlement(); change.experiment.status = 'paused';
        const settled = await store.commit(2, change);
        const forbidden = structuredClone(change);
        forbidden.snapshots.push({ ...structuredClone(change.snapshots[0]), target: 3701, anchor: 3700 });
        const newSnapshot = await codeOf(() => store.commit(3, forbidden));
        const resumed = await store.setPaused(3, false);
        return [paused.revision, stale, active, settled.revision, settled.experiment.status,
          settled.observations.length, settled.snapshots.length, newSnapshot, resumed.revision, resumed.experiment.status];
      } finally { store.close(); }
    }, [2, 'REVISION_CONFLICT', 'EXPERIMENT_PAUSED', 3, 'paused', 1, 1, 'EXPERIMENT_PAUSED', 4, 'active']);

    await check('duplicate target and changed prior observation roll back every store', async () => {
      const store = await LottoLearningStore.open();
      try {
        await store.commit(0, copyStart());
        const duplicate = copyStart();
        duplicate.snapshots.push({ ...structuredClone(duplicate.snapshots[0]), createdAt: '2025-09-29T12:01:00Z' });
        const collision = await codeOf(() => store.commit(1, duplicate));
        const settled = await store.commit(1, settlement());
        const altered = settlement(); altered.observations[0].draw.strong = 7;
        altered.faults.push({ target: null, code: 'SHOULD_ROLL_BACK' });
        const changed = await codeOf(() => store.commit(2, altered));
        const after = await store.read();
        return [collision, changed, after.revision, JSON.stringify(after) === JSON.stringify(settled)];
      } finally { store.close(); }
    }, ['IMMUTABLE_CONFLICT', 'IMMUTABLE_CONFLICT', 2, true]);

    for (const boundary of ['abort', 'quota']) {
      await page.evaluate(value => { window.failureBoundary = value; }, boundary);
      await check(`${boundary} after first queued write is atomic`, async () => {
        const store = await LottoLearningStore.open();
        const before = await store.read();
        const controller = new AbortController();
        const original = IDBObjectStore.prototype.add;
        let injected = false;
        IDBObjectStore.prototype.add = function (...args) {
          const request = original.apply(this, args);
          if (!injected) {
            injected = true;
            if (window.failureBoundary === 'abort') controller.abort();
            else throw new DOMException('Test storage quota exhausted', 'QuotaExceededError');
          }
          return request;
        };
        try {
          const code = await codeOf(() => store.commit(0, copyStart(), { signal: controller.signal }));
          const after = await store.read();
          return [code, JSON.stringify(after) === JSON.stringify(before), after.revision, after.snapshots.length, after.decisions.length];
        } finally { IDBObjectStore.prototype.add = original; store.close(); }
      }, [boundary === 'abort' ? 'STORAGE_ABORTED' : 'STORAGE_QUOTA', true, 0, 0, 0]);
    }

    await check('late prizes replace only the same draw without changing immutable history', async () => {
      const store = await LottoLearningStore.open();
      try {
        const change = settlement();
        const first = await store.commit(0, change);
        const prize = { experimentId: change.experiment.id, target: 3700,
          drawDigest: await LottoLearningCore.hashHistory([change.observations[0].draw]),
          checkedAt: '2026-09-22T12:00:00Z', arms: { learner: { total: null }, legacy: { total: 0 }, random: { total: 0 } } };
        change.prizes = [prize];
        await store.commit(1, change);
        prize.checkedAt = '2026-09-23T12:00:00Z'; prize.arms.learner.total = 25;
        const late = await store.commit(2, change);
        prize.drawDigest = 'a'.repeat(64);
        const conflict = await codeOf(() => store.commit(3, change));
        const after = await store.read();
        return [late.revision, late.prizes[0].arms.learner.total, conflict,
          ['decisions', 'snapshots', 'observations'].every(key => JSON.stringify(first[key]) === JSON.stringify(after[key])),
          JSON.stringify(late) === JSON.stringify(after)];
      } finally { store.close(); }
    }, [3, 25, 'IMMUTABLE_CONFLICT', true, true]);

    await check('global faults persist safely and conflict cannot resume', async () => {
      const store = await LottoLearningStore.open();
      try {
        await store.commit(0, copyStart());
        const change = copyStart(); change.experiment.status = 'conflict';
        change.faults = [{ target: null, code: 'SOURCE_CONFLICT' }, { target: 3700, code: 'DRAW_CONFLICT' }];
        const state = await store.commit(1, change);
        const resume = await codeOf(() => store.setPaused(2, false));
        return [state.revision, state.experiment.status, state.faults, resume, (await store.commit(2, change)).revision];
      } finally { store.close(); }
    }, [2, 'conflict', [{ target: 3700, code: 'DRAW_CONFLICT' }, { target: null, code: 'SOURCE_CONFLICT' }], 'EXPERIMENT_CONFLICT', 2]);

    await check('fault ordering matches database keys across digit widths and code collation', async () => {
      const store = await LottoLearningStore.open();
      try {
        const change = copyStart();
        change.faults = [{ target: 10000, code: 'a' }, { target: 4000, code: 'a' }, { target: 4000, code: 'Z' }];
        const saved = await store.commit(0, change);
        const read = await store.read();
        const repeat = await store.commit(1, change);
        return [JSON.stringify(saved) === JSON.stringify(read), repeat.revision,
          read.faults.map(fault => `${fault.target}:${fault.code}`)];
      } finally { store.close(); }
    }, [true, 1, ['4000:Z', '4000:a', '10000:a']]);

    await check('transition discovering conflict cannot add a new snapshot', async () => {
      const store = await LottoLearningStore.open();
      try {
        const before = await store.commit(0, copyStart());
        const change = settlement(); change.experiment.status = 'conflict';
        change.faults = [{ target: null, code: 'SOURCE_CONFLICT' }];
        change.snapshots.push({ ...structuredClone(change.snapshots[0]), target: 3701, anchor: 3700 });
        return [await codeOf(() => store.commit(1, change)), JSON.stringify(await store.read()) === JSON.stringify(before)];
      } finally { store.close(); }
    }, ['EXPERIMENT_CONFLICT', true]);

    await check('missing targets settle while paused without fabricating snapshots', async () => {
      const store = await LottoLearningStore.open();
      try {
        await store.commit(0, copyStart()); await store.setPaused(1, true);
        const change = settlement(); change.experiment.status = 'paused';
        const draw = LottoLearningFixture.buildLearningDraws(702).at(-1);
        change.experiment.lastProcessedDraw = 3701; change.experiment.sourceCutoff = 3701;
        change.observations.push({ experimentId: change.experiment.id, target: 3701, draw, kind: 'missing', scores: null });
        const settled = await store.commit(2, change);
        return [settled.revision, settled.experiment.status, settled.experiment.lastProcessedDraw,
          settled.observations.map(item => item.kind), settled.snapshots.map(item => item.target)];
      } finally { store.close(); }
    }, [3, 'paused', 3701, ['eligible', 'missing'], [3700]]);

    await check('invalid scores and orphan prizes reject without partial writes', async () => {
      const store = await LottoLearningStore.open();
      try {
        const before = await store.commit(0, copyStart());
        const scored = settlement(); scored.observations[0].scores.learner.win3Plus ^= 1;
        const badScore = await codeOf(() => store.commit(1, scored));
        const orphan = copyStart(); orphan.prizes = [{ experimentId: orphan.experiment.id, target: 3701,
          drawDigest: 'a'.repeat(64), checkedAt: '2026-09-22T12:00:00Z', arms: { learner: {}, legacy: {}, random: {} } }];
        const badPrize = await codeOf(() => store.commit(1, orphan));
        return [badScore, badPrize, JSON.stringify(await store.read()) === JSON.stringify(before)];
      } finally { store.close(); }
    }, ['MALFORMED_RECORD', 'MALFORMED_RECORD', true]);

    await check('pre-aborted signal writes nothing and caller mutation cannot alter an in-flight commit', async () => {
      const store = await LottoLearningStore.open();
      try {
        const controller = new AbortController(); controller.abort();
        const aborted = await codeOf(() => store.commit(0, copyStart(), { signal: controller.signal }));
        const change = copyStart(); const pending = store.commit(0, change);
        change.experiment.seedHex = 'bad'; change.snapshots[0].arms.learner[0].numbers = [];
        const saved = await pending;
        return [aborted, saved.revision, saved.experiment.seedHex, saved.snapshots[0].arms.learner[0].numbers.length];
      } finally { store.close(); }
    }, ['STORAGE_ABORTED', 1, '00112233445566778899aabbccddeeff', 6]);

    for (const corruption of ['protocol', 'core', 'malformed', 'schema', 'shape', 'timestamp', 'sparse']) {
      await page.evaluate(value => { window.corruption = value; }, corruption);
      await check(`unknown/malformed ${corruption} remains readonly with raw backup`, async () => {
        let store = await LottoLearningStore.open(); await store.commit(0, copyStart()); store.close();
        await new Promise((resolve, reject) => {
          const request = indexedDB.open('lottoLearningExperimentV1', window.corruption === 'schema' ? 2 : undefined);
          request.onupgradeneeded = () => request.result.createObjectStore('future-data');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const snapshotCorruption = ['malformed', 'shape', 'timestamp', 'sparse'].includes(window.corruption);
            const tx = db.transaction(snapshotCorruption ? 'snapshots' : 'meta', 'readwrite');
            if (snapshotCorruption) {
              const bad = copyStart().snapshots[0];
              if (window.corruption === 'malformed') bad.arms.learner[0].numbers = [1, 1, 2, 3, 4, 5];
              else if (window.corruption === 'shape') bad.source.generation = '1';
              else if (window.corruption === 'timestamp') bad.createdAt = '2026-02-30T12:00:00Z';
              else bad.arms.learner[0].numbers = new Array(6);
              tx.objectStore('snapshots').put(bad);
            } else if (window.corruption !== 'schema') {
              const exp = copyStart().experiment;
              exp[window.corruption === 'core' ? 'coreVersion' : 'protocolVersion'] = 'future-v999';
              tx.objectStore('meta').put({ key: 'active', revision: 1, experiment: exp });
            }
            tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
          };
        });
        store = await LottoLearningStore.open();
        try {
          const state = await store.read();
          const commit = await codeOf(() => store.commit(1, copyStart()));
          const pause = await codeOf(() => store.setPaused(1, true));
          const again = await store.read();
          return [state.compatibility, state.incompatibilityCodes.length > 0, state.rawBackup !== null,
            state.experiment, ['snapshots', 'observations', 'decisions', 'prizes', 'faults'].every(key => state[key].length === 0),
            commit, pause, JSON.stringify(state.rawBackup) === JSON.stringify(again.rawBackup)];
        } finally { store.close(); }
      }, ['readonly', true, true, null, true, 'INCOMPATIBLE_STORE', 'INCOMPATIBLE_STORE', true]);
    }

    await check('unknown store names cannot erase raw backup records through prototype keys', async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('lottoLearningExperimentV1', 3);
        request.onupgradeneeded = () => request.result.createObjectStore('__proto__').put({ secret: 'preserve me' }, 'opaque');
        request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
      });
      const store = await LottoLearningStore.open();
      try {
        const state = await store.read();
        return [state.compatibility, Object.hasOwn(state.rawBackup.stores, '__proto__'),
          JSON.parse(JSON.stringify(state.rawBackup)).stores.__proto__];
      } finally { store.close(); }
    }, ['readonly', true, [{ secret: 'preserve me' }]]);

    await check('versionchange closes existing connection and notifies consumer', async () => {
      let notified = 0;
      const store = await LottoLearningStore.open({ onVersionChange: () => { notified += 1; } });
      await store.commit(0, copyStart());
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('lottoLearningExperimentV1', 2);
        request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
      });
      const code = await codeOf(() => store.read()); store.close();
      return [notified, code];
    }, [1, 'STORE_CLOSED']);
    assert.deepStrictEqual(await page.evaluate(() => [localStorage.getItem('lottoPinnedFormsV1'), localStorage.getItem('lottoPinnedFormsV2')]),
      [' {"old":"unchanged"} ', '{"slots":[1,2,3,4],"history":"untouched"}']);
    console.log('PASS PIN localStorage bytes unchanged');
    console.log('Learning store browser verification passed');
  } finally { await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
