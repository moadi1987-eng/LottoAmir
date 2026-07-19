const fs = require('fs');

const html = fs.readFileSync('lotto_analyzer.html', 'utf8');
const shellHtml = fs.readFileSync('Lotto_All_In_One.html', 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const requiredText = [
  'lottoPinnedFormsV1',
  'lottoPinnedFormsV2',
  'id="pinMainBaselineBtn"',
  'id="pinMainImprovedBtn"',
  'id="pinForm2BaselineBtn"',
  'id="pinForm2ImprovedBtn"',
  'id="pinnedMainStatus"',
  'id="pinnedForm2Status"',
  'id="pinnedFutureCard"',
  'id="pinnedFutureContent"',
  'function createEmptyPinnedForms()',
  'function normalizePinnedSlot(pin, source, mode)',
  'function normalizePinnedFormsDocument(parsed)',
  'function migratePinnedFormsV1(parsed)',
  'function loadPinnedForms()',
  'function savePinnedForms(nextState',
  'function getPinnedForm(source, mode)',
  'function canPinForm(source, mode)',
  'function pinForm(source, mode)',
  'function clearPinnedForm(source, mode)',
  'function sendPinnedFormToForm(source, mode)',
  'function getLatestDrawAnchor()',
  'function getFutureRowsForPin(pin)',
  'function scorePinnedFormAgainstDraw(pin, drawRow)',
  'function createPinnedDrawMetrics(pin, item)',
  'function renderPinnedDrawMetricAttributes(metrics)',
  'function parsePinnedFiniteNumber(value)',
  'function readPinnedDrawMetrics(detail)',
  'function getPinnedDrawMetricDisplay(metrics)',
  'function renderPinnedOpenDrawStats(metrics)',
  "const DEFAULT_PRIZES_FILE = 'LOTTO_PRIZES.json'",
  'function ensureDefaultPrizeData()',
  'function normalizeLottoPrizeDocument(parsed)',
  'function getPinnedPrizeTierKey(result)',
  'function calculatePinnedDrawWinnings(score, draw)',
  'function formatPrizeIls(value)',
  'function renderPinnedWinningsAttributes(winnings)',
  'function readPinnedDrawWinnings(detail)',
  'function getPinnedWinningsDisplay(winnings)',
  'function renderPinnedWinningsBand(winnings)',
  'function renderPinnedOpenDrawSummary(metrics, winnings)',
  'function updatePinnedOpenDrawSummary(card, detail)',
  'function updatePinnedOpenDrawStats(card, detail)',
  'function handlePinnedFutureToggle(event)',
  'data-pin-open-draw-summary',
  'data-pin-open-draw-stats',
  'data-pin-combination-count',
  'data-pin-winnings-band',
  'data-pin-winning-combination-count',
  'data-pin-line-prize',
  'לפי טבלת מפעל הפיס',
  'data-pin-stat="draw"',
  'data-pin-stat="regular"',
  'data-pin-stat="strong"',
  'data-pin-stat="best"',
  'function renderPinnedFormStatus()',
  'function renderPinnedFutureComparisons()'
];

for (const text of requiredText) {
  assert(html.includes(text), `Missing required four-slot PIN hook: ${text}`);
}

assert(/pinForm\('main', 'baseline'\)/.test(html), 'Main baseline action must be explicit');
assert(/pinForm\('main', 'improved'\)/.test(html), 'Main improved action must be explicit');
assert(/pinForm\('form2', 'baseline'\)/.test(html), 'Form2 baseline action must be explicit');
assert(/pinForm\('form2', 'improved'\)/.test(html), 'Form2 improved action must be explicit');
assert(/getFormSet\(source, mode\)/.test(html), 'PIN must request the selected mode directly');
assert(/polic(?:y|ies)[\s\S]*validated/.test(html), 'Improved PIN must require a validated policy');
assert(/draw\.drawNumber\s*>\s*pin\.anchorDrawNumber/.test(html), 'Future filtering must prefer draw number comparison');
assert(/confirm\(/.test(html), 'Replacing an existing slot must require confirmation');
assert(/cancelBacktest\('dataset-changed'\)/.test(html), 'Loading another dataset must cancel an active Backtest');
assert(html.includes('function renderPinnedFutureGroup(source)'), 'Future PIN results must group by source');
assert(html.includes('class="pinned-future-grid"'), 'Future source group must contain a baseline/improved grid');
assert(html.includes('data-pin-mode="${mode}"'), 'Rendered PIN slots must expose their mode');
assert(
  html.includes("addEventListener('toggle', handlePinnedFutureToggle, true)"),
  'PIN future metrics must use one captured details toggle handler',
);
assert(
  html.includes('הגרלה פתוחה'),
  'PIN future summary must identify the currently open draw',
);
assert(
  html.includes('פתח הגרלה להצגת נתונים'),
  'PIN future summary must define the no-open-draw state',
);
assert(
  /data-pin-open-draw-summary aria-live="polite"/.test(html),
  'PIN future summary must expose one shared polite live region',
);
assert(
  !/data-pin-open-draw-stats aria-live=/.test(html),
  'PIN metric grid must not create a nested live region',
);
assert(
  !html.includes('data-pin-hit-rate'),
  'PIN future metrics must calculate rates from the saved combination count',
);
assert(
  html.includes("fetch(DEFAULT_PRIZES_FILE, { cache: 'no-store' })"),
  'Prize data must load from the versioned static JSON without browser caching',
);
assert(
  !html.includes('doubleLottoList'),
  'The analyzer must not contain a Double-Lotto prize path',
);
assert(shellHtml.includes('data-target="pinnedFutureCard"'), 'ALL_IN_ONE analyzer rail must link to pinned future comparisons');
assert(shellHtml.includes("goToAnalyzerSection('pinnedFutureCard')"), 'ALL_IN_ONE analyzer rail must scroll to pinned future card');

const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
for (const [index, script] of scriptBlocks.entries()) {
  new Function(script);
  console.log(`script ${index + 1} parses`);
}

console.log('Pinned forms verification passed');
