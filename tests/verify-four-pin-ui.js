'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const LottoStrategyCore = require('../lotto-strategy-core.js');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');

const html = fs.readFileSync('lotto_analyzer.html', 'utf8');
const required = [
  'let currentFourPinPortfolio = null',
  'function isValidPortfolioForm(form, role, forbiddenKeys)',
  'function isCompatibleFourPinPortfolioResult(portfolio)',
  'function hydrateFourPinPortfolio(result)',
  'id="fourPinPortfolioPanel"',
  'data-portfolio-role="coverage1"',
  'data-portfolio-role="coverage2"',
  'data-portfolio-role="depth1"',
  'data-portfolio-role="depth2"',
];
for (const token of required) {
  assert.ok(html.includes(token), `Missing Four-PIN UI contract: ${token}`);
}

const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]);
for (const script of scripts) new Function(script);

const elements = new Map();
function createElement(id = '') {
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    files: [],
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    appendChild() {},
    remove() {},
    click() {},
    scrollIntoView() {},
    setAttribute() {},
    getAttribute() { return null; },
  };
}
const document = {
  body: createElement('body'),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  },
  querySelector() { return createElement(); },
  querySelectorAll() { return []; },
  createElement() { return createElement(); },
  addEventListener() {},
};
const values = new Map();
const storage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
};
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  document,
  localStorage: storage,
  LottoStrategyCore,
  Worker: class {},
  setTimeout,
  clearTimeout,
  alert() {},
  confirm() { return true; },
  prompt() { return ''; },
  fetch: async () => { throw new Error('fetch disabled in test'); },
  navigator: { clipboard: { writeText: async () => {} } },
  URL,
  Blob,
  FileReader: class {},
  addEventListener() {},
  scrollTo() {},
});
context.window = context;
context.window.parent = { postMessage() {} };
context.globalThis = context;
vm.runInContext(scripts.at(-1), context, { filename: 'lotto_analyzer.html' });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function evaluate(expression) {
  return vm.runInContext(expression, context);
}

function setCandidate(candidate) {
  context.__candidate = candidate;
}

const rows = buildSyntheticDraws(502);
const result = LottoStrategyCore.runWalkForwardBacktest(rows, {
  coverageSearchIterations: 50,
  depthSearchIterations: 50,
  bootstrapSamples: 100,
});
context.__rows = rows;
context.__result = result;

assert.strictEqual(evaluate('isCompatibleBacktestResult(__result, __rows)'), true);
assert.strictEqual(evaluate('saveBacktestCache(__result)'), true);
const key = evaluate('getBacktestCacheKey(__rows)');
assert.ok(key.startsWith('lottoBacktestCacheV2:'), 'Four-PIN cache must use a new prefix');
assert.strictEqual(evaluate('loadCompatibleBacktestCache(__rows).fingerprint'), result.fingerprint);
assert.strictEqual(evaluate('currentFourPinPortfolio !== __result.portfolio'), true);
assert.deepStrictEqual(
  JSON.parse(evaluate('JSON.stringify(currentFourPinPortfolio)')),
  result.portfolio,
);

function expectRejected(name, mutate) {
  const candidate = clone(result);
  mutate(candidate);
  setCandidate(candidate);
  assert.doesNotThrow(() => evaluate('isCompatibleBacktestResult(__candidate, __rows)'), name);
  assert.strictEqual(evaluate('isCompatibleBacktestResult(__candidate, __rows)'), false, name);
  evaluate('hydrateFourPinPortfolio(__result)');
  values.set(key, JSON.stringify(candidate));
  assert.doesNotThrow(() => evaluate('loadCompatibleBacktestCache(__rows)'), `${name} cache load`);
  assert.strictEqual(evaluate('loadCompatibleBacktestCache(__rows)'), null, `${name} cache load`);
  assert.strictEqual(evaluate('currentFourPinPortfolio'), null, `${name} must clear hydration`);
}

for (const field of ['version', 'constraintVersion', 'metricVersion', 'confidenceVersion']) {
  expectRejected(`rejects corrupt ${field}`, candidate => {
    candidate.portfolio[field] += '-corrupt';
  });
}

expectRejected('rejects a missing four-PIN row', candidate => {
  candidate.portfolio.current.forms.coverage1.pop();
});

expectRejected('rejects a malformed four-PIN form without throwing', candidate => {
  candidate.portfolio.current.forms.coverage1 = null;
});

expectRejected('rejects a globally duplicated regular row', candidate => {
  candidate.portfolio.current.forms.coverage2[0].numbers =
    candidate.portfolio.current.forms.coverage1[0].numbers.slice();
});

expectRejected('rejects an unbalanced strong rotation', candidate => {
  candidate.portfolio.current.forms.coverage1[0].strong =
    candidate.portfolio.current.forms.coverage1[1].strong;
});

expectRejected('rejects coverage-pair overlap and exposure corruption', candidate => {
  const first = candidate.portfolio.current.forms.coverage1[0].numbers;
  const replacement = first.slice(0, 3);
  for (let number = 1; replacement.length < 6 && number <= 37; number += 1) {
    if (!replacement.includes(number)) replacement.push(number);
  }
  candidate.portfolio.current.forms.coverage2[0].numbers = replacement.sort((a, b) => a - b);
});

expectRejected('rejects a depth row outside the declared pool', candidate => {
  const current = candidate.portfolio.current;
  const row = current.forms.depth1[0];
  const outside = Array.from({ length: 37 }, (_, index) => index + 1)
    .find(number => !current.depthPool.includes(number) && !row.numbers.includes(number));
  row.numbers = [outside, ...row.numbers.slice(1)].sort((a, b) => a - b);
});

expectRejected('rejects an invalid declared depth pool', candidate => {
  candidate.portfolio.current.depthPool[1] = candidate.portfolio.current.depthPool[0];
});

for (const comparisonName of ['portfolio3Plus', 'coverage3Plus', 'depth3Plus', 'depth4Plus']) {
  expectRejected(`rejects non-finite ${comparisonName}`, candidate => {
    candidate.portfolio.comparisons[comparisonName].difference = null;
  });
}

expectRejected('rejects a gate comparison total that differs from holdoutCount', candidate => {
  candidate.portfolio.comparisons.portfolio3Plus.total += 1;
});

expectRejected('rejects malformed paired counts', candidate => {
  candidate.portfolio.comparisons.coverage3Plus.paired.neither += 1;
});

expectRejected('rejects a non-finite strong diagnostic', candidate => {
  candidate.portfolio.diagnostics.portfolio3PlusStrong.newRate = null;
});

expectRejected('rejects a strong diagnostic total that differs from holdoutCount', candidate => {
  candidate.portfolio.diagnostics.portfolio3PlusStrong.total += 1;
});

expectRejected('rejects non-finite bucket differences', candidate => {
  candidate.portfolio.bucketDifferences[1] = null;
});

expectRejected('rejects malformed bucket sample counts', candidate => {
  candidate.portfolio.bucketSampleCounts = [0, 0.5, result.split.holdoutCount];
});

expectRejected('rejects non-boolean validation state', candidate => {
  candidate.portfolio.validated = 'false';
});

expectRejected('rejects non-string validation reasons', candidate => {
  candidate.portfolio.reasons = ['valid', 7];
});

expectRejected('rejects validated output without a current recommendation', candidate => {
  candidate.portfolio.validated = true;
  candidate.portfolio.current = null;
});

const unvalidatedWithoutCurrent = clone(result);
unvalidatedWithoutCurrent.portfolio.validated = false;
unvalidatedWithoutCurrent.portfolio.current = null;
setCandidate(unvalidatedWithoutCurrent);
assert.strictEqual(evaluate('isCompatibleBacktestResult(__candidate, __rows)'), true);

const inputBeforeHydration = JSON.stringify(result);
context.__legacyState = {
  baseline: { main: [{ numbers: [1, 2, 3, 4, 5, 6], strong: 1 }], form2: [] },
  optimized: { main: [{ numbers: [7, 8, 9, 10, 11, 12], strong: 2 }], form2: null },
  current: [{ numbers: [13, 14, 15, 16, 17, 18], strong: 3 }],
  current2: [{ numbers: [19, 20, 21, 22, 23, 24], strong: 4 }],
  pins: { version: 2, marker: 'preserve-existing-pin-state' },
};
evaluate(`
  baselineForms = __legacyState.baseline;
  optimizedForms = __legacyState.optimized;
  currentCombinations = __legacyState.current;
  currentCombinationsForm2 = __legacyState.current2;
  pinnedForms = __legacyState.pins;
  __legacyBefore = JSON.stringify({
    baselineForms,
    optimizedForms,
    currentCombinations,
    currentCombinationsForm2,
    pinnedForms
  });
  hydrateFourPinPortfolio(__result);
  __legacyAfter = JSON.stringify({
    baselineForms,
    optimizedForms,
    currentCombinations,
    currentCombinationsForm2,
    pinnedForms
  });
`);
assert.strictEqual(evaluate('__legacyAfter'), evaluate('__legacyBefore'));
assert.strictEqual(JSON.stringify(result), inputBeforeHydration, 'Hydration must not mutate its input');
evaluate('currentFourPinPortfolio.current.forms.coverage1[0].numbers[0] = 37');
assert.strictEqual(JSON.stringify(result), inputBeforeHydration, 'Hydrated state must be a deep clone');

evaluate('hydrateFourPinPortfolio(__result)');
context.__incompatible = clone(result);
context.__incompatible.portfolio.current.forms.depth2.pop();
context.__worker = { terminate() {} };
evaluate(`
  selectedData = __rows;
  currentBacktestRunId = 'incompatible-run';
  currentBacktestWorker = __worker;
  handleBacktestWorkerMessage({ data: {
    type: 'complete',
    runId: 'incompatible-run',
    result: __incompatible
  } });
`);
assert.strictEqual(evaluate('currentFourPinPortfolio'), null);

evaluate('hydrateFourPinPortfolio(__result)');
const datasetChange = evaluate('processAnalysisRows([])');

Promise.resolve(datasetChange).then(() => {
  assert.strictEqual(evaluate('currentFourPinPortfolio'), null);

  evaluate(`
    currentBacktestRunId = 'progress-run';
    setBacktestRunning(true);
  `);
  const progress = (phase, completed, total, label) => {
    context.__progressMessage = {
      type: 'progress',
      runId: 'progress-run',
      phase,
      completed,
      total,
      label,
    };
    evaluate('handleBacktestWorkerMessage({ data: __progressMessage })');
    return {
      value: elements.get('backtestProgressBar').value,
      text: elements.get('backtestProgressText').textContent,
    };
  };

  assert.strictEqual(progress('identity-evaluation', 1, 2).value, 28);
  assert.strictEqual(progress('holdout-policies', 1, 2).value, 63);
  assert.strictEqual(progress('portfolio-holdout', 1, 2).value, 83);
  assert.strictEqual(progress('portfolio-current', 1, 1).value, 100);
  assert.strictEqual(progress('identity-evaluation', -20, 1).value, 100);
  assert.strictEqual(progress('portfolio-current', 20, 1).value, 100);
  const unknown = progress('future-phase', 0, 1, 'future label');
  assert.strictEqual(unknown.value, 100);
  assert.ok(unknown.text.includes('future label'));

  console.log('Four-PIN analyzer UI verification passed');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
