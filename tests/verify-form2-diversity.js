const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('lotto_analyzer.html', 'utf8');
const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(script => script.trim());

assert.ok(scriptBlocks.length > 0, 'Analyzer must contain an inline script');

const elements = new Map();

function createElement(id = '') {
  return {
    id,
    value: '',
    innerHTML: '',
    textContent: '',
    disabled: false,
    files: [],
    max: '',
    style: {},
    dataset: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; },
    },
    addEventListener() {},
    removeEventListener() {},
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

const localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  document,
  localStorage,
  setTimeout,
  clearTimeout,
  alert() {},
  confirm() { return true; },
  fetch: async () => { throw new Error('fetch disabled in test'); },
  navigator: { clipboard: { writeText: async () => {} } },
  URL,
  Blob,
  FileReader: class {},
  addEventListener() {},
});
context.window = context;
context.window.parent = { postMessage() {} };
context.globalThis = context;

vm.runInContext(scriptBlocks.at(-1), context, { filename: 'lotto_analyzer.html' });

function getFunction(name) {
  const type = vm.runInContext(`typeof ${name}`, context);
  assert.strictEqual(type, 'function', `Missing required Form 2 function: ${name}`);
  return vm.runInContext(name, context);
}

const diversifyForm2Combinations = getFunction('diversifyForm2Combinations');
const buildForm2StrongRotation = getFunction('buildForm2StrongRotation');
const getForm2DiversityMetrics = getFunction('getForm2DiversityMetrics');
const renderForm2DiversitySummary = getFunction('renderForm2DiversitySummary');

const baseCombos = Array.from({ length: 14 }, (_, index) => ({
  comboNum: index + 1,
  strategy: `אסטרטגיה ${index + 1}`,
  numbers: [1, 2, 3, 4, 5, 6],
  strong: 1,
}));
const priority = Array.from({ length: 37 }, (_, index) => index + 1);
const options = { minimumCoverage: 30, maximumExposure: 7, maximumOverlap: 4 };

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

const diversified = toPlain(diversifyForm2Combinations(baseCombos, priority, options));
const secondRun = toPlain(diversifyForm2Combinations(baseCombos, priority, options));
const metrics = toPlain(getForm2DiversityMetrics(diversified));

assert.strictEqual(diversified.length, 14, 'Form 2 must keep exactly 14 combinations');
assert.strictEqual(metrics.uniqueCombinationCount, 14, 'All regular-number combinations must be distinct');
assert.ok(metrics.coveredNumberCount >= 30, `Expected coverage >= 30, got ${metrics.coveredNumberCount}`);
assert.ok(metrics.maximumExposure <= 7, `Expected maximum exposure <= 7, got ${metrics.maximumExposure}`);
assert.ok(metrics.maximumOverlap <= 4, `Expected maximum overlap <= 4, got ${metrics.maximumOverlap}`);
assert.deepStrictEqual(diversified, secondRun, 'Diversification must be deterministic');
assert.deepStrictEqual(
  diversified.map(combo => combo.comboNum),
  baseCombos.map(combo => combo.comboNum),
  'Diversification must preserve comboNum values',
);
assert.deepStrictEqual(
  diversified.map(combo => combo.strategy),
  baseCombos.map(combo => combo.strategy),
  'Diversification must preserve strategy labels',
);

for (const combo of diversified) {
  assert.strictEqual(combo.numbers.length, 6, 'Every combination must contain six numbers');
  assert.strictEqual(new Set(combo.numbers).size, 6, 'Every combination must contain six distinct numbers');
  assert.ok(
    combo.numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 37),
    'Every regular number must be an integer from 1 through 37',
  );
}

const rotation = toPlain(buildForm2StrongRotation(
  [{ number: 6 }, { number: 2 }, { number: 4 }],
  [{ number: 1 }, { number: 7 }],
  [{ number: 3 }, { number: 5 }],
));
const strongCounts = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, 0]));
rotation.forEach(number => { strongCounts[number] += 1; });
assert.deepStrictEqual(
  strongCounts,
  { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2 },
  'Every strong number must appear exactly twice',
);

assert.ok(
  html.includes('id="form2DiversitySummary"'),
  'Form 2 must include a diversity summary container',
);
renderForm2DiversitySummary(diversified);
assert.ok(
  document.getElementById('form2DiversitySummary').textContent.includes('14/14'),
  'Form 2 diversity summary must show the unique-combination count',
);
assert.ok(
  document.getElementById('form2DiversitySummary').textContent.includes('חזק לא מאוזן'),
  'Form 2 diversity summary must not claim balanced strong coverage for unbalanced data',
);

const balancedCombos = diversified.map((combo, index) => ({
  ...combo,
  strong: rotation[index],
}));
renderForm2DiversitySummary(balancedCombos);
assert.ok(
  document.getElementById('form2DiversitySummary').textContent.includes('חזק 1–7 ×2'),
  'Form 2 diversity summary must show balanced strong coverage when every strong appears twice',
);

for (const [index, script] of scriptBlocks.entries()) {
  new Function(script);
  console.log(`script ${index + 1} parses`);
}

console.log('Form 2 diversity verification passed');
