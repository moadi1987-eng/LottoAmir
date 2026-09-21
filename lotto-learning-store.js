(function attachLearningStore(root, factory) {
  const api = factory(root.LottoLearningCore, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LottoLearningStore = api;
}(typeof self !== 'undefined' ? self : globalThis, function createLearningStore(core, runtime) {
  'use strict';

  const DATABASE = 'lottoLearningExperimentV1';
  const KEYS = { meta: 'key', decisions: ['experimentId', 'cutoff'],
    snapshots: ['experimentId', 'target'], observations: ['experimentId', 'target'],
    prizes: ['experimentId', 'target'], faults: ['experimentId', 'targetKey', 'code'] };
  const NAMES = Object.keys(KEYS);
  const RECORDS = NAMES.slice(1);
  const ARMS = ['learner', 'legacy', 'random'];
  function error(code) { return Object.assign(new Error(code), { code }); }
  function requireValue(condition, code = 'MALFORMED_RECORD') { if (!condition) throw error(code); }
  function integer(value, minimum = 0) { return Number.isSafeInteger(value) && value >= minimum; }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function fields(value, keys) {
    requireValue(object(value) && Object.keys(value).sort().join('|') === keys.slice().sort().join('|'));
  }
  function text(value) { return typeof value === 'string' && value.length > 0; }
  function digest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
  function timestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return false;
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === (value.length === 20 ? value.replace('Z', '.000Z') : value);
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }
  function equal(a, b) { return stable(a) === stable(b); }
  function jsonValue(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') { requireValue(Number.isFinite(value)); return; }
    requireValue(object(value) || Array.isArray(value));
    requireValue(!seen.has(value)); seen.add(value);
    requireValue(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    if (Array.isArray(value)) requireValue(Object.keys(value).length === value.length
      && Object.keys(value).every((key, index) => key === String(index)));
    for (const key of Object.keys(value)) {
      requireValue(!['__proto__', 'prototype', 'constructor'].includes(key));
      jsonValue(value[key], seen);
    }
    seen.delete(value);
  }
  function empty() {
    return { compatibility: 'compatible', incompatibilityCodes: [], rawBackup: null,
      revision: 0, experiment: null, decisions: [], snapshots: [], observations: [], prizes: [], faults: [] };
  }
  function recordKey(name, record) {
    if (name === 'decisions') return record.cutoff;
    if (name === 'faults') return `${record.target === null ? 'global' : record.target}:${record.code}`;
    return record.target;
  }
  function storageRecord(name, record, experimentId) {
    if (name === 'decisions') return { ...record, experimentId };
    if (name === 'faults') return { ...record, experimentId, targetKey: record.target === null ? 'global' : record.target };
    return record;
  }
  function storedKey(name, record) {
    return Array.isArray(KEYS[name]) ? KEYS[name].map(key => record[key]) : record[KEYS[name]];
  }
  function validateState(state) {
    jsonValue(state);
    requireValue(integer(state.revision));
    RECORDS.forEach(name => requireValue(Array.isArray(state[name])));
    if (!state.experiment) {
      requireValue(state.revision === 0 && RECORDS.every(name => state[name].length === 0)); return;
    }
    const exp = state.experiment;
    fields(exp, ['id', 'protocolVersion', 'coreVersion', 'seedHex', 'originAnchor', 'lastProcessedDraw', 'status', 'sourceDigest', 'sourceCutoff']);
    requireValue(exp.protocolVersion === core.PROTOCOL_VERSION, 'UNKNOWN_PROTOCOL');
    requireValue(exp.coreVersion === core.CORE_VERSION, 'UNKNOWN_CORE');
    requireValue(text(exp.id) && /^[a-f0-9]{32}$/.test(exp.seedHex) && integer(exp.originAnchor, 1)
      && integer(exp.lastProcessedDraw, exp.originAnchor) && integer(exp.sourceCutoff, exp.originAnchor)
      && exp.sourceCutoff <= exp.lastProcessedDraw && digest(exp.sourceDigest)
      && ['active', 'paused', 'conflict'].includes(exp.status));
    RECORDS.forEach(name => {
      const keys = state[name].map(record => recordKey(name, record));
      requireValue(new Set(keys).size === keys.length);
    });
    let incumbent = 500;
    requireValue(state.decisions.length > 0);
    state.decisions.forEach((decision, index) => {
      fields(decision, ['cutoff', 'window', 'counts']);
      requireValue(decision.cutoff === exp.originAnchor + index * 20 && decision.cutoff <= exp.lastProcessedDraw);
      requireValue(core.selectWindow(decision.counts, incumbent) === decision.window);
      incumbent = decision.window;
    });
    const snapshots = new Map();
    for (const snap of state.snapshots) {
      fields(snap, ['experimentId', 'target', 'anchor', 'createdAt', 'protocolVersion', 'coreVersion', 'seedHex', 'window', 'source', 'arms']);
      requireValue(snap.protocolVersion === core.PROTOCOL_VERSION, 'UNKNOWN_PROTOCOL');
      requireValue(snap.coreVersion === core.CORE_VERSION, 'UNKNOWN_CORE');
      requireValue(snap.experimentId === exp.id && snap.seedHex === exp.seedHex && integer(snap.anchor, exp.originAnchor)
        && snap.target === snap.anchor + 1 && snap.anchor <= exp.lastProcessedDraw && timestamp(snap.createdAt));
      const decision = state.decisions.filter(item => item.cutoff <= snap.anchor).at(-1);
      requireValue(decision && decision.window === snap.window && snap.anchor - decision.cutoff < 20);
      fields(snap.source, ['kind', 'url', 'fetchedAt', 'generation', 'digest']);
      requireValue(snap.source.kind === 'canonical' && (snap.source.url === null || typeof snap.source.url === 'string')
        && timestamp(snap.source.fetchedAt) && integer(snap.source.generation, 1) && digest(snap.source.digest));
      fields(snap.arms, ARMS);
      for (const arm of ARMS) {
        requireValue(Array.isArray(snap.arms[arm]) && snap.arms[arm].length === 14);
        const comboNumbers = new Set();
        snap.arms[arm].forEach(line => {
          // The core preserves JSON metadata and legacy number order. Identity
          // belongs to comboNum, not the row's current position in its arm.
          requireValue(object(line) && integer(line.comboNum, 1) && !comboNumbers.has(line.comboNum)
            && (arm === 'learner' || line.comboNum <= 14) && typeof line.strategy === 'string'
            && (arm !== 'legacy' || line.strategy.trim().length > 0) && Array.isArray(line.numbers)
            && line.numbers.length === 6 && new Set(line.numbers).size === 6
            && line.numbers.every((number, i) => integer(number, 1)
              && number <= 37 && (arm === 'legacy' || i === 0 || number > line.numbers[i - 1]))
            && integer(line.strong, 1) && line.strong <= 7);
          comboNumbers.add(line.comboNum);
        });
      }
      snapshots.set(snap.target, snap);
    }
    const observations = new Map();
    for (const observation of state.observations) {
      fields(observation, ['experimentId', 'target', 'draw', 'kind', 'scores']);
      fields(observation.draw, ['drawNumber', 'date', 'numbers', 'strong']);
      requireValue(observation.experimentId === exp.id && integer(observation.target, exp.originAnchor + 1)
        && observation.target <= exp.lastProcessedDraw && observation.draw.drawNumber === observation.target
        && equal(core.validateHistory([observation.draw]).rows, [observation.draw])
        && ['eligible', 'same-day-or-late', 'missing', 'conflict'].includes(observation.kind));
      const snap = snapshots.get(observation.target);
      if (observation.kind === 'missing' || observation.kind === 'conflict') {
        requireValue(observation.scores === null && (observation.kind !== 'missing' || !snap));
      } else {
        requireValue(Boolean(snap));
        fields(observation.scores, ARMS);
        ARMS.forEach(arm => requireValue(equal(observation.scores[arm], core.scoreArm(snap.arms[arm], observation.draw))));
      }
      observations.set(observation.target, observation);
    }
    for (const prize of state.prizes) {
      fields(prize, ['experimentId', 'target', 'drawDigest', 'checkedAt', 'arms']);
      requireValue(prize.experimentId === exp.id && integer(prize.target, exp.originAnchor + 1)
        && snapshots.has(prize.target) && observations.has(prize.target) && digest(prize.drawDigest) && timestamp(prize.checkedAt));
      fields(prize.arms, ARMS); ARMS.forEach(arm => requireValue(object(prize.arms[arm])));
    }
    state.faults.forEach(fault => {
      fields(fault, ['target', 'code']); requireValue((fault.target === null || integer(fault.target, exp.originAnchor + 1)) && text(fault.code));
    });
  }
  async function validateDigests(state) {
    const observations = new Map(state.observations.map(item => [item.target, item]));
    for (const prize of state.prizes) {
      requireValue(prize.drawDigest === await core.hashHistory([observations.get(prize.target).draw]), 'DRAW_DIGEST_MISMATCH');
    }
  }
  function normalizeError(cause) {
    if (cause && cause.code && typeof cause.code === 'string') return cause;
    return error(cause && cause.name === 'QuotaExceededError' ? 'STORAGE_QUOTA'
      : cause && cause.name === 'AbortError' ? 'STORAGE_ABORTED' : 'STORAGE_FAILED');
  }
  function merge(current, change) {
    fields(change, ['experiment', ...RECORDS]);
    requireValue(object(change.experiment));
    const next = { ...current, experiment: change.experiment };
    for (const name of RECORDS) {
      requireValue(Array.isArray(change[name]));
      const records = new Map(current[name].map(record => [recordKey(name, record), record]));
      for (const record of change[name]) {
        requireValue(object(record));
        const key = recordKey(name, record);
        const prior = records.get(key);
        if (prior && !equal(prior, record)) {
          requireValue(name === 'prizes' && prior.drawDigest === record.drawDigest, 'IMMUTABLE_CONFLICT');
        }
        records.set(key, record);
      }
      next[name] = Array.from(records.values()).sort((a, b) => {
        const ka = storedKey(name, storageRecord(name, a, change.experiment.id));
        const kb = storedKey(name, storageRecord(name, b, change.experiment.id));
        return runtime.indexedDB.cmp(ka, kb);
      });
    }
    if (next.experiment.status !== 'active') {
      requireValue(next.snapshots.length === current.snapshots.length,
        next.experiment.status === 'conflict' ? 'EXPERIMENT_CONFLICT' : 'EXPERIMENT_PAUSED');
    }
    if (current.experiment) {
      const exp = current.experiment;
      for (const key of ['id', 'protocolVersion', 'coreVersion', 'seedHex', 'originAnchor']) {
        requireValue(exp[key] === next.experiment[key], 'IMMUTABLE_CONFLICT');
      }
      requireValue(next.experiment.lastProcessedDraw >= exp.lastProcessedDraw
        && next.experiment.sourceCutoff >= exp.sourceCutoff, 'IMMUTABLE_CONFLICT');
      if (exp.status !== 'active') {
        const code = exp.status === 'conflict' ? 'EXPERIMENT_CONFLICT' : 'EXPERIMENT_PAUSED';
        requireValue(next.experiment.status === exp.status || (exp.status === 'paused' && next.experiment.status === 'conflict'), code);
        requireValue(next.snapshots.length === current.snapshots.length, code);
      }
    }
    validateState(next);
    next.revision = current.revision + (equal(current, next) ? 0 : 1);
    return next;
  }

  async function open({ onVersionChange = () => {} } = {}) {
    const db = await new Promise((resolve, reject) => {
      let blocked = false;
      let request;
      try { request = runtime.indexedDB.open(DATABASE); }
      catch (cause) { reject(normalizeError(cause)); return; }
      request.onupgradeneeded = event => {
        if (event.oldVersion === 0) NAMES.forEach(name => request.result.createObjectStore(name, { keyPath: KEYS[name] }));
      };
      request.onerror = () => reject(normalizeError(request.error));
      request.onblocked = () => { blocked = true; reject(error('STORAGE_BLOCKED')); };
      request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    });
    let closed = false;
    const close = () => { closed = true; db.close(); };
    db.onversionchange = () => { close(); onVersionChange(); };
    function assertOpen() { if (closed) throw error('STORE_CLOSED'); }
    async function read() {
      assertOpen();
      const names = Array.from(db.objectStoreNames);
      // Unknown schemas may legally use names such as "__proto__". Preserve them
      // as data properties instead of letting object prototype setters consume them.
      const raw = { schemaVersion: db.version, stores: Object.create(null), keyPaths: Object.create(null),
        autoIncrement: Object.create(null), keys: Object.create(null) };
      if (names.length) await new Promise((resolve, reject) => {
        const tx = db.transaction(names, 'readonly');
        for (const name of names) {
          const store = tx.objectStore(name);
          raw.keyPaths[name] = store.keyPath; raw.autoIncrement[name] = store.autoIncrement;
          store.getAll().onsuccess = event => { raw.stores[name] = event.target.result; };
          store.getAllKeys().onsuccess = event => { raw.keys[name] = event.target.result; };
        }
        tx.oncomplete = resolve; tx.onabort = () => reject(normalizeError(tx.error));
      });
      try {
        requireValue(db.version === 1 && equal(names.slice().sort(), NAMES.slice().sort()), 'UNKNOWN_SCHEMA');
        NAMES.forEach(name => {
          requireValue(equal(raw.keyPaths[name], KEYS[name]) && !raw.autoIncrement[name], 'UNKNOWN_SCHEMA');
          raw.stores[name].forEach((record, index) => requireValue(equal(storedKey(name, record), raw.keys[name][index])));
        });
        const state = empty();
        requireValue(raw.stores.meta.length <= 1);
        if (raw.stores.meta.length) {
          const meta = raw.stores.meta[0]; fields(meta, ['key', 'revision', 'experiment']);
          requireValue(meta.key === 'active'); state.revision = meta.revision; state.experiment = meta.experiment;
        }
        for (const name of RECORDS) state[name] = raw.stores[name].map(record => {
          requireValue(state.experiment && record.experimentId === state.experiment.id);
          const copy = { ...record };
          if (name === 'decisions' || name === 'faults') delete copy.experimentId;
          if (name === 'faults') {
            requireValue(copy.targetKey === (copy.target === null ? 'global' : copy.target)); delete copy.targetKey;
          }
          return copy;
        });
        validateState(state); await validateDigests(state); return state;
      } catch (cause) {
        return { ...empty(), compatibility: 'readonly', incompatibilityCodes: [cause.code || 'MALFORMED_RECORD'], rawBackup: raw };
      }
    }
    async function mutate(expectedRevision, build, signal) {
      assertOpen();
      if (signal && signal.aborted) throw error('STORAGE_ABORTED');
      const current = await read();
      if (current.compatibility !== 'compatible') throw error('INCOMPATIBLE_STORE');
      requireValue(integer(expectedRevision) && current.revision === expectedRevision, 'REVISION_CONFLICT');
      const next = build(current);
      await validateDigests(next);
      assertOpen();
      if (signal && signal.aborted) throw error('STORAGE_ABORTED');
      // No promises are awaited after this point. The revision and every immutable
      // key are re-read on this one transaction before any write is scheduled.
      return new Promise((resolve, reject) => {
        let failure;
        let tx;
        const abort = cause => {
          failure = failure || normalizeError(cause);
          try { tx.abort(); } catch (_) { /* Already aborted by the browser. */ }
        };
        try {
          tx = db.transaction(NAMES, 'readwrite');
          const cancel = () => abort(error('STORAGE_ABORTED'));
          if (signal) signal.addEventListener('abort', cancel, { once: true });
          const cleanup = () => { if (signal) signal.removeEventListener('abort', cancel); };
          tx.oncomplete = () => { cleanup(); resolve(next); };
          tx.onabort = () => { cleanup(); reject(failure || normalizeError(tx.error || error('STORAGE_ABORTED'))); };
          const request = tx.objectStore('meta').get('active');
          request.onsuccess = () => {
            try {
              const meta = request.result || { key: 'active', revision: 0, experiment: null };
              requireValue(meta.revision === expectedRevision, 'REVISION_CONFLICT');
              requireValue(equal(meta.experiment, current.experiment), 'INCOMPATIBLE_STORE');
              let remaining = RECORDS.length;
              const existing = {};
              for (const name of RECORDS) {
                const lookup = tx.objectStore(name).getAll();
                lookup.onsuccess = () => {
                  try {
                    existing[name] = lookup.result;
                    // Also fence unexpected out-of-band writes that did not update meta.
                    requireValue(equal(existing[name], current[name].map(record => storageRecord(name, record, current.experiment && current.experiment.id))), 'INCOMPATIBLE_STORE');
                    remaining -= 1;
                    if (remaining) return;
                    if (next.revision === current.revision) return;
                    for (const table of RECORDS) {
                      const old = new Map(existing[table].map(record => [stable(storedKey(table, record)), record]));
                      for (const record of next[table]) {
                        const stored = storageRecord(table, record, next.experiment.id);
                        const prior = old.get(stable(storedKey(table, stored)));
                        if (!prior) tx.objectStore(table).add(stored);
                        else if (!equal(prior, stored)) {
                          requireValue(table === 'prizes' && prior.drawDigest === stored.drawDigest, 'IMMUTABLE_CONFLICT');
                          tx.objectStore(table).put(stored);
                        }
                      }
                    }
                    tx.objectStore('meta').put({ key: 'active', revision: next.revision, experiment: next.experiment });
                  } catch (cause) { abort(cause); }
                };
              }
            } catch (cause) { abort(cause); }
          };
        } catch (cause) { if (tx) abort(cause); else reject(normalizeError(cause)); }
      });
    }
    return {
      close, read,
      commit(expectedRevision, transition, { signal } = {}) {
        // Copy at call time: caller mutation while digesting must not change a write.
        let change;
        try { jsonValue(transition); change = runtime.structuredClone(transition); }
        catch (cause) { return Promise.reject(normalizeError(cause)); }
        return mutate(expectedRevision, current => merge(current, change), signal);
      },
      setPaused(expectedRevision, paused) {
        return mutate(expectedRevision, current => {
          requireValue(typeof paused === 'boolean', 'INVALID_PAUSE');
          requireValue(Boolean(current.experiment), 'NO_EXPERIMENT');
          requireValue(current.experiment.status !== 'conflict', 'EXPERIMENT_CONFLICT');
          const status = paused ? 'paused' : 'active';
          return { ...current, revision: current.revision + Number(current.experiment.status !== status),
            experiment: { ...current.experiment, status } };
        });
      },
    };
  }
  return { open, validateState };
}));
