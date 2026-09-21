(function attachLottoLearningCore(root, factory) {
  const strategyCore = root.LottoStrategyCore
    || (typeof module === 'object' && module.exports ? require('./lotto-strategy-core.js') : null);
  const api = factory(strategyCore, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LottoLearningCore = api;
}(typeof self !== 'undefined' ? self : globalThis, function createLottoLearningCore(
  LottoStrategyCore,
  runtime,
) {
  'use strict';

  const PROTOCOL_VERSION = 'learning-experiment-v1';
  const LEGACY_COMPLETION_VERSION = 'frequency-fill-v1';
  const CORE_VERSION = `${LottoStrategyCore.ALGORITHM_VERSION}:${LottoStrategyCore.CONSTRAINT_VERSION}:legacy-${LEGACY_COMPLETION_VERSION}`;
  const RANDOM_ALGORITHM_VERSION = 'fnv1a32-xorshift32-rejection-fisher-yates-v1';
  const HISTORICAL_SEED = 'learning-history-v1';
  const POLICY_INTERVAL = 20;
  const WINDOWS = Object.freeze([100, 200, 500]);
  const DAY_MILLISECONDS = 86400000;
  const EXCEL_EPOCH_MILLISECONDS = Date.UTC(1899, 11, 30);

  function codedError(code, message = code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function decimalInteger(value) {
    if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!/^-?\d+$/.test(text)) return null;
    const number = Number(text);
    return Number.isSafeInteger(number) ? number : null;
  }

  function calendarDate(year, month, day) {
    if (!Number.isInteger(year) || year < 1 || year > 9999
      || !Number.isInteger(month) || month < 1 || month > 12
      || !Number.isInteger(day) || day < 1 || day > 31) {
      throw codedError('INVALID_DATE');
    }
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day) {
      throw codedError('INVALID_DATE');
    }
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function parseLearningDate(value) {
    const integer = decimalInteger(value);
    if (integer !== null) {
      if (integer < 20000 || integer > 80000) throw codedError('INVALID_DATE');
      return new Date(EXCEL_EPOCH_MILLISECONDS + integer * DAY_MILLISECONDS)
        .toISOString().slice(0, 10);
    }
    if (typeof value !== 'string') throw codedError('INVALID_DATE');
    const text = value.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const dayFirst = /^(\d{1,2})([/.\-])(\d{1,2})\2(\d{4})$/.exec(text);
    if (dayFirst) {
      return calendarDate(Number(dayFirst[4]), Number(dayFirst[3]), Number(dayFirst[1]));
    }
    throw codedError('INVALID_DATE');
  }

  function normalizeHistoricalDraw(row) {
    if (!row || typeof row !== 'object' || !Array.isArray(row.numbers)
      || row.numbers.length !== 6) {
      throw codedError('INVALID_DRAW');
    }
    const drawNumber = decimalInteger(row.drawNumber);
    const numbers = row.numbers.map(decimalInteger);
    const strong = decimalInteger(row.strong);
    if (drawNumber === null || drawNumber <= 0
      || numbers.some(number => number === null || number < 1 || number > 37)
      || new Set(numbers).size !== 6
      || strong === null || strong < 1 || strong > 8) {
      throw codedError('INVALID_DRAW');
    }
    let date;
    try {
      date = parseLearningDate(row.date);
    } catch (error) {
      throw codedError('INVALID_DRAW', error.message);
    }
    return {
      drawNumber,
      date,
      numbers: numbers.slice().sort((a, b) => a - b),
      strong,
    };
  }

  function normalizeHistory(inputRows) {
    if (!Array.isArray(inputRows)) throw codedError('INVALID_DRAW');
    const rows = inputRows.map(normalizeHistoricalDraw)
      .sort((first, second) => first.drawNumber - second.drawNumber);
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      if (current.drawNumber !== previous.drawNumber + 1 || current.date < previous.date) {
        throw codedError('INVALID_DRAW');
      }
    }
    let lastHistoricalIndex = -1;
    rows.forEach((row, index) => {
      if (row.strong === 8) lastHistoricalIndex = index;
    });
    const excludedHistoricalCount = lastHistoricalIndex + 1;
    return { rows, excludedHistoricalCount };
  }

  function validateHistory(inputRows) {
    const normalized = normalizeHistory(inputRows);
    const { excludedHistoricalCount } = normalized;
    const rows = normalized.rows;
    const retainedRows = rows.slice(excludedHistoricalCount);
    if (retainedRows.some(row => row.strong < 1 || row.strong > 7)) {
      throw codedError('INVALID_DRAW');
    }
    return { rows: retainedRows, excludedHistoricalCount };
  }

  function canonicalHistory(rows) {
    const canonicalRows = normalizeHistory(rows).rows;
    return JSON.stringify(canonicalRows.map(draw => [
      draw.drawNumber,
      draw.date,
      ...draw.numbers,
      draw.strong,
    ]));
  }

  async function hashHistory(rows) {
    const subtle = runtime.crypto && runtime.crypto.subtle;
    if (!subtle || typeof runtime.TextEncoder !== 'function') {
      throw codedError('WEB_CRYPTO_UNAVAILABLE');
    }
    const bytes = new runtime.TextEncoder().encode(canonicalHistory(rows));
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function hashSeed(seedText) {
    if (typeof seedText !== 'string') throw codedError('INVALID_SEED');
    const bytes = new runtime.TextEncoder().encode(seedText);
    let hash = 0x811c9dc5;
    bytes.forEach(byte => {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193);
    });
    return (hash >>> 0) || 0x6d2b79f5;
  }

  // V1 random algorithm: FNV-1a UTF-8 seed -> xorshift32 -> rejection-bounded
  // integers -> Fisher-Yates. This is local and does not consume Math.random state.
  function createRandom(seedText) {
    let state = hashSeed(seedText);
    function nextUint32() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    }
    function bounded(bound) {
      if (!Number.isInteger(bound) || bound <= 0) throw codedError('INVALID_RANDOM_BOUND');
      const limit = Math.floor(0x100000000 / bound) * bound;
      let value;
      do value = nextUint32(); while (value >= limit);
      return value % bound;
    }
    return { bounded };
  }

  function shuffled(values, random) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = random.bounded(index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function normalizeGeneratedLines(lines, { allowDuplicateNumbers = false } = {}) {
    if (!Array.isArray(lines) || lines.length !== 14) {
      throw codedError('GENERATION_FAILED');
    }
    const comboNumbers = new Set();
    const numberKeys = new Set();
    return lines.map(line => {
      if (!line || typeof line !== 'object' || !Array.isArray(line.numbers)
        || line.numbers.length !== 6 || typeof line.strategy !== 'string') {
        throw codedError('GENERATION_FAILED');
      }
      const comboNum = decimalInteger(line.comboNum);
      const numbers = line.numbers.map(decimalInteger);
      const strong = decimalInteger(line.strong);
      if (comboNum === null || comboNum < 1 || comboNumbers.has(comboNum)
        || numbers.some(number => number === null || number < 1 || number > 37)
        || new Set(numbers).size !== 6 || strong === null || strong < 1 || strong > 7) {
        throw codedError('GENERATION_FAILED');
      }
      const sortedNumbers = numbers.slice().sort((a, b) => a - b);
      const key = sortedNumbers.join(',');
      if (!allowDuplicateNumbers && numberKeys.has(key)) {
        throw codedError('GENERATION_FAILED');
      }
      comboNumbers.add(comboNum);
      numberKeys.add(key);
      return { ...line, comboNum, numbers: sortedNumbers, strong };
    });
  }

  function completeLegacyLines(lines, trainingRows) {
    if (!Array.isArray(lines) || lines.length !== 14
      || !Array.isArray(trainingRows) || trainingRows.length !== 500) {
      throw codedError('GENERATION_FAILED');
    }
    const frequencies = Array(38).fill(0);
    trainingRows.forEach(draw => {
      draw.numbers.forEach(number => { frequencies[number] += 1; });
    });
    const frequencyRank = Array.from({ length: 37 }, (_, index) => index + 1)
      .sort((first, second) => frequencies[second] - frequencies[first] || first - second);
    const comboNumbers = new Set();
    return lines.map(line => {
      if (!line || typeof line !== 'object' || !Array.isArray(line.numbers)
        || line.numbers.length < 1 || line.numbers.length > 6
        || typeof line.strategy !== 'string' || line.strategy.trim().length === 0
        || !Number.isInteger(line.comboNum) || line.comboNum < 1 || line.comboNum > 14
        || comboNumbers.has(line.comboNum)
        || !Number.isInteger(line.strong) || line.strong < 1 || line.strong > 7
        || line.numbers.some(number => !Number.isInteger(number) || number < 1 || number > 37)
        || new Set(line.numbers).size !== line.numbers.length) {
        throw codedError('GENERATION_FAILED');
      }
      comboNumbers.add(line.comboNum);
      if (line.numbers.length === 6) return { ...line, numbers: line.numbers.slice() };
      const completedNumbers = line.numbers.slice();
      for (const number of frequencyRank) {
        if (!completedNumbers.includes(number)) completedNumbers.push(number);
        if (completedNumbers.length === 6) break;
      }
      return {
        ...line,
        strategy: `${line.strategy} • השלמה קבועה`,
        numbers: completedNumbers.sort((first, second) => first - second),
      };
    });
  }

  function generateRandomForm(seedText) {
    const random = createRandom(seedText);
    const sourceNumbers = Array.from({ length: 37 }, (_, index) => index + 1);
    const lines = [];
    const keys = new Set();
    let attempts = 0;
    while (lines.length < 14 && attempts < 1000) {
      attempts += 1;
      const numbers = shuffled(sourceNumbers, random).slice(0, 6).sort((a, b) => a - b);
      const key = numbers.join(',');
      if (keys.has(key)) continue;
      keys.add(key);
      lines.push({
        comboNum: lines.length + 1,
        strategy: 'random-v1',
        numbers,
        strong: 1,
      });
    }
    if (lines.length !== 14) throw codedError('GENERATION_FAILED');
    const strongDeck = shuffled([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7], random);
    lines.forEach((line, index) => { line.strong = strongDeck[index]; });
    return normalizeGeneratedLines(lines);
  }

  function normalizeWindow(window) {
    const value = decimalInteger(window);
    if (!WINDOWS.includes(value)) throw codedError('INVALID_WINDOW');
    return value;
  }

  function rowsThroughCutoff(rows, cutoff) {
    const cutoffNumber = decimalInteger(cutoff);
    if (cutoffNumber === null || cutoffNumber <= 0) throw codedError('INVALID_CUTOFF');
    return rows.filter(row => row.drawNumber <= cutoffNumber);
  }

  function generatedForms(newestFirstRows) {
    if (!LottoStrategyCore || typeof LottoStrategyCore.generateBaselineForms !== 'function') {
      throw codedError('STRATEGY_CORE_UNAVAILABLE');
    }
    try {
      return LottoStrategyCore.generateBaselineForms(newestFirstRows);
    } catch (error) {
      if (error && error.code) throw error;
      throw codedError('GENERATION_FAILED', error && error.message ? error.message : 'GENERATION_FAILED');
    }
  }

  function generatePolicyForm(inputRows, cutoff, window) {
    const rows = validateHistory(inputRows).rows;
    const windowSize = normalizeWindow(window);
    const eligibleRows = rowsThroughCutoff(rows, cutoff);
    if (eligibleRows.length < windowSize) throw codedError('INSUFFICIENT_HISTORY');
    const newestFirstRows = eligibleRows.slice(-windowSize).reverse();
    const baseline = generatedForms(newestFirstRows);
    return normalizeGeneratedLines(baseline && baseline.form2);
  }

  function buildArms(inputRows, cutoff, window, seedHex, mode) {
    if (mode !== 'live' && mode !== 'historical') throw codedError('INVALID_MODE');
    if (typeof seedHex !== 'string') throw codedError('INVALID_SEED');
    const rows = validateHistory(inputRows).rows;
    const eligibleRows = rowsThroughCutoff(rows, cutoff);
    if (eligibleRows.length < 500) throw codedError('INSUFFICIENT_HISTORY');
    const learner = generatePolicyForm(rows, cutoff, normalizeWindow(window));
    const legacyTrainingRows = eligibleRows.slice(-500);
    const legacyBaseline = generatedForms(legacyTrainingRows.slice().reverse());
    const legacy = completeLegacyLines(legacyBaseline && legacyBaseline.main, legacyTrainingRows);
    const cutoffNumber = decimalInteger(cutoff);
    const random = generateRandomForm(
      `${PROTOCOL_VERSION}|${mode}|${seedHex}|${cutoffNumber + 1}|random`,
    );
    return { learner, legacy, random };
  }

  function scoreArm(lines, draw) {
    const rows = lines.map(line => {
      const score = LottoStrategyCore.scoreLine(line, draw);
      return {
        comboNum: line.comboNum,
        regularMatches: score.regularMatches,
        strongMatch: score.strongMatch,
      };
    });
    const won = threshold => Number(rows.some(row => row.regularMatches >= threshold));
    return {
      rows,
      win3Plus: won(3),
      win4Plus: won(4),
      win5Plus: won(5),
      win6: won(6),
      strongMatches: rows.filter(row => row.strongMatch).length,
    };
  }

  function validateCounts(counts) {
    if (!counts || typeof counts !== 'object'
      || Object.keys(counts).length !== 3
      || WINDOWS.some(window => !Number.isInteger(counts[window])
        || counts[window] < 0 || counts[window] > 200)) {
      throw codedError('INVALID_DECISIONS');
    }
  }

  function selectWindow(counts, incumbent) {
    validateCounts(counts);
    const order = [500, 200, 100];
    const best = Math.max(...order.map(window => counts[window]));
    if (order.includes(incumbent) && counts[incumbent] === best) return incumbent;
    return order.find(window => counts[window] === best);
  }

  // Normalize the complete source for provenance, but exclude future rows BEFORE
  // choosing its modern suffix: even a later strong-8 row cannot alter this run.
  function cutoffHistory(inputRows, cutoff) {
    const normalized = normalizeHistory(inputRows).rows;
    if (!Number.isSafeInteger(cutoff) || !normalized.some(row => row.drawNumber === cutoff)) {
      throw codedError('INVALID_CUTOFF');
    }
    const source = rowsThroughCutoff(normalized, cutoff);
    return { source, rows: validateHistory(source).rows };
  }

  function createPolicyRun(rows, onProgress) {
    // This cache belongs to this copied, immutable-history calculation only.
    const forms = new Map();
    function policyForm(targetIndex, window) {
      const key = `${window}:${rows[targetIndex].drawNumber}`;
      if (!forms.has(key)) {
        if (targetIndex < 500) throw codedError('INSUFFICIENT_HISTORY');
        const training = rows.slice(targetIndex - window, targetIndex).reverse();
        const baseline = generatedForms(training);
        forms.set(key, normalizeGeneratedLines(baseline && baseline.form2));
      }
      return forms.get(key);
    }
    function evaluate(cutoff, incumbent) {
      const index = rows.findIndex(row => row.drawNumber === cutoff);
      if (index < 699) throw codedError('INSUFFICIENT_HISTORY');
      const counts = { 100: 0, 200: 0, 500: 0 };
      for (let targetIndex = index - 199; targetIndex <= index; targetIndex += 1) {
        for (const window of WINDOWS) {
          counts[window] += scoreArm(policyForm(targetIndex, window), rows[targetIndex]).win3Plus;
        }
        if (typeof onProgress === 'function' && ((targetIndex - index + 200) % 20 === 0)) {
          onProgress({ phase: 'selection', cutoff, completed: targetIndex - index + 200, total: 200 });
        }
      }
      return { cutoff, window: selectWindow(counts, incumbent), counts };
    }
    return { evaluate };
  }

  function evaluateDecision(inputRows, cutoff, incumbent = 500, onProgress) {
    const { rows } = cutoffHistory(inputRows, cutoff);
    return createPolicyRun(rows, onProgress).evaluate(cutoff, incumbent);
  }

  function validateDecisions(decisions, originAnchor, cutoff) {
    if (!Array.isArray(decisions)) throw codedError('INVALID_DECISIONS');
    let previous = null;
    decisions.forEach((decision, index) => {
      if (!decision || typeof decision !== 'object'
        || Object.keys(decision).some(key => !['cutoff', 'window', 'counts'].includes(key))
        || !Number.isSafeInteger(decision.cutoff)
        || (index === 0 && decision.cutoff !== originAnchor)
        || decision.cutoff < originAnchor || decision.cutoff > cutoff
        || (decision.cutoff - originAnchor) % POLICY_INTERVAL !== 0
        || (previous !== null && decision.cutoff <= previous)
        || !WINDOWS.includes(decision.window)) {
        throw codedError('INVALID_DECISIONS');
      }
      validateCounts(decision.counts);
      previous = decision.cutoff;
    });
  }

  function advanceInRun(rows, run, originAnchor, decisions, cutoff) {
    validateDecisions(decisions, originAnchor, cutoff);
    if (!Number.isSafeInteger(originAnchor) || originAnchor > cutoff) throw codedError('INVALID_CUTOFF');
    if (rows.findIndex(row => row.drawNumber === originAnchor) < 699) {
      throw codedError('INSUFFICIENT_HISTORY');
    }
    const existing = new Map(decisions.map(decision => [decision.cutoff, decision]));
    const result = [];
    let incumbent = 500;
    for (let boundary = originAnchor; boundary <= cutoff; boundary += POLICY_INTERVAL) {
      const saved = existing.get(boundary);
      if (saved && selectWindow(saved.counts, incumbent) !== saved.window) {
        throw codedError('INVALID_DECISIONS');
      }
      const decision = saved
        ? { cutoff: saved.cutoff, window: saved.window, counts: { ...saved.counts } }
        : run.evaluate(boundary, incumbent);
      result.push(decision);
      incumbent = decision.window;
    }
    return result;
  }

  function advancePolicy(inputRows, originAnchor, decisions, cutoff, onProgress) {
    const { rows } = cutoffHistory(inputRows, cutoff);
    return advanceInRun(rows, createPolicyRun(rows, onProgress), originAnchor, decisions, cutoff);
  }

  async function prepareAtCutoff(inputRows, options, onProgress) {
    const { originAnchor, decisions, cutoff, seedHex, mode, protocolVersion, coreVersion } = options || {};
    if ((protocolVersion !== undefined && protocolVersion !== PROTOCOL_VERSION)
      || (coreVersion !== undefined && coreVersion !== CORE_VERSION)) throw codedError('INVALID_VERSION');
    const { source, rows } = cutoffHistory(inputRows, cutoff);
    const updated = advanceInRun(rows, createPolicyRun(rows, onProgress), originAnchor, decisions, cutoff);
    const window = updated[updated.length - 1].window;
    const arms = buildArms(rows, cutoff, window, seedHex, mode);
    const digest = await hashHistory(source);
    return { decisions: updated, window, arms, digest, cutoff };
  }

  async function runHistoricalReplay(inputRows, onProgress) {
    const rows = validateHistory(inputRows).rows;
    if (rows.length < 900) throw codedError('INSUFFICIENT_HISTORY');
    const firstTargetIndex = rows.length - 200;
    const originAnchor = rows[firstTargetIndex - 1].drawNumber;
    const run = createPolicyRun(rows, onProgress);
    const decisions = advanceInRun(rows, run, originAnchor, [], rows[rows.length - 2].drawNumber);
    const targets = [];
    for (let index = firstTargetIndex; index < rows.length; index += 1) {
      const draw = rows[index];
      const decision = decisions[Math.floor((index - firstTargetIndex) / POLICY_INTERVAL)];
      const arms = buildArms(rows, rows[index - 1].drawNumber, decision.window, HISTORICAL_SEED, 'historical');
      const scores = Object.fromEntries(Object.entries(arms).map(([name, lines]) => [name, scoreArm(lines, draw)]));
      targets.push({ target: draw.drawNumber, draw, arms, scores });
      if (typeof onProgress === 'function') {
        onProgress({ phase: 'replay', completed: targets.length, total: 200, target: draw.drawNumber });
      }
    }
    return { mode: 'historical', sampleCount: 200, decisions, targets, seed: HISTORICAL_SEED };
  }

  return {
    PROTOCOL_VERSION,
    LEGACY_COMPLETION_VERSION,
    CORE_VERSION,
    RANDOM_ALGORITHM_VERSION,
    HISTORICAL_SEED,
    parseLearningDate,
    validateHistory,
    canonicalHistory,
    hashHistory,
    generateRandomForm,
    generatePolicyForm,
    buildArms,
    scoreArm,
    selectWindow,
    evaluateDecision,
    advancePolicy,
    prepareAtCutoff,
    runHistoricalReplay,
  };
}));
