(function attachLearningReport(root, factory) {
  const commonJS = typeof module === 'object' && module.exports;
  const core = root.LottoLearningCore || (commonJS ? require('./lotto-learning-core.js') : null);
  const store = root.LottoLearningStore || (commonJS ? require('./lotto-learning-store.js') : null);
  const api = factory(core, store);
  if (commonJS) module.exports = api;
  root.LottoLearningReport = api;
}(typeof self !== 'undefined' ? self : globalThis, function createLearningReport(core, store) {
  'use strict';

  const ARMS = ['learner', 'legacy', 'random'];
  const KINDS = ['eligible', 'same-day-or-late', 'missing', 'conflict'];
  const MAX_TARGETS = 10000;
  const MAX_BYTES = 25 * 1024 * 1024;
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  function requireValue(value, code = 'INVALID_BACKUP') {
    if (!value) throw Object.assign(new Error(code), { code });
  }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function fields(value, expected) {
    requireValue(object(value) && Object.keys(value).sort().join('|') === expected.slice().sort().join('|'));
  }
  function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    return Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max;
  }
  function utcDate(value) {
    requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), 'INVALID_TIMESTAMP');
    const date = new Date(value);
    requireValue(Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1
      && date.toISOString() === (value.length === 20 ? value.replace('Z', '.000Z') : value), 'INVALID_TIMESTAMP');
    return date;
  }
  function localDateAt(utcIso) {
    const parts = Object.fromEntries(dateFormatter.formatToParts(utcDate(utcIso)).map(part => [part.type, part.value]));
    requireValue(/^\d{1,4}$/.test(parts.year), 'INVALID_TIMESTAMP');
    return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
  }
  function validateDraw(draw) {
    fields(draw, ['drawNumber', 'date', 'numbers', 'strong']);
    requireValue(integer(draw.drawNumber, 1) && integer(draw.strong, 1, 7)
      && Array.isArray(draw.numbers) && draw.numbers.length === 6
      && draw.numbers.every((n, i) => integer(n, 1, 37) && (i === 0 || n > draw.numbers[i - 1]))
      && typeof draw.date === 'string' && /^\d{4}-\d\d-\d\d$/.test(draw.date)
      && core.parseLearningDate(draw.date) === draw.date, 'INVALID_DRAW');
  }
  function classifySnapshot(snapshot, draw) {
    validateDraw(draw);
    requireValue(snapshot && integer(snapshot.target, 1) && snapshot.target === draw.drawNumber, 'TARGET_MISMATCH');
    return localDateAt(snapshot.createdAt) < draw.date ? 'eligible' : 'same-day-or-late';
  }
  function modeOf(options = {}) {
    const mode = options.mode === undefined ? 'live' : options.mode;
    requireValue(['live', 'historical', 'readonly-import'].includes(mode), 'INVALID_REPORT_MODE');
    return mode;
  }
  // This copy also rejects unsafe in-memory values before any derived scores are
  // replaced. Parsed backups additionally pass the duplicate-key scanner below.
  function copyJSON(value) {
    const seen = new Set();
    function visit(item, depth) {
      requireValue(depth <= 100, 'BACKUP_TOO_DEEP');
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
      if (typeof item === 'number') { requireValue(Number.isFinite(item)); return item; }
      requireValue(item && typeof item === 'object' && !seen.has(item));
      requireValue(Array.isArray(item) || [Object.prototype, null].includes(Object.getPrototypeOf(item)));
      seen.add(item);
      const result = Array.isArray(item) ? [] : {};
      if (Array.isArray(item)) requireValue(Object.keys(item).length === item.length);
      for (const key of Object.keys(item)) {
        requireValue(!['__proto__', 'prototype', 'constructor'].includes(key));
        result[key] = visit(item[key], depth + 1);
      }
      seen.delete(item); return result;
    }
    return visit(value, 0);
  }
  function checkLimits(state) {
    fields(state, ['compatibility', 'incompatibilityCodes', 'rawBackup', 'revision', 'experiment',
      'decisions', 'snapshots', 'observations', 'prizes', 'faults']);
    requireValue(state.compatibility === 'compatible' && Array.isArray(state.incompatibilityCodes)
      && state.incompatibilityCodes.length === 0 && state.rawBackup === null);
    for (const name of ['decisions', 'snapshots', 'observations', 'prizes', 'faults']) {
      requireValue(Array.isArray(state[name]) && state[name].length <= MAX_TARGETS, 'TARGET_LIMIT');
    }
    const exp = state.experiment;
    requireValue(exp === null || object(exp));
    if (exp === null) return;
    requireValue(integer(exp.originAnchor, 1) && integer(exp.lastProcessedDraw, exp.originAnchor)
      && exp.lastProcessedDraw - exp.originAnchor <= MAX_TARGETS, 'TARGET_LIMIT');
    const targets = new Set();
    for (const name of ['snapshots', 'observations', 'prizes', 'faults']) {
      for (const item of state[name]) {
        requireValue(object(item));
        if (name === 'faults' && item.target === null) continue;
        requireValue(integer(item.target, exp.originAnchor + 1) && item.target - exp.originAnchor <= MAX_TARGETS, 'TARGET_LIMIT');
        targets.add(item.target);
      }
    }
    requireValue(targets.size <= MAX_TARGETS, 'TARGET_LIMIT');
  }
  function scoreArms(arms, draw) {
    return Object.fromEntries(ARMS.map(arm => [arm, core.scoreArm(arms[arm], draw)]));
  }
  function validateDeclaredScores(scores) {
    fields(scores, ARMS);
    for (const arm of ARMS) {
      const score = scores[arm];
      fields(score, ['rows', 'win3Plus', 'win4Plus', 'win5Plus', 'win6', 'strongMatches']);
      requireValue(['win3Plus', 'win4Plus', 'win5Plus', 'win6'].every(key => integer(score[key], 0, 1))
        && integer(score.strongMatches, 0, 14) && Array.isArray(score.rows) && score.rows.length === 14);
      score.rows.forEach(row => {
        fields(row, ['comboNum', 'regularMatches', 'strongMatch']);
        requireValue(integer(row.comboNum, 1) && integer(row.regularMatches, 0, 6) && typeof row.strongMatch === 'boolean');
      });
    }
  }
  function validateWinnings(value) {
    fields(value, ['status', 'totalPrizeIls', 'winningCombinationCount', 'sourceUrl', 'lines']);
    requireValue(['available', 'unavailable'].includes(value.status) && Array.isArray(value.lines) && value.lines.length === 14);
    requireValue(value.sourceUrl === null || typeof value.sourceUrl === 'string');
    let sum = 0; let winners = 0;
    value.lines.forEach(line => {
      fields(line, ['status', 'tierKey', 'prizeIls']);
      requireValue(line.tierKey === null || (typeof line.tierKey === 'string' && /^[0-6](?:\+strong)?$/.test(line.tierKey)));
      if (value.status === 'unavailable') requireValue(line.status === 'unavailable' && line.tierKey === null && line.prizeIls === null);
      else if (line.status === 'no-prize') requireValue(line.prizeIls === null);
      else if (line.status === 'not-distributed') requireValue(line.tierKey !== null && line.prizeIls === 0);
      else {
        requireValue(line.status === 'won' && line.tierKey !== null && integer(line.prizeIls, 1));
        sum += line.prizeIls; winners++;
        requireValue(Number.isSafeInteger(sum));
      }
    });
    if (value.status === 'unavailable') requireValue(value.totalPrizeIls === null && value.winningCombinationCount === null && value.sourceUrl === null);
    else requireValue(integer(value.totalPrizeIls) && value.totalPrizeIls === sum && value.winningCombinationCount === winners);
  }
  function preparedState(input) {
    checkLimits(input);
    const state = copyJSON(input);
    const snapshots = new Map(state.snapshots.map(snapshot => [snapshot.target, snapshot]));
    for (const observation of state.observations) {
      requireValue(KINDS.includes(observation.kind));
      const snapshot = snapshots.get(observation.target);
      if (observation.kind === 'eligible' || observation.kind === 'same-day-or-late') {
        validateDeclaredScores(observation.scores);
        requireValue(Boolean(snapshot));
        observation.kind = classifySnapshot(snapshot, observation.draw);
        observation.scores = scoreArms(snapshot.arms, observation.draw);
      }
    }
    store.validateState(state);
    state.prizes.forEach(prize => ARMS.forEach(arm => validateWinnings(prize.arms[arm])));
    return state;
  }
  function buildObservations(input, rows) {
    const state = preparedState(input);
    requireValue(state.experiment, 'NO_EXPERIMENT');
    requireValue(Array.isArray(rows));
    rows.forEach(validateDraw);
    const canonical = core.validateHistory(rows).rows;
    const exp = state.experiment;
    const cutoff = canonical.length ? canonical.at(-1).drawNumber : exp.lastProcessedDraw;
    requireValue(cutoff - exp.originAnchor <= MAX_TARGETS, 'TARGET_LIMIT');
    const prior = new Map(state.observations.map(item => [item.target, item]));
    const snapshots = new Map(state.snapshots.map(item => [item.target, item]));
    const faults = []; const observations = [];
    for (const draw of canonical) {
      const saved = prior.get(draw.drawNumber);
      if (saved && (saved.draw.date !== draw.date || saved.draw.strong !== draw.strong
        || saved.draw.numbers.some((number, i) => number !== draw.numbers[i]))) {
        faults.push({ target: draw.drawNumber, code: 'DRAW_CONFLICT' });
      }
      if (draw.drawNumber <= exp.lastProcessedDraw) continue;
      const snapshot = snapshots.get(draw.drawNumber);
      observations.push({ experimentId: exp.id, target: draw.drawNumber, draw,
        kind: snapshot ? classifySnapshot(snapshot, draw) : 'missing', scores: snapshot ? scoreArms(snapshot.arms, draw) : null });
    }
    return { observations, faults };
  }
  function evaluateEvidenceBlock(observations, k, options) {
    const mode = modeOf(options);
    requireValue(integer(k, 1, MAX_TARGETS / 200), 'INVALID_BLOCK');
    requireValue(Array.isArray(observations) && observations.length <= 200, 'INVALID_BLOCK');
    const ordered = observations.slice().sort((a, b) => a.target - b.target);
    requireValue(ordered.every((item, i) => integer(item.target, 1) && KINDS.includes(item.kind)
      && (i === 0 || item.target > ordered[i - 1].target)), 'INVALID_BLOCK');
    const eligible = ordered.filter(item => item.kind === 'eligible');
    eligible.forEach(item => requireValue(item.scores && ARMS.every(arm => item.scores[arm]
      && integer(item.scores[arm].win3Plus, 0, 1)), 'INVALID_BLOCK'));
    const n = observations.length; const eligibleCount = eligible.length;
    const clean = n === 200 && eligibleCount === 200 && ordered.at(-1).target - ordered[0].target === 199;
    const alpha = 0.05 / (2 * k * (k + 1));
    const bounded = clean && mode === 'live' && !(options && options.suppressEvidence);
    const paired = Object.fromEntries(['legacy', 'random'].map(arm => {
      const meanDifference = eligibleCount ? eligible.reduce((sum, o) => sum + o.scores.learner.win3Plus - o.scores[arm].win3Plus, 0) / eligibleCount : null;
      return [arm, { meanDifference, lowerBound: bounded ? Math.max(-1, meanDifference - Math.sqrt(2 * Math.log(1 / alpha) / 200)) : null }];
    }));
    const status = n < 200 ? 'insufficient' : !bounded ? 'descriptive'
      : Object.values(paired).every(pair => pair.lowerBound > 0) ? 'period-evidence' : 'no-clear-advantage';
    return { k, n, eligibleCount, status, alpha, paired };
  }
  function aggregate(observations, originAnchor, lastProcessedDraw, prizes, faults, mode, suppressEvidence) {
    const byTarget = new Map(observations.map(o => [o.target, o]));
    const faulted = new Set(faults.filter(f => f.target !== null).map(f => f.target));
    const ordered = [];
    for (let target = originAnchor + 1; target <= lastProcessedDraw; target++) {
      const observation = byTarget.get(target) || { target, kind: 'missing', scores: null };
      ordered.push(faulted.has(target) ? { ...observation, kind: 'conflict', scores: null } : observation);
    }
    const eligible = ordered.filter(o => o.kind === 'eligible');
    const exclusions = Object.fromEntries(KINDS.slice(1).map(kind => [kind, ordered.filter(o => o.kind === kind).length]));
    const arms = Object.fromEntries(ARMS.map(arm => {
      const sampleCount = eligible.length; const winCount = eligible.reduce((sum, o) => sum + o.scores[arm].win3Plus, 0);
      const secondary = {};
      for (const outcome of ['win4Plus', 'win5Plus', 'win6']) {
        const count = eligible.reduce((sum, o) => sum + o.scores[arm][outcome], 0);
        secondary[`${outcome}Count`] = count;
        secondary[`${outcome}Rate`] = sampleCount ? count / sampleCount : null;
      }
      // A draw can contribute up to fourteen matching rows, not one win.
      secondary.strongMatchCount = eligible.reduce((sum, o) => sum + o.scores[arm].strongMatches, 0);
      return [arm, { sampleCount, winCount, rate: sampleCount ? winCount / sampleCount : null, secondary }];
    }));
    const paired = Object.fromEntries(['legacy', 'random'].map(arm => [arm, { sampleCount: eligible.length,
      meanDifference: eligible.length ? (arms.learner.winCount - arms[arm].winCount) / eligible.length : null }]));
    const prizeMap = new Map(prizes.map(prize => [prize.target, prize]));
    const totals = Object.fromEntries(ARMS.map(arm => {
      let knownPrizeIls = 0; let knownCount = 0;
      ordered.forEach(o => {
        const prize = prizeMap.get(o.target);
        if (o.scores && prize && prize.arms[arm].status === 'available') {
          knownPrizeIls += prize.arms[arm].totalPrizeIls; knownCount++;
          requireValue(Number.isSafeInteger(knownPrizeIls), 'PRIZE_TOTAL_OVERFLOW');
        }
      });
      return [arm, { knownPrizeIls, knownCount, missingCount: ordered.length - knownCount }];
    }));
    const blocks = [];
    for (let i = 0; i < ordered.length; i += 200) blocks.push(evaluateEvidenceBlock(ordered.slice(i, i + 200), i / 200 + 1,
      { mode, suppressEvidence: suppressEvidence || faults.length > 0 }));
    return { mode, targetCount: ordered.length, arms, paired, exclusions, prizes: totals, blocks,
      verification: { digestValidation: 'syntax-only', sourceAuthenticity: 'unverified', prizeAuthenticity: 'unverified' } };
  }
  function summarizeExperiment(input, options) {
    const mode = modeOf(options); const state = preparedState(input); const exp = state.experiment;
    return aggregate(state.observations, exp ? exp.originAnchor : 0, exp ? exp.lastProcessedDraw : 0,
      state.prizes, state.faults, mode, exp && exp.status === 'conflict');
  }
  function summarizeHistoricalReplay(replay) {
    requireValue(replay && replay.mode === 'historical' && replay.sampleCount === 200
      && replay.seed === core.HISTORICAL_SEED && Array.isArray(replay.targets) && replay.targets.length === 200, 'INVALID_REPLAY');
    const targets = copyJSON(replay.targets);
    const observations = targets.map((item, index) => {
      validateDraw(item.draw);
      requireValue(item.target === item.draw.drawNumber && (index === 0 || item.target === targets[index - 1].target + 1), 'INVALID_REPLAY');
      fields(item.arms, ARMS);
      ARMS.forEach(arm => requireValue(Array.isArray(item.arms[arm]) && item.arms[arm].length === 14, 'INVALID_REPLAY'));
      return { target: item.target, kind: 'eligible', scores: scoreArms(item.arms, item.draw) };
    });
    return aggregate(observations, targets[0].target - 1, targets.at(-1).target, [], [], 'historical', true);
  }
  // JSON.parse alone silently accepts repeated keys. Scan grammar first, keeping
  // decoded keys per object so escaped aliases cannot bypass duplicate rejection.
  function parseBackup(json) {
    requireValue(typeof json === 'string');
    requireValue(json.length <= MAX_BYTES && new TextEncoder().encode(json).byteLength <= MAX_BYTES, 'BACKUP_TOO_LARGE');
    let at = 0;
    const whitespace = () => { while (/[\t\n\r ]/.test(json[at] || '\0')) at++; };
    function string() {
      const start = at++; let escaped = false;
      while (at < json.length) {
        const char = json[at++];
        if (!escaped && char === '"') return JSON.parse(json.slice(start, at));
        if (!escaped && char === '\\') escaped = true; else escaped = false;
      }
      requireValue(false);
    }
    function value(depth) {
      requireValue(depth <= 100, 'BACKUP_TOO_DEEP'); whitespace();
      const char = json[at];
      if (char === '"') { string(); return; }
      if (char === '{' || char === '[') {
        const isObject = char === '{'; const end = isObject ? '}' : ']'; const keys = new Set();
        at++; whitespace(); if (json[at] === end) { at++; return; }
        while (at < json.length) {
          if (isObject) {
            requireValue(json[at] === '"'); const key = string();
            requireValue(!keys.has(key), 'DUPLICATE_JSON_KEY');
            requireValue(!['__proto__', 'prototype', 'constructor'].includes(key), 'UNSAFE_JSON_KEY'); keys.add(key);
            whitespace(); requireValue(json[at++] === ':');
          }
          value(depth + 1); whitespace();
          if (json[at] === end) { at++; return; }
          requireValue(json[at++] === ','); whitespace();
        }
        requireValue(false);
      }
      const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(json.slice(at));
      requireValue(match); at += match[0].length;
    }
    try { value(0); whitespace(); requireValue(at === json.length); return JSON.parse(json); }
    catch (cause) { if (cause.code) throw cause; requireValue(false); }
  }
  function exportBackup(state) {
    if (state && state.compatibility === 'readonly') {
      requireValue(state.rawBackup !== null && state.rawBackup !== undefined);
      return typeof state.rawBackup === 'string' ? state.rawBackup : JSON.stringify(state.rawBackup);
    }
    preparedState(state);
    return JSON.stringify({ schemaVersion: 1, protocolVersion: core.PROTOCOL_VERSION, exportedAt: new Date().toISOString(), state });
  }
  function readBackup(json) {
    try {
      const parsed = parseBackup(json);
      requireValue(parsed && parsed.schemaVersion === 1 && parsed.protocolVersion === core.PROTOCOL_VERSION, 'UNSUPPORTED_BACKUP');
      fields(parsed, ['schemaVersion', 'protocolVersion', 'exportedAt', 'state']); utcDate(parsed.exportedAt);
      const state = preparedState(parsed.state);
      return { mode: 'readonly-import', state, report: summarizeExperiment(state, { mode: 'readonly-import' }) };
    } catch (cause) { if (cause.code) throw cause; requireValue(false); }
  }
  return { localDateAt, classifySnapshot, buildObservations, evaluateEvidenceBlock, summarizeExperiment,
    summarizeHistoricalReplay, exportBackup, readBackup };
}));
