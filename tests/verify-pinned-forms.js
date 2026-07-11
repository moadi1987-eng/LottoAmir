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
  'id="pinMainFormBtn"',
  'id="pinForm2Btn"',
  'id="pinnedMainStatus"',
  'id="pinnedForm2Status"',
  'id="pinnedFutureCard"',
  'id="pinnedFutureContent"',
  'function loadPinnedForms()',
  'function savePinnedForms()',
  'function pinCurrentForm(source)',
  'function clearPinnedForm(source)',
  'function getCombosForSource(source)',
  'function getLatestDrawAnchor()',
  'function getFutureRowsForPin(pin)',
  'function scorePinnedFormAgainstDraw(pin, drawRow)',
  'function renderPinnedFormStatus()',
  'function renderPinnedFutureComparisons()'
];

for (const text of requiredText) {
  assert(html.includes(text), `Missing required PIN hook: ${text}`);
}

assert(/pinCurrentForm\('main'\)/.test(html), 'Main PIN button must pin main combinations');
assert(/pinCurrentForm\('form2'\)/.test(html), 'Form2 PIN button must pin second form combinations');
assert(/currentCombinationsForm2/.test(html), 'PIN feature must reference second form combinations');
assert(/draw\.drawNumber\s*>\s*pin\.anchorDrawNumber/.test(html), 'Future filtering must prefer draw number comparison');
assert(/confirm\(/.test(html), 'Replacing an existing PIN must require confirmation');
assert(shellHtml.includes('data-target="pinnedFutureCard"'), 'ALL_IN_ONE analyzer rail must link to pinned future comparisons');
assert(shellHtml.includes("goToAnalyzerSection('pinnedFutureCard')"), 'ALL_IN_ONE analyzer rail must scroll to pinned future card');

const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
for (const [index, script] of scriptBlocks.entries()) {
  new Function(script);
  console.log(`script ${index + 1} parses`);
}

console.log('Pinned forms verification passed');
