(function attachLearningController(root, factory) {
  const common = typeof module === 'object' && module.exports;
  const api = factory(root.LottoLearningCore || (common && require('./lotto-learning-core.js')),
    root.LottoLearningReport || (common && require('./lotto-learning-report.js')), root);
  if (common) module.exports = api;
  root.LottoLearningController = api;
}(typeof self !== 'undefined' ? self : globalThis, function createLearningController(core, report, runtime) {
  'use strict';
  // Unknown IndexedDB schemas can contain structured values that are not JSON.
  const clone = value => value == null ? value : runtime.structuredClone(value);
  const fault = (code, message = code) => Object.assign(new Error(message), { code });
  function seed() {
    const bytes = runtime.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  function rawHistory(raw) {
    if (!Array.isArray(raw)) throw fault('UNSUPPORTED_SOURCE', 'נדרשות תשע עמודות: מזהה, תאריך, שישה מספרים וחזק');
    const cells = raw.filter(row => !Array.isArray(row) || row.some(cell => cell !== '' && cell != null));
    if (!cells.length || cells.some(row => !Array.isArray(row) || row.length !== 9)) {
      throw fault('UNSUPPORTED_SOURCE', 'נדרשות תשע עמודות: מזהה, תאריך, שישה מספרים וחזק');
    }
    const mapped = cells.map(row => ({ drawNumber: row[0], date: row[1], numbers: row.slice(2, 8), strong: row[8] }));
    const valid = core.validateHistory(mapped);
    // Keep the excluded historical prefix in the digest, in addition to modern rows.
    const rows = JSON.parse(core.canonicalHistory(mapped)).map(row => ({
      drawNumber: row[0], date: row[1], numbers: row.slice(2, 8), strong: row[8],
    }));
    rows.forEach(row => { Object.freeze(row.numbers); Object.freeze(row); });
    return { rows: Object.freeze(rows), modern: valid.rows, excludedHistoricalCount: valid.excludedHistoricalCount };
  }
  function create({ store, workerFactory = () => new runtime.Worker('lotto-learning-worker.js'),
    now = () => new Date().toISOString(), makeSeed = seed, prizeAdapter = async () => [], onState = () => {} }) {
    let closed = false; let generation = 0; let runId = 0; let ownedWorker = null; let aborter = null;
    let source = null; let stored = null; let pendingWorkerReject = null;
    const view = { mode: 'live', sourceState: { status: 'empty', generation: 0, kind: null },
      stored: null, report: null, pendingReplay: null, progress: null, error: null };
    function emit() { if (!closed) onState(readView()); }
    function readView() { return clone(view); }
    function displayState(state) {
      stored = state; view.stored = state;
      if (view.mode === 'live') view.report = state.compatibility === 'compatible' ? report.summarizeExperiment(state) : null;
    }
    const ready = Promise.resolve().then(() => store.read()).then(state => {
      if (!closed) { displayState(state); emit(); }
    }).catch(error => { if (!closed) { view.error = { code: error.code || 'STORAGE_FAILED', message: error.message }; emit(); } });
    function invalidate() {
      runId += 1;
      if (aborter) aborter.abort(); aborter = null;
      if (ownedWorker) ownedWorker.terminate(); ownedWorker = null;
      if (pendingWorkerReject) pendingWorkerReject(fault('CANCELLED')); pendingWorkerReject = null;
      view.progress = null; view.pendingReplay = null;
    }
    function current(token) {
      return !closed && token.runId === runId && token.generation === generation && !token.signal.aborted;
    }
    function check(token) { if (!current(token)) throw fault('CANCELLED'); }
    function beginRun() {
      invalidate(); aborter = new AbortController();
      view.error = null;
      return { runId, generation, signal: aborter.signal };
    }
    function worker(operation, rows, options, token, revision) {
      check(token);
      return new Promise((resolve, reject) => {
        let instance;
        const identity = { runId: token.runId, generation: token.generation, expectedRevision: revision,
          protocolVersion: core.PROTOCOL_VERSION, coreVersion: core.CORE_VERSION };
        const finish = (error, value) => {
          if (instance) instance.terminate();
          if (ownedWorker === instance) { ownedWorker = null; pendingWorkerReject = null; }
          if (error) reject(error); else resolve(value);
        };
        try {
          instance = workerFactory(); ownedWorker = instance; pendingWorkerReject = error => finish(error);
          instance.onerror = () => finish(fault('WORKER_ERROR'));
          instance.onmessageerror = () => finish(fault('WORKER_MESSAGE_ERROR'));
          instance.onmessage = event => {
            if (!current(token)) return;
            const message = event.data || {};
            if (Object.keys(identity).some(key => message[key] !== identity[key])) return;
            if (message.type === 'progress') { view.progress = clone(message); emit(); }
            else if (message.type === 'error') finish(fault(message.code || 'GENERATION_FAILED', message.message));
            else if (message.type === 'complete') finish(null, message.result);
          };
          instance.postMessage({ type: 'run', ...identity, operation, rows, options });
        } catch (error) { finish(fault('WORKER_ERROR', error.message)); }
      });
    }
    async function execute(action) {
      if (closed) return;
      const token = beginRun(); emit();
      try { await ready; check(token); await action(token); check(token); view.progress = null; }
      catch (error) {
        if (!current(token)) return;
        view.error = { code: error.code || 'GENERATION_FAILED', message: error.message || String(error) };
        if (/^(STORAGE_|REVISION_CONFLICT|INCOMPATIBLE_STORE)/.test(view.error.code)) view.error.message = 'הטופס לא נשמר';
        view.progress = null; view.pendingReplay = null;
      }
      if (current(token)) emit();
    }
    function canonical() {
      if (!source || view.sourceState.status !== 'ready' || source.kind !== 'canonical' || source.generation !== generation) {
        throw fault('CANONICAL_SOURCE_REQUIRED');
      }
      return source;
    }
    async function reread(token) {
      const state = await store.read(); check(token); displayState(state);
      if (state.compatibility !== 'compatible') throw fault('INCOMPATIBLE_STORE');
      return state;
    }
    async function retry(token, action) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const state = await reread(token);
        try { return await action(state); }
        catch (error) { check(token); if (error.code !== 'REVISION_CONFLICT' || attempt === 1) throw error; }
      }
    }
    function createdAt(state) {
      const value = now();
      if (!Number.isFinite(Date.parse(value))) throw fault('CLOCK_ROLLBACK');
      if (state.snapshots.some(snapshot => Date.parse(snapshot.createdAt) > Date.parse(value))) throw fault('CLOCK_ROLLBACK');
      return value;
    }
    async function save(state, transition, token, data) {
      check(token); if (canonical() !== data) throw fault('CANCELLED');
      const next = await store.commit(state.revision, transition, { signal: token.signal });
      check(token); if (canonical() !== data) throw fault('CANCELLED');
      displayState(next);
    }
    const change = experiment => ({ experiment, decisions: [], snapshots: [], observations: [], prizes: [], faults: [] });
    async function synchronizeState(state, data, token, onlyPrizes = false) {
      if (!state.experiment) return;
      const exp = state.experiment;
      if (exp.status === 'conflict') throw fault('EXPERIMENT_CONFLICT');
      const cutoff = data.modern.at(-1)?.drawNumber;
      if (!cutoff || cutoff < exp.lastProcessedDraw) throw fault('SOURCE_ROLLBACK');
      const cutoffs = [...new Set([exp.sourceCutoff, ...state.snapshots.map(s => s.anchor)])];
      const hashes = await worker('hash', data.rows, { cutoffs }, token, state.revision); check(token);
      const audit = report.buildObservations(state, data.modern);
      const faults = audit.faults.slice();
      if (hashes.prefixes[exp.sourceCutoff] !== exp.sourceDigest
        || state.snapshots.some(s => hashes.prefixes[s.anchor] !== s.source.digest)) faults.push({ target: null, code: 'SOURCE_CONFLICT' });
      if (faults.length) {
        const transition = change({ ...exp, status: 'conflict' }); transition.faults = faults;
        await save(state, transition, token, data); throw fault('SOURCE_CONFLICT');
      }
      const transition = change({ ...exp });
      if (!onlyPrizes) {
        transition.experiment = { ...exp, lastProcessedDraw: cutoff, sourceCutoff: cutoff, sourceDigest: hashes.digest };
        transition.observations = audit.observations;
        if (cutoff > exp.lastProcessedDraw || (exp.status === 'active' && !state.snapshots.some(s => s.target === cutoff + 1))) {
          const prepared = await worker('prepare', data.rows, { originAnchor: exp.originAnchor,
            decisions: state.decisions, cutoff, seedHex: exp.seedHex, mode: 'live' }, token, state.revision); check(token);
          if (prepared.digest !== hashes.digest || prepared.cutoff !== cutoff) throw fault('SOURCE_CONFLICT');
          transition.decisions = prepared.decisions.filter(d => !state.decisions.some(old => old.cutoff === d.cutoff));
          if (exp.status === 'active' && !state.snapshots.some(s => s.target === cutoff + 1)) {
            transition.snapshots.push({ experimentId: exp.id, target: cutoff + 1, anchor: cutoff,
              createdAt: '', protocolVersion: core.PROTOCOL_VERSION, coreVersion: core.CORE_VERSION,
              seedHex: exp.seedHex, window: prepared.window, source: provenance(data, hashes.digest), arms: prepared.arms });
          }
        }
      }
      const settled = { ...state, experiment: transition.experiment,
        observations: state.observations.concat(transition.observations) };
      transition.prizes = await prizeAdapter({ state: clone(settled), rows: clone(data.modern), signal: token.signal, now }); check(token);
      // Capture the local time after all computation and I/O, immediately before this save attempt.
      if (transition.snapshots.length) transition.snapshots[0].createdAt = createdAt(state);
      await save(state, transition, token, data);
    }
    function provenance(data, digest) {
      return { kind: data.kind, url: data.url, fetchedAt: data.fetchedAt, generation: data.generation, digest };
    }
    function beginSource(kind) {
      if (closed) throw fault('CONTROLLER_CLOSED');
      if (!['canonical', 'manual'].includes(kind)) throw fault('INVALID_SOURCE');
      invalidate(); generation += 1; source = null; view.mode = 'live'; view.error = null;
      if (stored) displayState(stored);
      view.sourceState = { kind, generation, status: 'loading' }; emit(); return generation;
    }
    async function acceptSource(rawRows, metadata) {
      if (closed || metadata.generation !== generation || metadata.kind !== view.sourceState.kind) return;
      // Capture at the call boundary, not after store initialization has yielded.
      rawRows = Array.isArray(rawRows) ? rawRows.map(row => Array.isArray(row) ? row.slice() : row) : rawRows;
      metadata = { kind: metadata.kind, generation: metadata.generation, url: metadata.url ?? null, fetchedAt: metadata.fetchedAt };
      await execute(async token => {
        try {
          const history = rawHistory(rawRows);
          if (!/^\d{4}-\d\d-\d\dT.*Z$/.test(metadata.fetchedAt) || !Number.isFinite(Date.parse(metadata.fetchedAt))) throw fault('INVALID_SOURCE');
          const hashes = await worker('hash', history.rows, { cutoffs: [] }, token, stored?.revision || 0); check(token);
          source = { ...history, ...metadata, digest: hashes.digest };
          view.sourceState = { ...provenance(source, hashes.digest), status: 'ready',
            rowCount: history.modern.length, excludedHistoricalCount: history.excludedHistoricalCount,
            latestDraw: history.modern.at(-1)?.drawNumber || null };
        } catch (error) { if (current(token)) { source = null; view.sourceState.status = 'error'; } throw error; }
        if (source.kind === 'canonical') await retry(token, state => synchronizeState(state, source, token));
      });
    }
    function rejectSource(requestGeneration, error) {
      if (closed || requestGeneration !== generation) return;
      invalidate(); source = null; view.sourceState.status = 'error';
      view.error = { code: error?.code || 'SOURCE_FAILED', message: error?.message || 'Source failed' }; emit();
    }
    function start() {
      return execute(async token => {
        view.mode = 'live'; const data = canonical(); let startSeed;
        if (data.modern.length < 700) throw fault('INSUFFICIENT_HISTORY');
        await retry(token, async state => {
          if (state.experiment) return synchronizeState(state, data, token);
          if (!startSeed) startSeed = makeSeed();
          const cutoff = data.modern.at(-1).drawNumber;
          const prepared = await worker('prepare', data.rows, { originAnchor: cutoff, decisions: [], cutoff,
            seedHex: startSeed, mode: 'live' }, token, state.revision); check(token);
          if (prepared.digest !== data.digest || prepared.cutoff !== cutoff) throw fault('SOURCE_CONFLICT');
          const experiment = { id: 'learning-' + startSeed, protocolVersion: core.PROTOCOL_VERSION, coreVersion: core.CORE_VERSION,
            seedHex: startSeed, originAnchor: cutoff, lastProcessedDraw: cutoff, status: 'active', sourceDigest: prepared.digest, sourceCutoff: cutoff };
          const transition = change(experiment); transition.decisions = prepared.decisions;
          transition.snapshots = [{ experimentId: experiment.id, target: cutoff + 1, anchor: cutoff, createdAt: createdAt(state),
            protocolVersion: core.PROTOCOL_VERSION, coreVersion: core.CORE_VERSION, seedHex: startSeed, window: prepared.window,
            source: provenance(data, prepared.digest), arms: prepared.arms }];
          await save(state, transition, token, data);
        });
      });
    }
    function synchronize() { return execute(token => { view.mode = 'live'; const data = canonical(); return retry(token, state => synchronizeState(state, data, token)); }); }
    function refreshPrizes() { return execute(token => { const data = canonical(); return retry(token, state => synchronizeState(state, data, token, true)); }); }
    function pause(paused) {
      return execute(async token => {
        await retry(token, async state => {
          const next = await store.setPaused(state.revision, paused, { signal: token.signal }); check(token); displayState(next);
        });
      });
    }
    function replay() {
      return execute(async token => {
        if (!source || view.sourceState.status !== 'ready') throw fault('SOURCE_REQUIRED');
        if (source.modern.length < 900) throw fault('INSUFFICIENT_HISTORY');
        view.pendingReplay = { generation, status: 'running' }; emit();
        const result = await worker('replay', source.rows, {}, token, stored?.revision || 0); check(token);
        if (result.digest !== source.digest) throw fault('SOURCE_CONFLICT');
        view.mode = 'historical'; view.report = report.summarizeHistoricalReplay(result); view.pendingReplay = result;
      });
    }
    function cancel() { invalidate(); view.error = null; emit(); }
    function close() { if (closed) return; invalidate(); closed = true; store.close(); }
    return { beginSource, acceptSource, rejectSource, start, synchronize, pause, replay, cancel, refreshPrizes, readView, close };
  }
  return { create };
}));
