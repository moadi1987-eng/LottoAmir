'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const LottoStrategyCore = require('../lotto-strategy-core.js');
const { buildSyntheticDraws } = require('./fixtures/backtest-fixture');

const html = fs.readFileSync('lotto_analyzer.html', 'utf8');
const required = [
  'let currentFourPinPortfolio = null',
  'const PORTFOLIO_PIN_SLOT_MAP = Object.freeze({',
  'function isValidPortfolioForm(form, role, forbiddenKeys)',
  'function isCompatibleFourPinPortfolioResult(portfolio)',
  'function hydrateFourPinPortfolio(result)',
  'function getPortfolioForm(role)',
  'function canPinPortfolioForm(role)',
  'function pinPortfolioForm(role)',
  'function renderFourPinPortfolio(result)',
  'function formatPercentagePointDifference(value)',
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
let confirmResponse = true;
const confirmMessages = [];
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
  confirm(message) {
    confirmMessages.push(String(message));
    return confirmResponse;
  },
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
assert.ok(key.startsWith('lottoBacktestCacheV3:'), 'Four-PIN cache must use the V3 prefix');
assert.strictEqual(evaluate('loadCompatibleBacktestCache(__rows).fingerprint'), result.fingerprint);
const previousCacheKey = key.replace('lottoBacktestCacheV3:', 'lottoBacktestCacheV2:');
values.set(previousCacheKey, JSON.stringify(result));
values.delete(key);
assert.strictEqual(
  evaluate('loadCompatibleBacktestCache(__rows)'),
  null,
  'The V3 loader must ignore a structurally valid result stored only under the old V2 prefix',
);
values.set(key, JSON.stringify(result));
assert.strictEqual(evaluate('loadCompatibleBacktestCache(__rows).fingerprint'), result.fingerprint);
assert.strictEqual(evaluate('currentFourPinPortfolio !== __result.portfolio'), true);
assert.deepStrictEqual(
  JSON.parse(evaluate('JSON.stringify(currentFourPinPortfolio)')),
  result.portfolio,
);

const expectedSlotMap = {
  coverage1: { source: 'main', mode: 'baseline' },
  coverage2: { source: 'main', mode: 'improved' },
  depth1: { source: 'form2', mode: 'baseline' },
  depth2: { source: 'form2', mode: 'improved' },
};
const PORTFOLIO_LABELS = {
  coverage1: 'PIN 1 - כיסוי 3+',
  coverage2: 'PIN 2 - כיסוי 3+',
  depth1: 'PIN 3 - עומק 4+',
  depth2: 'PIN 4 - עומק 4+',
};
assert.deepStrictEqual(
  JSON.parse(evaluate(`JSON.stringify(Object.fromEntries(
    Object.entries(PORTFOLIO_PIN_SLOT_MAP).map(([role, slot]) => [
      role,
      { source: slot.source, mode: slot.mode }
    ])
  ))`)),
  expectedSlotMap,
  'Portfolio roles must map to the exact four existing PIN V2 slots',
);
assert.strictEqual(evaluate('Object.isFrozen(PORTFOLIO_PIN_SLOT_MAP)'), true);
assert.strictEqual(
  evaluate('Object.values(PORTFOLIO_PIN_SLOT_MAP).every(Object.isFrozen)'),
  true,
  'Every portfolio PIN slot descriptor must be immutable',
);
const frozenSlotMapBeforeMutation = evaluate('JSON.stringify(PORTFOLIO_PIN_SLOT_MAP)');
evaluate(`
  PORTFOLIO_PIN_SLOT_MAP.coverage1.source = 'form2';
  PORTFOLIO_PIN_SLOT_MAP.depth2.label = 'mutated';
`);
assert.strictEqual(
  evaluate('JSON.stringify(PORTFOLIO_PIN_SLOT_MAP)'),
  frozenSlotMapBeforeMutation,
  'Runtime code must not be able to mutate any portfolio PIN mapping entry',
);

const forgedApprovalResult = clone(result);
forgedApprovalResult.portfolio.validated = true;
forgedApprovalResult.portfolio.reasons = [];
context.__forgedApprovalResult = forgedApprovalResult;
context.__latestDraws = [
  { drawNumber: 5002, date: '07/08/2026', numbers: [1, 2, 3, 4, 5, 6], strong: 1 },
  { drawNumber: 5001, date: '04/08/2026', numbers: [7, 8, 9, 10, 11, 12], strong: 2 },
];

function createCoherentComparison(paired) {
  const total = paired.both + paired.newOnly + paired.legacyOnly + paired.neither;
  const newWins = paired.both + paired.newOnly;
  const legacyWins = paired.both + paired.legacyOnly;
  const newRate = newWins / total;
  const legacyRate = legacyWins / total;
  return {
    total,
    newWins,
    legacyWins,
    newRate,
    legacyRate,
    difference: newRate - legacyRate,
    newInterval: { low: 0, high: 1 },
    legacyInterval: { low: 0, high: 1 },
    differenceInterval: { low: -1, high: 1 },
    paired: { ...paired },
  };
}

const coherentPortfolio = clone(result.portfolio);
coherentPortfolio.sampleCount = 10;
coherentPortfolio.selectionFailures = 0;
coherentPortfolio.comparisons = {
  portfolio3Plus: createCoherentComparison({ both: 4, newOnly: 3, legacyOnly: 1, neither: 2 }),
  coverage3Plus: createCoherentComparison({ both: 4, newOnly: 2, legacyOnly: 2, neither: 2 }),
  depth3Plus: createCoherentComparison({ both: 5, newOnly: 1, legacyOnly: 1, neither: 3 }),
  depth4Plus: createCoherentComparison({ both: 2, newOnly: 3, legacyOnly: 1, neither: 4 }),
};
coherentPortfolio.bucketSampleCounts = [4, 3, 3];
coherentPortfolio.bucketDifferences = [0.5, 1 / 3, -1 / 3];
coherentPortfolio.diagnostics = {
  portfolio3PlusStrong: createCoherentComparison({
    both: 2,
    newOnly: 1,
    legacyOnly: 2,
    neither: 5,
  }),
  selectionFailureCodes: [],
  currentFailureCode: null,
};
const coherentGate = LottoStrategyCore.validateFourPinPortfolioResult({
  selectionFailures: coherentPortfolio.selectionFailures,
  comparisons: coherentPortfolio.comparisons,
  bucketDifferences: coherentPortfolio.bucketDifferences,
  bucketSampleCounts: coherentPortfolio.bucketSampleCounts,
});
assert.deepStrictEqual(
  coherentGate,
  { validated: true, reasons: [] },
  'The independent paired/bucket fixture must pass the exact core gate before UI approval',
);
coherentPortfolio.validated = coherentGate.validated;
coherentPortfolio.reasons = coherentGate.reasons.slice();
const validatedResult = clone(result);
validatedResult.portfolio = coherentPortfolio;
context.__validatedResult = validatedResult;

function setPortfolioPinEligibility(portfolioResult = validatedResult) {
  context.__portfolioResult = portfolioResult;
  evaluate(`
    hydrateFourPinPortfolio(__portfolioResult);
    currentData = __latestDraws;
    lastAnalysis = { loaded: true };
  `);
}

assert.strictEqual(
  result.portfolio.validated,
  false,
  'The real 502-draw fixture must remain rejected before the forged-approval regression',
);
assert.strictEqual(
  evaluate('isCompatibleFourPinPortfolioResult(__forgedApprovalResult.portfolio)'),
  false,
  'Flipping only validated/reasons must not make rejected evidence compatible',
);
setPortfolioPinEligibility(forgedApprovalResult);
assert.strictEqual(
  evaluate("canPinPortfolioForm('coverage1')"),
  false,
  'Flipping only validated/reasons must not authorize PIN writes',
);

setPortfolioPinEligibility();
for (const role of Object.keys(expectedSlotMap)) {
  context.__role = role;
  assert.strictEqual(evaluate('getPortfolioForm(__role).length'), 14, `${role} must expose 14 authorized rows`);
  assert.strictEqual(evaluate('canPinPortfolioForm(__role)'), true, `${role} must be pinnable`);
}
assert.strictEqual(evaluate("getPortfolioForm('unknown')"), null);
assert.strictEqual(evaluate("canPinPortfolioForm('unknown')"), false);

const unvalidatedResult = clone(validatedResult);
unvalidatedResult.portfolio.validated = false;
unvalidatedResult.portfolio.reasons = ['portfolio-three-plus-regression'];
context.__unvalidatedResult = unvalidatedResult;
setPortfolioPinEligibility(unvalidatedResult);
for (const role of Object.keys(expectedSlotMap)) {
  context.__role = role;
  assert.strictEqual(evaluate('canPinPortfolioForm(__role)'), false, `${role} must fail closed`);
}

function expectPortfolioAccessDenied(name, setupExpression, roles = Object.keys(expectedSlotMap)) {
  setPortfolioPinEligibility();
  evaluate(`
    pinnedForms = createEmptyPinnedForms();
    ${setupExpression}
    __deniedPinStateBefore = JSON.stringify(pinnedForms);
  `);
  for (const role of roles) {
    context.__role = role;
    assert.strictEqual(evaluate('getPortfolioForm(__role)'), null, `${name}: getter must fail closed`);
    assert.strictEqual(evaluate('canPinPortfolioForm(__role)'), false, `${name}: canPin must fail closed`);
    assert.strictEqual(evaluate('pinPortfolioForm(__role)'), false, `${name}: PIN must be a no-op`);
    assert.strictEqual(
      evaluate('JSON.stringify(pinnedForms)'),
      evaluate('__deniedPinStateBefore'),
      `${name}: PIN state must remain byte-equivalent`,
    );
  }
}

expectPortfolioAccessDenied('no loaded draw data', 'currentData = [];');
expectPortfolioAccessDenied('no loaded analysis', 'lastAnalysis = null;');
expectPortfolioAccessDenied('unvalidated portfolio', 'hydrateFourPinPortfolio(__unvalidatedResult);');
expectPortfolioAccessDenied(
  'incompatible portfolio',
  'currentFourPinPortfolio.current.forms.coverage1.pop();',
);
expectPortfolioAccessDenied('unknown role', '', ['unknown']);

setPortfolioPinEligibility();
evaluate('lastAnalysis = null');
assert.strictEqual(evaluate("canPinPortfolioForm('coverage1')"), false);
evaluate('lastAnalysis = { loaded: true }; currentData = []');
assert.strictEqual(evaluate("canPinPortfolioForm('coverage1')"), false);
setPortfolioPinEligibility();
evaluate('currentFourPinPortfolio.current.forms.coverage1.pop()');
assert.strictEqual(evaluate("canPinPortfolioForm('coverage1')"), false);

function makeStoredPin(source, mode, seed, label) {
  return {
    source,
    mode,
    label,
    fullLabel: `${label} full`,
    pinnedAt: '2026-08-01T12:00:00.000Z',
    anchorDrawNumber: 4999,
    anchorDrawDate: '01/08/2026',
    combinations: validatedResult.portfolio.current.forms.coverage1.map((row, index) => ({
      ...clone(row),
      comboNum: index + 1,
      strategy: `${label} ${seed}-${index + 1}`,
    })),
  };
}

const seededPins = {
  version: 2,
  main: {
    baseline: makeStoredPin('main', 'baseline', 1, 'seed main baseline'),
    improved: makeStoredPin('main', 'improved', 2, 'seed main improved'),
  },
  form2: {
    baseline: makeStoredPin('form2', 'baseline', 3, 'seed form2 baseline'),
    improved: makeStoredPin('form2', 'improved', 4, 'seed form2 improved'),
  },
};
context.__seededPins = seededPins;
evaluate(`
  __originalSavePinnedForms = savePinnedForms;
  __originalRenderPinnedFormStatus = renderPinnedFormStatus;
  __originalRenderPinnedFutureComparisons = renderPinnedFutureComparisons;
  __portfolioSaveCount = 0;
  __portfolioStatusRenderCount = 0;
  __portfolioFutureRenderCount = 0;
  savePinnedForms = function(nextState, options) {
    __portfolioSaveCount++;
    return __originalSavePinnedForms(nextState, options);
  };
  renderPinnedFormStatus = function() { __portfolioStatusRenderCount++; };
  renderPinnedFutureComparisons = function() { __portfolioFutureRenderCount++; };
`);

for (const [role, slot] of Object.entries(expectedSlotMap)) {
  setPortfolioPinEligibility();
  context.__role = role;
  context.__source = slot.source;
  context.__mode = slot.mode;
  evaluate(`
    pinnedForms = normalizePinnedFormsDocument(__seededPins);
    pinnedForms[__source][__mode] = null;
    __portfolioNeighborsBefore = JSON.stringify(pinnedForms);
    __portfolioSourceBefore = JSON.stringify(getPortfolioForm(__role));
    __portfolioSaveCount = 0;
    __portfolioStatusRenderCount = 0;
    __portfolioFutureRenderCount = 0;
  `);
  const before = JSON.parse(evaluate('__portfolioNeighborsBefore'));
  assert.strictEqual(evaluate('pinPortfolioForm(__role)'), true, `${role} PIN must succeed`);
  const after = JSON.parse(evaluate('JSON.stringify(pinnedForms)'));
  const pinned = after[slot.source][slot.mode];
  assert.strictEqual(pinned.label, PORTFOLIO_LABELS[role]);
  assert.strictEqual(pinned.fullLabel, PORTFOLIO_LABELS[role]);
  assert.strictEqual(pinned.combinations.length, 14);
  assert.deepStrictEqual(
    pinned.combinations,
    JSON.parse(evaluate('JSON.stringify(getPortfolioForm(__role))')),
    `${role} must copy its exact 14 rows`,
  );
  assert.strictEqual(pinned.anchorDrawNumber, 5002);
  assert.strictEqual(pinned.anchorDrawDate, '07/08/2026');
  for (const [neighborRole, neighborSlot] of Object.entries(expectedSlotMap)) {
    if (neighborRole === role) continue;
    assert.strictEqual(
      JSON.stringify(after[neighborSlot.source][neighborSlot.mode]),
      JSON.stringify(before[neighborSlot.source][neighborSlot.mode]),
      `${role} must leave ${neighborRole} byte-equivalent`,
    );
  }
  assert.deepStrictEqual(
    JSON.parse(values.get('lottoPinnedFormsV2')),
    after,
    `${role} must persist through PIN V2 storage`,
  );
  assert.deepStrictEqual(
    {
      save: evaluate('__portfolioSaveCount'),
      status: evaluate('__portfolioStatusRenderCount'),
      future: evaluate('__portfolioFutureRenderCount'),
    },
    { save: 1, status: 1, future: 1 },
  );
  evaluate(`
    __portfolioPinnedFirstNumber = pinnedForms[__source][__mode].combinations[0].numbers[0];
    currentFourPinPortfolio.current.forms[__role][0].numbers[0] = 37;
  `);
  assert.strictEqual(
    evaluate('pinnedForms[__source][__mode].combinations[0].numbers[0]'),
    evaluate('__portfolioPinnedFirstNumber'),
    `${role} PIN rows must be cloned`,
  );
}

setPortfolioPinEligibility();
evaluate('pinnedForms = normalizePinnedFormsDocument(__seededPins)');
const beforeCancelledOverwrite = evaluate('JSON.stringify(pinnedForms)');
confirmResponse = false;
confirmMessages.length = 0;
assert.strictEqual(evaluate("pinPortfolioForm('coverage1')"), false);
assert.strictEqual(evaluate('JSON.stringify(pinnedForms)'), beforeCancelledOverwrite);
assert.strictEqual(confirmMessages.length, 1, 'Occupied portfolio slots must confirm overwrite');

confirmResponse = true;
assert.strictEqual(evaluate("pinPortfolioForm('coverage1')"), true);
assert.notStrictEqual(evaluate('JSON.stringify(pinnedForms)'), beforeCancelledOverwrite);

evaluate(`
  savePinnedForms = __originalSavePinnedForms;
  renderPinnedFormStatus = __originalRenderPinnedFormStatus;
  renderPinnedFutureComparisons = __originalRenderPinnedFutureComparisons;
`);

context.__customPin = makeStoredPin('main', 'baseline', 8, '<img id="hostile-pin-label" src=x>');
context.__customPin.fullLabel = '<svg id="hostile-pin-full-label" onload=alert(1)>';
const normalizedCustomPin = JSON.parse(evaluate(
  "JSON.stringify(normalizePinnedSlot(__customPin, 'main', 'baseline'))",
));
assert.strictEqual(normalizedCustomPin.label, context.__customPin.label);
assert.strictEqual(normalizedCustomPin.fullLabel, context.__customPin.fullLabel);

context.__legacyV2Pin = makeStoredPin('main', 'baseline', 9, 'ignored');
delete context.__legacyV2Pin.label;
delete context.__legacyV2Pin.fullLabel;
assert.deepStrictEqual(
  JSON.parse(evaluate("JSON.stringify(normalizePinnedSlot(__legacyV2Pin, 'main', 'baseline'))"))
    .label,
  'טופס ראשון - בסיס',
);
context.__legacyV1 = {
  version: 1,
  main: clone(context.__legacyV2Pin),
  form2: null,
};
assert.strictEqual(
  JSON.parse(evaluate('JSON.stringify(migratePinnedFormsV1(__legacyV1))')).main.baseline.fullLabel,
  'טופס ראשון – 14 קומבינציות מומלצות - בסיס',
);

evaluate(`
  pinnedForms = createEmptyPinnedForms();
  pinnedForms.main.baseline = normalizePinnedSlot(__customPin, 'main', 'baseline');
  renderPinnedFormStatus();
`);
const hostileStatusHtml = elements.get('pinnedMainStatus').innerHTML;
assert.ok(hostileStatusHtml.includes('&lt;img id=&quot;hostile-pin-label&quot; src=x&gt;'));
assert.ok(!hostileStatusHtml.includes('<img id="hostile-pin-label"'));
evaluate('currentData = null');
const hostileFutureHtml = evaluate('renderPinnedFutureSource(pinnedForms.main.baseline)');
assert.ok(hostileFutureHtml.includes('&lt;svg id=&quot;hostile-pin-full-label&quot;'));
assert.ok(!hostileFutureHtml.includes('<svg id="hostile-pin-full-label"'));

context.__renderResult = clone(validatedResult);
evaluate('renderFourPinPortfolio(__renderResult)');
const approvedPortfolioHtml = elements.get('fourPinPortfolioPanel').innerHTML;
assert.ok(
  /class="portfolio-validation-banner"[^>]*role="status"[^>]*aria-live="polite"/.test(
    approvedPortfolioHtml,
  ),
  'Approved portfolio validation status must be announced politely',
);
assert.strictEqual((approvedPortfolioHtml.match(/class="portfolio-form-card"/g) || []).length, 4);
assert.strictEqual((approvedPortfolioHtml.match(/data-portfolio-row=/g) || []).length, 56);
for (const [role] of Object.entries(expectedSlotMap)) {
  assert.ok(approvedPortfolioHtml.includes(`data-portfolio-role="${role}"`));
  assert.ok(approvedPortfolioHtml.includes(`onclick="pinPortfolioForm('${role}')"`));
}
assert.ok(approvedPortfolioHtml.includes('+20.0'), 'Percentage-point differences need an explicit sign');
assert.ok(approvedPortfolioHtml.includes('-10.0'), 'Negative percentage-point differences need one decimal');
assert.ok(approvedPortfolioHtml.includes('95%'));
assert.ok(approvedPortfolioHtml.includes('both'));
assert.ok(approvedPortfolioHtml.includes('new-only'));
assert.ok(approvedPortfolioHtml.includes('legacy-only'));
assert.ok(approvedPortfolioHtml.includes('neither'));
assert.ok(approvedPortfolioHtml.includes('אבחון בלבד'));
assert.ok(approvedPortfolioHtml.includes('מחוץ לתנאי האישור'));
assert.ok(approvedPortfolioHtml.includes('הניתוח ההיסטורי אינו מבטיח תוצאות עתידיות'));
for (const forbiddenMetric of ['ממוצע ציון', 'ממוצע שורה מיטבית', 'averageBestMatches']) {
  assert.ok(!approvedPortfolioHtml.includes(forbiddenMetric), `Portfolio UI must omit ${forbiddenMetric}`);
}
assert.ok(evaluate('formatPercentagePointDifference(0.01234)').startsWith('+1.2'));
assert.ok(evaluate('formatPercentagePointDifference(-0.004)').startsWith('-0.4'));

context.__rejectedRenderResult = clone(result);
evaluate('renderFourPinPortfolio(__rejectedRenderResult)');
const rejectedPortfolioHtml = elements.get('fourPinPortfolioPanel').innerHTML;
assert.ok(
  /class="portfolio-validation-banner"[^>]*role="status"[^>]*aria-live="polite"/.test(
    rejectedPortfolioHtml,
  ),
  'Rejected portfolio validation status must be announced politely',
);
assert.ok(rejectedPortfolioHtml.includes('portfolio-three-plus-regression'));
assert.ok(rejectedPortfolioHtml.includes('לא אושר'));
assert.ok(!rejectedPortfolioHtml.includes('class="portfolio-form-card"'));
assert.ok(!rejectedPortfolioHtml.includes('data-portfolio-row='));
assert.ok(!rejectedPortfolioHtml.includes('onclick="pinPortfolioForm('));

context.__coverageRows = [
  ...result.portfolio.current.forms.coverage1,
  ...result.portfolio.current.forms.coverage2,
];
for (const roleName of ['coverage1', 'coverage2', 'depth1', 'depth2']) {
  context.__roleName = roleName;
  assert.strictEqual(evaluate(`isValidPortfolioForm(
    __result.portfolio.current.forms[__roleName],
    {
      name: __roleName,
      coverageRows: __coverageRows,
      depthPool: new Set(__result.portfolio.current.depthPool)
    },
    new Set()
  )`), true, `${roleName} must accept its complete role metadata`);
}

function observeValidation(expression) {
  try {
    return evaluate(expression);
  } catch (error) {
    return `THREW: ${error.message}`;
  }
}

const malformedCoverageResult = clone(result);
malformedCoverageResult.portfolio.current.forms.coverage2[0].numbers = { malformed: true };
context.__malformedCoverageResult = malformedCoverageResult;
context.__missingCurrentResult = clone(result);
delete context.__missingCurrentResult.portfolio.current;
context.__undefinedCurrentResult = clone(result);
context.__undefinedCurrentResult.portfolio.current = undefined;
context.__sparseReasonsResult = clone(result);
context.__sparseReasonsResult.portfolio.reasons = new Array(2);
context.__sparseDifferencesResult = clone(result);
context.__sparseDifferencesResult.portfolio.bucketDifferences = new Array(3);
context.__sparseCountsResult = clone(result);
context.__sparseCountsResult.portfolio.bucketSampleCounts = new Array(3);
context.__sparseCountsResult.portfolio.bucketSampleCounts[2] = result.split.holdoutCount;
context.__sparsePolicyBucketsResult = clone(result);
context.__sparsePolicyBucketsResult.policies.main.baseline.bucketAverages = new Array(3);

const reviewRegressionObservations = {
  nullRole: observeValidation(`isValidPortfolioForm(
    __result.portfolio.current.forms.coverage1,
    null,
    null
  )`),
  unknownRole: observeValidation(`isValidPortfolioForm(
    __result.portfolio.current.forms.coverage1,
    { name: 'unknown', coverageRows: __coverageRows },
    new Set()
  )`),
  malformedForbiddenKeys: observeValidation(`isValidPortfolioForm(
    __result.portfolio.current.forms.coverage1,
    { name: 'coverage1', coverageRows: __coverageRows },
    {}
  )`),
  malformedLaterCoverageRow: observeValidation(`isValidPortfolioForm(
    __malformedCoverageResult.portfolio.current.forms.coverage1,
    {
      name: 'coverage1',
      coverageRows: __malformedCoverageResult.portfolio.current.forms.coverage1.concat(
        __malformedCoverageResult.portfolio.current.forms.coverage2
      )
    },
    new Set()
  )`),
  missingCurrent: observeValidation(
    'isCompatibleBacktestResult(__missingCurrentResult, __rows)',
  ),
  undefinedCurrent: observeValidation(
    'isCompatibleBacktestResult(__undefinedCurrentResult, __rows)',
  ),
  sparseReasons: observeValidation(
    'isCompatibleBacktestResult(__sparseReasonsResult, __rows)',
  ),
  sparseBucketDifferences: observeValidation(
    'isCompatibleBacktestResult(__sparseDifferencesResult, __rows)',
  ),
  sparseBucketSampleCounts: observeValidation(
    'isCompatibleBacktestResult(__sparseCountsResult, __rows)',
  ),
  sparsePolicyBucketAverages: observeValidation(
    'isCompatibleBacktestResult(__sparsePolicyBucketsResult, __rows)',
  ),
};

evaluate('hydrateFourPinPortfolio(__result)');
context.__reviewWorker = {
  terminationCount: 0,
  terminate() { this.terminationCount += 1; },
};
const cacheBeforeIncompatibleCompletion = values.get(key);
let incompatibleCompletionThrew = null;
try {
  evaluate(`
    currentBacktestResult = null;
    currentData = __rows;
    selectedData = __rows;
    lastAnalysis = { loaded: true };
    hydrateFourPinPortfolio(__validatedResult);
    renderFourPinPortfolio(__validatedResult);
    __incompatiblePanelBefore = document.getElementById('fourPinPortfolioPanel').innerHTML;
    currentBacktestRunId = 'malformed-complete-run';
    currentBacktestWorker = __reviewWorker;
    setBacktestRunning(true);
    handleBacktestWorkerMessage({ data: {
      type: 'complete',
      runId: 'malformed-complete-run',
      result: {}
    } });
  `);
} catch (error) {
  incompatibleCompletionThrew = error.message;
}
reviewRegressionObservations.incompatibleCompletion = {
  threw: incompatibleCompletionThrew,
  beforeCards: (evaluate('__incompatiblePanelBefore').match(/class="portfolio-form-card"/g) || []).length,
  beforeRows: (evaluate('__incompatiblePanelBefore').match(/data-portfolio-row=/g) || []).length,
  beforeEnabledActions: (evaluate('__incompatiblePanelBefore').match(/class="pin-form-btn portfolio-pin-button" onclick=/g) || []).length,
  beforeDisabledActions: (evaluate('__incompatiblePanelBefore').match(/portfolio-pin-button[^>]*disabled/g) || []).length,
  portfolioCleared: evaluate('currentFourPinPortfolio === null'),
  panelCardsCleared: (elements.get('fourPinPortfolioPanel').innerHTML.match(/class="portfolio-form-card"/g) || []).length,
  panelRowsCleared: (elements.get('fourPinPortfolioPanel').innerHTML.match(/data-portfolio-row=/g) || []).length,
  panelActionsCleared: (elements.get('fourPinPortfolioPanel').innerHTML.match(/onclick="pinPortfolioForm\(/g) || []).length,
  panelIsSafeEmpty: elements.get('fourPinPortfolioPanel').innerHTML
    .includes('אין עדיין תוצאת תיק ארבעה טפסים תואמת'),
  workerCleared: evaluate('currentBacktestWorker === null'),
  runCleared: evaluate('currentBacktestRunId === null'),
  runningUiCleared: elements.get('backtestProgress').hidden,
  resultNotAccepted: evaluate('currentBacktestResult === null'),
  cacheNotWritten: values.get(key) === cacheBeforeIncompatibleCompletion,
  terminationCount: context.__reviewWorker.terminationCount,
};

assert.deepStrictEqual(reviewRegressionObservations, {
  nullRole: false,
  unknownRole: false,
  malformedForbiddenKeys: false,
  malformedLaterCoverageRow: false,
  missingCurrent: false,
  undefinedCurrent: false,
  sparseReasons: false,
  sparseBucketDifferences: false,
  sparseBucketSampleCounts: false,
  sparsePolicyBucketAverages: false,
  incompatibleCompletion: {
    threw: null,
    beforeCards: 4,
    beforeRows: 56,
    beforeEnabledActions: 4,
    beforeDisabledActions: 0,
    portfolioCleared: true,
    panelCardsCleared: 0,
    panelRowsCleared: 0,
    panelActionsCleared: 0,
    panelIsSafeEmpty: true,
    workerCleared: true,
    runCleared: true,
    runningUiCleared: true,
    resultNotAccepted: true,
    cacheNotWritten: true,
    terminationCount: 1,
  },
}, 'Review regressions must fail closed without leaving a partial completion');

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

expectRejected('rejects the previous algorithm version', candidate => {
  candidate.version = 'lotto-backtest-v3';
});

expectRejected('rejects the previous four-PIN portfolio version', candidate => {
  candidate.portfolio.version = 'four-pin-portfolio-v1';
});

expectRejected('rejects the previous confidence method version', candidate => {
  candidate.portfolio.confidenceVersion = 'wilson-paired-bootstrap-v1';
});

expectRejected('rejects identity metrics without binary 3+ stability', candidate => {
  delete candidate.rankings[0].calibration.binary3PlusStability;
});

expectRejected('rejects malformed identity 3+ bucket rates', candidate => {
  candidate.rankings[0].calibration.bucket3PlusRates[0] = 2;
});

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

expectRejected('rejects a paired rate inconsistent with integer wins', candidate => {
  candidate.portfolio.comparisons.portfolio3Plus.newRate += 1e-9;
});

expectRejected('rejects a paired difference inconsistent with the two rates', candidate => {
  candidate.portfolio.comparisons.portfolio3Plus.difference += 1e-9;
});

expectRejected('rejects an illegal binary-rate interval', candidate => {
  candidate.portfolio.comparisons.coverage3Plus.newInterval = { low: 0.75, high: 0.25 };
});

expectRejected('rejects an illegal paired-difference interval', candidate => {
  candidate.portfolio.comparisons.depth4Plus.differenceInterval.low = -1.01;
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

expectRejected('rejects bucket arithmetic inconsistent with the complete comparison', candidate => {
  candidate.portfolio.bucketDifferences[0] += 0.25;
});

expectRejected('rejects non-boolean validation state', candidate => {
  candidate.portfolio.validated = 'false';
});

expectRejected('rejects non-string validation reasons', candidate => {
  candidate.portfolio.reasons = ['valid', 7];
});

expectRejected('rejects validation reasons in a different order than the core gate', candidate => {
  candidate.portfolio.reasons.reverse();
});

expectRejected('rejects selectionFailures tampered independently of gate evidence', candidate => {
  candidate.portfolio.selectionFailures += 1;
});

expectRejected('rejects a validated boolean that disagrees with the core gate', candidate => {
  candidate.portfolio.validated = !candidate.portfolio.validated;
});

expectRejected('rejects a current recommendation paired with a failure code', candidate => {
  candidate.portfolio.diagnostics.currentFailureCode = 'FORGED_CURRENT_FAILURE';
});

expectRejected('rejects validated output without a current recommendation', candidate => {
  candidate.portfolio.validated = true;
  candidate.portfolio.current = null;
});

const unvalidatedWithoutCurrent = clone(result);
unvalidatedWithoutCurrent.portfolio.validated = false;
unvalidatedWithoutCurrent.portfolio.current = null;
unvalidatedWithoutCurrent.portfolio.diagnostics.currentFailureCode = 'EXPECTED_CURRENT_FAILURE';
unvalidatedWithoutCurrent.portfolio.reasons.push('current-generation-failure');
setCandidate(unvalidatedWithoutCurrent);
assert.strictEqual(evaluate('isCompatibleBacktestResult(__candidate, __rows)'), true);

expectRejected('rejects null current without a failure code', candidate => {
  candidate.portfolio.current = null;
  candidate.portfolio.reasons.push('current-generation-failure');
});

expectRejected('rejects null current without the ordered failure reason', candidate => {
  candidate.portfolio.current = null;
  candidate.portfolio.diagnostics.currentFailureCode = 'EXPECTED_CURRENT_FAILURE';
});

expectRejected('rejects current-generation-failure outside the final reason position', candidate => {
  candidate.portfolio.current = null;
  candidate.portfolio.diagnostics.currentFailureCode = 'EXPECTED_CURRENT_FAILURE';
  candidate.portfolio.reasons.unshift('current-generation-failure');
});

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
  assert.ok(
    elements.get('fourPinPortfolioPanel').innerHTML.includes('אין עדיין תוצאת תיק ארבעה טפסים תואמת'),
    'Changing datasets must clear stale portfolio recommendations from the panel',
  );

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
