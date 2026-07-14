'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const LottoStrategyCore = require('../lotto-strategy-core.js');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');

const html = fs.readFileSync('lotto_analyzer.html', 'utf8');
const required = [
  'id="backtestWorkspace"',
  'id="backtestRunBtn"',
  'id="backtestCancelBtn"',
  'id="backtestProgress"',
  'id="backtestSummaryPanel"',
  'id="backtestStrategiesPanel"',
  'id="backtestComparisonPanel"',
  'id="mainFormMode"',
  'id="form2FormMode"',
  'function setAnalyzerWorkspace(mode)',
  'function startBacktest()',
  'function cancelBacktest(reason)',
  'function loadCompatibleBacktestCache(rows)',
  'function isCompatibleBacktestResult(result, rows)',
  'function getEffectiveBacktestRows()',
  'function saveBacktestCache(result)',
  'function applyFormMode(source, mode)',
  'function renderActiveForms()',
  "new Worker('lotto-backtest-worker.js')",
  'הניתוח ההיסטורי אינו מבטיח תוצאות עתידיות',
];
for (const token of required) assert.ok(html.includes(token), `Missing Backtest UI contract: ${token}`);

assert.ok(/function canPinForm\(source, mode\)[\s\S]*policy\.validated === true/.test(html));
assert.ok(/function pinForm\(source, mode\)[\s\S]*getFormSet\(source, mode\)/.test(html));

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
  failWrites: false,
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) {
    if (this.failWrites) throw new Error('quota');
    values.set(key, String(value));
  },
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

const rows = buildSyntheticDraws(502);
const result = LottoStrategyCore.runWalkForwardBacktest(rows);
context.__rows = rows;
context.__result = result;
assert.strictEqual(vm.runInContext('saveBacktestCache(__result)', context), true);
assert.strictEqual(
  vm.runInContext('loadCompatibleBacktestCache(__rows).fingerprint', context),
  result.fingerprint,
);

const changedRows = rows.map(draw => ({ ...draw, numbers: draw.numbers.slice() }));
changedRows[0].strong = changedRows[0].strong === 7 ? 6 : 7;
context.__changedRows = changedRows;
assert.strictEqual(vm.runInContext('loadCompatibleBacktestCache(__changedRows)', context), null);

const key = vm.runInContext('getBacktestCacheKey(__rows)', context);
const corruptResult = JSON.parse(JSON.stringify(result));
corruptResult.rankings = [];
values.set(key, JSON.stringify(corruptResult));
assert.strictEqual(vm.runInContext('loadCompatibleBacktestCache(__rows)', context), null);

const malformedFormResult = JSON.parse(JSON.stringify(result));
malformedFormResult.currentForms.main = {};
context.__malformedFormResult = malformedFormResult;
assert.doesNotThrow(() => vm.runInContext(
  'isCompatibleBacktestResult(__malformedFormResult, __rows)',
  context,
));
assert.strictEqual(vm.runInContext(
  'isCompatibleBacktestResult(__malformedFormResult, __rows)',
  context,
), false);

values.set(key, '{broken-json');
assert.strictEqual(vm.runInContext('loadCompatibleBacktestCache(__rows)', context), null);
storage.failWrites = true;
assert.strictEqual(vm.runInContext('saveBacktestCache(__result)', context), false);

storage.failWrites = false;
context.__selectedRows = rows.slice(1);
vm.runInContext('currentData = __rows; selectedData = __selectedRows;', context);
assert.strictEqual(vm.runInContext('getEffectiveBacktestRows().length', context), rows.length - 1);
vm.runInContext("setAnalyzerWorkspace('backtest')", context);
assert.ok(elements.get('backtestDatasetMeta').textContent.startsWith(String(rows.length - 1)));

context.Worker = class ThrowingWorker {
  constructor() { throw new Error('worker blocked'); }
};
assert.doesNotThrow(() => vm.runInContext('startBacktest()', context));
assert.strictEqual(vm.runInContext('currentBacktestRunId', context), null);

let postedMessage = null;
context.Worker = class CapturingWorker {
  terminate() {}
  postMessage(message) { postedMessage = message; }
};
vm.runInContext('startBacktest()', context);
assert.strictEqual(postedMessage.rows.length, rows.length - 1);
assert.deepStrictEqual(
  Array.from(postedMessage.windows),
  Array.from(LottoStrategyCore.BACKTEST_WINDOWS),
);
vm.runInContext("cancelBacktest('user')", context);

console.log('Backtest analyzer UI verification passed');
