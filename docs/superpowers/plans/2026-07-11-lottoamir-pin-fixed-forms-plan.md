# LottoAmir PIN Fixed Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one pinned first-form and one pinned second-form workflow, with future draw comparisons after the pin anchor.

**Architecture:** Keep the feature inside `lotto_analyzer.html` because the analyzer already owns generated combinations, workbook rows, and comparison rendering. Add localStorage persistence under `lottoPinnedFormsV1`, PIN controls beside each combination section, and a future-comparison card at the end of the results. Add a Node static verification script so the static HTML feature can be checked without a browser test framework.

**Tech Stack:** Static HTML, inline JavaScript, browser `localStorage`, GitHub Pages, Node.js source verification.

## Global Constraints

- Support exactly one pinned form for `main` and exactly one pinned form for `form2`.
- Pinning the same source again replaces the previous pin only after user confirmation.
- Do not change analyzer calculations, Excel parsing, current row comparison, saved JSON comparison, or transfer-to-form payloads.
- Future draw filtering prefers `drawNumber`; date parsing is only fallback.
- The feature must work with the existing default `NUMBERS.xlsx` workbook.

---

### Task 1: Static Verification

**Files:**
- Create: `tests/verify-pinned-forms.js`
- Read: `lotto_analyzer.html`

**Interfaces:**
- Consumes: source HTML from `lotto_analyzer.html`
- Produces: `node tests/verify-pinned-forms.js` returning exit code 0 only when all required PIN hooks exist

- [ ] **Step 1: Write the failing test**

```javascript
const fs = require('fs');

const html = fs.readFileSync('lotto_analyzer.html', 'utf8');

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

const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
for (const [index, script] of scriptBlocks.entries()) {
  new Function(script);
  console.log(`script ${index + 1} parses`);
}

console.log('Pinned forms verification passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-pinned-forms.js`

Expected: FAIL with `Missing required PIN hook: lottoPinnedFormsV1`

- [ ] **Step 3: Keep test for green verification**

No production code changes in this task.

---

### Task 2: PIN UI and Persistence

**Files:**
- Modify: `lotto_analyzer.html`
- Test: `tests/verify-pinned-forms.js`

**Interfaces:**
- Consumes: `currentCombinations`, `currentCombinationsForm2`, `currentData`
- Produces: `pinnedForms`, `pinCurrentForm(source)`, `clearPinnedForm(source)`, `renderPinnedFormStatus()`

- [ ] **Step 1: Add UI hooks**

Add two PIN controls beside the existing combination cards:

```html
<button class="pin-form-btn" id="pinMainFormBtn" onclick="pinCurrentForm('main')">📌 קבע טופס ראשון</button>
<div class="pinned-status" id="pinnedMainStatus" style="display:none;"></div>
```

```html
<button class="pin-form-btn" id="pinForm2Btn" onclick="pinCurrentForm('form2')">📌 קבע טופס שני</button>
<div class="pinned-status" id="pinnedForm2Status" style="display:none;"></div>
```

- [ ] **Step 2: Add storage and helpers**

Add:

```javascript
const PINNED_FORMS_STORAGE_KEY = 'lottoPinnedFormsV1';
let pinnedForms = { version: 1, main: null, form2: null };
```

Add concrete implementations for these exact function declarations:

- `function loadPinnedForms()`
- `function savePinnedForms()`
- `function getCombosForSource(source)`
- `function getLatestDrawAnchor()`
- `function pinCurrentForm(source)`
- `function clearPinnedForm(source)`
- `function renderPinnedFormStatus()`

- [ ] **Step 3: Wire lifecycle**

Call `loadPinnedForms()` on startup and call `renderPinnedFormStatus()` after analysis results render.

- [ ] **Step 4: Run verification**

Run: `node tests/verify-pinned-forms.js`

Expected: it may still fail until Task 3 adds future comparison functions.

---

### Task 3: Future Comparison Card

**Files:**
- Modify: `lotto_analyzer.html`
- Test: `tests/verify-pinned-forms.js`

**Interfaces:**
- Consumes: `pinnedForms`, `currentData`
- Produces: `getFutureRowsForPin(pin)`, `scorePinnedFormAgainstDraw(pin, drawRow)`, `renderPinnedFutureComparisons()`

- [ ] **Step 1: Add future comparison card**

Add near the end of `#results`:

```html
<div class="card card-highlight" id="pinnedFutureCard">
  <div class="card-header">📌 השוואות עתידיות לטפסים מקובעים</div>
  <div id="pinnedFutureContent"></div>
</div>
```

- [ ] **Step 2: Add future row detection**

Implement:

```javascript
function getFutureRowsForPin(pin) {
  return currentData
    .map(function(draw, index) { return { draw: draw, rowNumber: index + 1 }; })
    .filter(function(item) {
      var draw = item.draw || {};
      if (pin.anchorDrawNumber != null && draw.drawNumber != null) {
        return draw.drawNumber > pin.anchorDrawNumber;
      }
      var drawTime = parseDrawDate(draw.date);
      var anchorTime = parseDrawDate(pin.anchorDrawDate);
      return drawTime != null && anchorTime != null && drawTime > anchorTime;
    });
}
```

- [ ] **Step 3: Add scoring**

Implement:

```javascript
function scorePinnedFormAgainstDraw(pin, drawRow) {
  var drawNumbers = (drawRow.numbers || []).filter(function(n) { return !isNaN(n) && n >= 1 && n <= 37; });
  var drawStrong = drawRow.strong;
  var results = (pin.combinations || []).map(function(combo, index) {
    var regularMatches = (combo.numbers || []).filter(function(n) { return drawNumbers.includes(n); }).length;
    var strongMatch = combo.strong === drawStrong ? 1 : 0;
    return { combo: combo, index: index, regularMatches: regularMatches, strongMatch: strongMatch };
  });
  results.sort(function(a, b) { return b.regularMatches - a.regularMatches || b.strongMatch - a.strongMatch; });
  return { results: results, best: results[0] || null };
}
```

- [ ] **Step 4: Render future summaries**

Render one section per pinned source, including no-future-draws copy when appropriate.

- [ ] **Step 5: Run verification**

Run: `node tests/verify-pinned-forms.js`

Expected: PASS and each inline script parses.

---

### Task 4: Final Verification and Publish

**Files:**
- Modify: `lotto_analyzer.html`
- Include: `tests/verify-pinned-forms.js`, this plan, previous spec

**Interfaces:**
- Consumes: GitHub Pages deployment from `main`
- Produces: live site with PIN feature

- [ ] **Step 1: Run local checks**

Run:

```powershell
node tests/verify-pinned-forms.js
git diff --check
git status -sb
```

Expected: verification passes, no whitespace errors, only intended files changed.

- [ ] **Step 2: Commit**

Run:

```powershell
git add lotto_analyzer.html tests/verify-pinned-forms.js docs/superpowers/plans/2026-07-11-lottoamir-pin-fixed-forms-plan.md
git commit -m "feat: add pinned lotto forms"
```

- [ ] **Step 3: Push**

Run:

```powershell
git push
```

- [ ] **Step 4: Verify live site**

Run a cache-busted fetch against GitHub Pages and assert the public `lotto_analyzer.html` contains `lottoPinnedFormsV1`, `pinMainFormBtn`, and `pinnedFutureCard`.
