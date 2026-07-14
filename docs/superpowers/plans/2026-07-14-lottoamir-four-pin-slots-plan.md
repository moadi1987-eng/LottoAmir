# LottoAmir Four Independent PIN Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current one-PIN-per-form behavior with four independent browser-persisted slots: baseline and improved PINs for both existing 14-combination forms.

**Architecture:** Keep the build-free single-page architecture and move PIN state to a normalized V2 document nested by source and mode. All PIN operations receive `(source, mode)` explicitly, save a cloned candidate state atomically, and reuse the existing future-draw scoring functions. Rendering stays inside `lotto_analyzer.html`; focused Node and Playwright tests verify migration, isolation, eligibility, grouped comparison, and responsive layout.

**Tech Stack:** Static HTML/CSS/JavaScript, browser `localStorage`, existing Backtest state, Node.js `assert`, Playwright from the bundled Codex runtime, Git, GitHub Pages.

## Global Constraints

- Support exactly four slots: `main.baseline`, `main.improved`, `form2.baseline`, and `form2.improved`.
- Store V2 state under `lottoPinnedFormsV2`; treat `lottoPinnedFormsV1` as a read-only migration source and retain it unchanged.
- Run V1 migration only when the V2 key is absent; never repopulate an existing empty V2 document from V1.
- Migrate old `main` and `form2` PINs only into the matching baseline slots.
- Replace or clear only the exact `(source, mode)` slot selected by the user.
- `PIN בסיס` must snapshot `getFormSet(source, 'baseline')` even while improved mode is visible.
- `PIN משופר` must snapshot `getFormSet(source, 'improved')` and remain disabled unless that source has a validated Backtest policy and optimized rows.
- Saved improved PINs remain available after the current workbook or Backtest state resets.
- Each slot retains its own PIN timestamp and draw anchor; future comparisons use that slot's anchor.
- Preserve existing generation, Backtest, comparison, transfer, workbook loading, automatic updater, and `Lotto_All_In_One.html` behavior.
- Do not force baseline and improved snapshots to differ when the generated rows are legitimately identical.
- Keep the UI readable at 1440x900 and 390x844 without overlap or horizontal overflow.
- Add no runtime dependency, build step, cloud synchronization, or lottery-strategy change.

## File Map

- Modify `lotto_analyzer.html`: V2 state, migration, mode-specific operations, four PIN actions, two status rows per source, grouped future comparison, and responsive styles.
- Modify `tests/verify-pinned-forms.js`: static contracts, mode-aware hooks, migration tokens, script parsing, and shell-link regression.
- Create `tests/verify-pinned-forms-playwright.js`: real-browser migration, four-slot isolation, Backtest eligibility, status rendering, future-comparison grouping, and desktop/mobile overflow checks.
- Do not modify `Lotto_All_In_One.html`: its existing `pinnedFutureCard` rail link remains the integration contract.

## Execution Setup

Before Task 1, invoke `superpowers:using-git-worktrees` and create an isolated worktree on branch `codex/lottoamir-four-pin-slots` from the commit containing this plan. Run every command below from that worktree unless a step explicitly switches back to `main`.

---

### Task 1: Implement The Four-Slot PIN State And Actions

**Files:**
- Modify: `tests/verify-pinned-forms.js`
- Create: `tests/verify-pinned-forms-playwright.js`
- Modify: `lotto_analyzer.html:639-700, 917-921, 1145-1178, 1312-1410, 1547-1559, 1649-1804, 1960-1962, 2053-2106, 2559-2563`

**Interfaces:**
- Consumes: `getFormSet(source, mode)`, `baselineForms`, `optimizedForms`, `currentBacktestResult`, `currentData`, `lastAnalysis`, `getLatestDrawAnchor()`, and existing future-draw scoring.
- Produces: `createEmptyPinnedForms()`, `normalizePinnedSlot(pin, source, mode)`, `normalizePinnedFormsDocument(parsed)`, `migratePinnedFormsV1(parsed)`, `loadPinnedForms()`, `savePinnedForms(nextState, options)`, `getPinnedForm(source, mode)`, `canPinForm(source, mode)`, `pinForm(source, mode)`, `clearPinnedForm(source, mode)`, `sendPinnedFormToForm(source, mode)`, and `updatePinActionState(source)`.

- [ ] **Step 1: Replace the static PIN contract with failing V2 and four-slot assertions**

Replace the V1-only hooks and active-mode assertion in `tests/verify-pinned-forms.js` with this contract while retaining the existing script parsing and `Lotto_All_In_One.html` rail assertions:

```js
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
```

- [ ] **Step 2: Run the static test and verify the V2 contract fails**

Run: `node tests/verify-pinned-forms.js`

Expected: FAIL on `lottoPinnedFormsV2` or the first missing four-slot button ID.

- [ ] **Step 3: Create a failing browser test for migration and independent operations**

Create `tests/verify-pinned-forms-playwright.js` with the complete initial test below:

```js
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');

function contentType(filePath) {
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function createServer() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const filePath = path.resolve(root, `.${pathname === '/' ? '/lotto_analyzer.html' : pathname}`);
    if (!filePath.startsWith(`${root}${path.sep}`)
      || !fs.existsSync(filePath)
      || !fs.statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  });
}

function makeCombinations(seed, label) {
  return Array.from({ length: 14 }, (_, index) => ({
    comboNum: index + 1,
    strategy: `${label} ${index + 1}`,
    numbers: Array.from({ length: 6 }, (_, offset) => ((seed + index + offset * 6) % 37) + 1)
      .sort((a, b) => a - b),
    strong: (index % 7) + 1,
  }));
}

function makePin(source, mode, seed) {
  return {
    source,
    mode,
    label: `${source}-${mode}`,
    pinnedAt: '2026-07-14T12:00:00.000Z',
    anchorDrawNumber: 4000,
    anchorDrawDate: '14/07/2026',
    combinations: makeCombinations(seed, `${source}-${mode}`),
  };
}

async function openAnalyzer(browser, baseUrl, initState) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (initState) {
    await context.addInitScript(state => {
      for (const [key, value] of Object.entries(state)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    }, initState);
  }
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  await page.route(/fonts\.googleapis\.com|cdn\.sheetjs\.com/, route => route.abort());
  await page.goto(`${baseUrl}/lotto_analyzer.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof pinForm === 'function');
  return { context, page };
}

(async function verifyPinnedForms() {
  const server = createServer();
  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const browser = await chromium.launch(launchOptions);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const legacyMain = makePin('main', 'baseline', 1);
    const legacyForm2 = makePin('form2', 'baseline', 5);
    delete legacyMain.mode;
    delete legacyForm2.mode;
    const legacy = {
      version: 1,
      main: legacyMain,
      form2: legacyForm2,
    };
    const migratedSession = await openAnalyzer(browser, baseUrl, { lottoPinnedFormsV1: legacy });
    const migrated = await migratedSession.page.evaluate(() => ({
      memory: pinnedForms,
      v2: JSON.parse(localStorage.getItem('lottoPinnedFormsV2')),
      v1: JSON.parse(localStorage.getItem('lottoPinnedFormsV1')),
    }));
    assert.ok(migrated.memory.main.baseline);
    assert.ok(migrated.memory.form2.baseline);
    assert.strictEqual(migrated.memory.main.improved, null);
    assert.strictEqual(migrated.memory.form2.improved, null);
    assert.strictEqual(migrated.memory.main.baseline.mode, 'baseline');
    assert.deepStrictEqual(migrated.v1, legacy);

    await migratedSession.page.evaluate(() => {
      localStorage.setItem('lottoPinnedFormsV2', JSON.stringify({
        version: 2,
        main: { baseline: null, improved: null },
        form2: { baseline: null, improved: null },
      }));
    });
    await migratedSession.page.reload({ waitUntil: 'domcontentloaded' });
    assert.strictEqual(await migratedSession.page.evaluate(() => pinnedForms.main.baseline), null);

    await migratedSession.page.evaluate(validPin => {
      localStorage.setItem('lottoPinnedFormsV2', JSON.stringify({
        version: 2,
        main: { baseline: validPin, improved: { combinations: 'invalid' } },
        form2: { baseline: null, improved: null },
      }));
    }, legacyMain);
    await migratedSession.page.reload({ waitUntil: 'domcontentloaded' });
    const normalizedMalformedState = await migratedSession.page.evaluate(() => pinnedForms);
    assert.ok(normalizedMalformedState.main.baseline);
    assert.strictEqual(normalizedMalformedState.main.improved, null);
    await migratedSession.context.close();

    const cleanSession = await openAnalyzer(browser, baseUrl);
    assert.ok(await cleanSession.page.locator('#pinMainBaselineBtn').isDisabled());
    assert.ok(await cleanSession.page.locator('#pinMainImprovedBtn').isDisabled());
    const fixtures = {
      baseline: { main: makeCombinations(2, 'main-base'), form2: makeCombinations(8, 'form2-base') },
      improved: { main: makeCombinations(14, 'main-improved'), form2: makeCombinations(20, 'form2-improved') },
    };
    const result = await cleanSession.page.evaluate(forms => {
      currentData = [{ drawNumber: 4000, date: '14/07/2026', numbers: [1, 2, 3, 4, 5, 6], strong: 1 }];
      lastAnalysis = {};
      baselineForms = forms.baseline;
      optimizedForms = forms.improved;
      currentBacktestResult = { policies: { main: { validated: true }, form2: { validated: true } } };
      activeFormModes = { main: 'improved', form2: 'improved' };

      const eligibility = {
        baseline: canPinForm('main', 'baseline'),
        improved: canPinForm('main', 'improved'),
      };
      pinForm('main', 'baseline');
      pinForm('main', 'improved');
      pinForm('form2', 'baseline');
      pinForm('form2', 'improved');
      return { eligibility, state: pinnedForms };
    }, fixtures);
    assert.deepStrictEqual(result.eligibility, { baseline: true, improved: true });
    assert.strictEqual(result.state.main.baseline.combinations[0].strategy, 'main-base 1');
    assert.strictEqual(result.state.main.improved.combinations[0].strategy, 'main-improved 1');
    assert.strictEqual(result.state.form2.baseline.combinations[0].strategy, 'form2-base 1');
    assert.strictEqual(result.state.form2.improved.combinations[0].strategy, 'form2-improved 1');
    assert.ok(!(await cleanSession.page.locator('#pinMainBaselineBtn').isDisabled()));
    assert.ok(!(await cleanSession.page.locator('#pinMainImprovedBtn').isDisabled()));

    const replaced = await cleanSession.page.evaluate(replacementRows => {
      const neighborsBefore = JSON.stringify({
        mainImproved: pinnedForms.main.improved,
        form2Baseline: pinnedForms.form2.baseline,
        form2Improved: pinnedForms.form2.improved,
      });
      baselineForms.main = replacementRows;
      activeFormModes.main = 'improved';
      pinForm('main', 'baseline');
      return {
        strategy: pinnedForms.main.baseline.combinations[0].strategy,
        neighborsBefore,
        neighborsAfter: JSON.stringify({
          mainImproved: pinnedForms.main.improved,
          form2Baseline: pinnedForms.form2.baseline,
          form2Improved: pinnedForms.form2.improved,
        }),
      };
    }, makeCombinations(27, 'main-base-replacement'));
    assert.strictEqual(replaced.strategy, 'main-base-replacement 1');
    assert.strictEqual(replaced.neighborsBefore, replaced.neighborsAfter);

    const isolated = await cleanSession.page.evaluate(() => {
      const before = JSON.stringify({
        mainImproved: pinnedForms.main.improved,
        form2Baseline: pinnedForms.form2.baseline,
        form2Improved: pinnedForms.form2.improved,
      });
      clearPinnedForm('main', 'baseline');
      currentBacktestResult = null;
      optimizedForms = { main: null, form2: null };
      renderPinnedFormStatus();
      return {
        before,
        after: JSON.stringify({
          mainImproved: pinnedForms.main.improved,
          form2Baseline: pinnedForms.form2.baseline,
          form2Improved: pinnedForms.form2.improved,
        }),
        cleared: pinnedForms.main.baseline,
        improvedEligible: canPinForm('main', 'improved'),
        savedImproved: getPinnedForm('main', 'improved'),
      };
    });
    assert.strictEqual(isolated.cleared, null);
    assert.strictEqual(isolated.before, isolated.after);
    assert.strictEqual(isolated.improvedEligible, false);
    assert.ok(isolated.savedImproved);
    assert.ok(await cleanSession.page.locator('#pinMainImprovedBtn').isDisabled());
    assert.ok((await cleanSession.page.locator('[data-pin-source="main"][data-pin-mode="baseline"]').textContent()).includes('לא קובע'));
    assert.ok((await cleanSession.page.locator('[data-pin-source="main"][data-pin-mode="improved"]').textContent()).includes('משופר'));

    const atomicFailure = await cleanSession.page.evaluate(() => {
      const before = JSON.stringify(pinnedForms);
      const originalSetItem = Storage.prototype.setItem;
      Object.defineProperty(Storage.prototype, 'setItem', {
        configurable: true,
        value() { throw new Error('simulated quota failure'); },
      });
      const nextState = normalizePinnedFormsDocument(pinnedForms);
      nextState.main.improved = null;
      const saved = savePinnedForms(nextState, { silent: true });
      Object.defineProperty(Storage.prototype, 'setItem', {
        configurable: true,
        writable: true,
        value: originalSetItem,
      });
      return { saved, before, after: JSON.stringify(pinnedForms) };
    });
    assert.strictEqual(atomicFailure.saved, false);
    assert.strictEqual(atomicFailure.before, atomicFailure.after);
    await cleanSession.context.close();

    console.log('Pinned forms Playwright verification passed');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}()).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Run the browser test and verify the missing API failure**

Run:

```powershell
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tests\verify-pinned-forms-playwright.js
```

Expected: FAIL because `pinForm` is not defined or the V2 state is absent.

- [ ] **Step 5: Replace the storage constants and V1 state loader**

In `lotto_analyzer.html`, replace the existing PIN constant/state block and `loadPinnedForms`/`savePinnedForms`/`getCombosForSource` functions with this mode-aware implementation:

```js
const PINNED_FORMS_STORAGE_KEY_V1 = 'lottoPinnedFormsV1';
const PINNED_FORMS_STORAGE_KEY = 'lottoPinnedFormsV2';
const PINNED_FORM_MODES = {
  baseline: { label: 'בסיס' },
  improved: { label: 'משופר' }
};

function createEmptyPinnedForms() {
  return {
    version: 2,
    main: { baseline: null, improved: null },
    form2: { baseline: null, improved: null }
  };
}

let pinnedForms = createEmptyPinnedForms();

function normalizePinnedSlot(pin, source, mode) {
  if (!pin || typeof pin !== 'object' || !Array.isArray(pin.combinations)) return null;
  const sourceMeta = PINNED_FORM_SOURCES[source];
  const modeMeta = PINNED_FORM_MODES[mode];
  if (!sourceMeta || !modeMeta) return null;
  const combinations = pin.combinations
    .map(normalizePinnedCombination)
    .filter(combo => combo.numbers.length === 6)
    .slice(0, 14);
  if (combinations.length === 0) return null;
  return {
    source,
    mode,
    label: `${sourceMeta.label} - ${modeMeta.label}`,
    fullLabel: `${sourceMeta.fullLabel} - ${modeMeta.label}`,
    pinnedAt: pin.pinnedAt || new Date().toISOString(),
    anchorDrawNumber: pin.anchorDrawNumber != null ? pin.anchorDrawNumber : null,
    anchorDrawDate: pin.anchorDrawDate != null ? pin.anchorDrawDate : null,
    combinations
  };
}

function normalizePinnedFormsDocument(parsed) {
  const normalized = createEmptyPinnedForms();
  for (const source of ['main', 'form2']) {
    for (const mode of ['baseline', 'improved']) {
      normalized[source][mode] = normalizePinnedSlot(
        parsed && parsed[source] ? parsed[source][mode] : null,
        source,
        mode
      );
    }
  }
  return normalized;
}

function migratePinnedFormsV1(parsed) {
  const migrated = createEmptyPinnedForms();
  migrated.main.baseline = normalizePinnedSlot(parsed && parsed.main, 'main', 'baseline');
  migrated.form2.baseline = normalizePinnedSlot(parsed && parsed.form2, 'form2', 'baseline');
  return migrated;
}

function loadPinnedForms() {
  try {
    const rawV2 = localStorage.getItem(PINNED_FORMS_STORAGE_KEY);
    if (rawV2 !== null) {
      pinnedForms = normalizePinnedFormsDocument(JSON.parse(rawV2));
      return pinnedForms;
    }
    const rawV1 = localStorage.getItem(PINNED_FORMS_STORAGE_KEY_V1);
    const migrated = rawV1 ? migratePinnedFormsV1(JSON.parse(rawV1)) : createEmptyPinnedForms();
    if (!savePinnedForms(migrated, { silent: true })) pinnedForms = migrated;
  } catch (error) {
    console.warn('Pinned forms load error:', error);
    pinnedForms = createEmptyPinnedForms();
  }
  return pinnedForms;
}

function savePinnedForms(nextState, options = {}) {
  const normalized = normalizePinnedFormsDocument(nextState);
  try {
    localStorage.setItem(PINNED_FORMS_STORAGE_KEY, JSON.stringify(normalized));
    pinnedForms = normalized;
    return true;
  } catch (error) {
    if (!options.silent) alert('הדפדפן לא הצליח לשמור את ה-PIN. המצב הקודם נשאר ללא שינוי.');
    console.warn('Pinned forms save error:', error);
    return false;
  }
}

function getPinnedForm(source, mode) {
  return pinnedForms[source] && pinnedForms[source][mode] ? pinnedForms[source][mode] : null;
}
```

- [ ] **Step 6: Add explicit eligibility, save, clear, and transfer operations**

Replace `pinCurrentForm`, `clearPinnedForm`, and `sendPinnedToForm` with these complete functions:

```js
function canPinForm(source, mode) {
  if (!['main', 'form2'].includes(source) || !['baseline', 'improved'].includes(mode)) return false;
  if (!currentData || currentData.length === 0 || !lastAnalysis) return false;
  const rows = getFormSet(source, mode);
  if (!rows || rows.length === 0) return false;
  if (mode === 'baseline') return true;
  const policy = currentBacktestResult && currentBacktestResult.policies
    ? currentBacktestResult.policies[source]
    : null;
  return Boolean(policy && policy.validated === true && optimizedForms[source]);
}

function pinForm(source, mode) {
  const sourceMeta = PINNED_FORM_SOURCES[source];
  const modeMeta = PINNED_FORM_MODES[mode];
  if (!sourceMeta || !modeMeta) return false;
  if (!currentData || currentData.length === 0 || !lastAnalysis) {
    alert('הרץ ניתוח קודם כדי לקבע את הקומבינציות.');
    return false;
  }
  if (mode === 'improved' && !canPinForm(source, mode)) {
    alert('יש להריץ Backtest מאומת עבור הטופס הזה לפני קיבוע טופס משופר.');
    return false;
  }
  const combinations = getFormSet(source, mode);
  if (!combinations || combinations.length === 0) {
    alert('אין קומבינציות לקיבוע בטופס הזה.');
    return false;
  }
  if (getPinnedForm(source, mode)
    && !confirm(`כבר קיים PIN עבור ${sourceMeta.label} - ${modeMeta.label}. להחליף אותו?`)) {
    return false;
  }
  const anchor = getLatestDrawAnchor();
  const nextState = normalizePinnedFormsDocument(pinnedForms);
  nextState[source][mode] = {
    source,
    mode,
    label: `${sourceMeta.label} - ${modeMeta.label}`,
    fullLabel: `${sourceMeta.fullLabel} - ${modeMeta.label}`,
    pinnedAt: new Date().toISOString(),
    anchorDrawNumber: anchor.anchorDrawNumber,
    anchorDrawDate: anchor.anchorDrawDate,
    combinations: cloneFormRows(combinations).slice(0, 14).map(normalizePinnedCombination)
  };
  if (!savePinnedForms(nextState)) return false;
  renderPinnedFormStatus();
  renderPinnedFutureComparisons();
  alert(`${sourceMeta.label} - ${modeMeta.label} קובע ונשמר.`);
  return true;
}

function clearPinnedForm(source, mode) {
  const pin = getPinnedForm(source, mode);
  if (!pin) return false;
  if (!confirm(`לבטל את ה-PIN של ${pin.label}?`)) return false;
  const nextState = normalizePinnedFormsDocument(pinnedForms);
  nextState[source][mode] = null;
  if (!savePinnedForms(nextState)) return false;
  renderPinnedFormStatus();
  renderPinnedFutureComparisons();
  return true;
}

function sendPinnedFormToForm(source, mode) {
  const pin = getPinnedForm(source, mode);
  if (!pin || !pin.combinations.length) {
    alert('אין טופס מקובע לשליחה.');
    return false;
  }
  const combinations = cloneFormRows(pin.combinations).slice(0, 14);
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'FILL_ALL_TABLES', combinations }, '*');
  } else {
    localStorage.setItem('lottoFillAll', JSON.stringify({
      combinations,
      timestamp: Date.now(),
      source,
      mode,
      pinned: true
    }));
  }
  alert(`${combinations.length} קומבינציות מקובעות נשלחו לטופס.`);
  return true;
}
```

- [ ] **Step 7: Replace each source-level button and status renderer with two explicit slots**

Use these complete toolbar/status blocks for the two sources:

```html
<div class="pin-toolbar" aria-label="קיבוע טופס ראשון">
  <button type="button" class="pin-form-btn" id="pinMainBaselineBtn"
    onclick="pinForm('main', 'baseline')" disabled>📌 PIN בסיס</button>
  <button type="button" class="pin-form-btn pin-form-btn-improved" id="pinMainImprovedBtn"
    onclick="pinForm('main', 'improved')" disabled>📌 PIN משופר</button>
</div>
<div class="pinned-status" id="pinnedMainStatus"></div>

<div class="pin-toolbar" aria-label="קיבוע טופס שני">
  <button type="button" class="pin-form-btn" id="pinForm2BaselineBtn"
    onclick="pinForm('form2', 'baseline')" disabled>📌 PIN בסיס</button>
  <button type="button" class="pin-form-btn pin-form-btn-improved" id="pinForm2ImprovedBtn"
    onclick="pinForm('form2', 'improved')" disabled>📌 PIN משופר</button>
</div>
<div class="pinned-status" id="pinnedForm2Status"></div>
```

Replace `renderPinnedStatusForSource` and add button-state updates:

```js
function updatePinActionState(source) {
  const prefix = source === 'form2' ? 'pinForm2' : 'pinMain';
  const baselineButton = document.getElementById(`${prefix}BaselineBtn`);
  const improvedButton = document.getElementById(`${prefix}ImprovedBtn`);
  if (baselineButton) baselineButton.disabled = !canPinForm(source, 'baseline');
  if (improvedButton) {
    improvedButton.disabled = !canPinForm(source, 'improved');
    improvedButton.title = improvedButton.disabled
      ? 'זמין לאחר Backtest מאומת עבור הטופס הזה'
      : 'קבע את הקומבינציות המשופרות הנוכחיות';
  }
}

function renderPinnedFormStatus() {
  renderPinnedStatusForSource('main', 'pinnedMainStatus');
  renderPinnedStatusForSource('form2', 'pinnedForm2Status');
  updatePinActionState('main');
  updatePinActionState('form2');
}

function renderPinnedStatusForSource(source, elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.innerHTML = ['baseline', 'improved'].map(mode => {
    const pin = getPinnedForm(source, mode);
    const modeLabel = PINNED_FORM_MODES[mode].label;
    if (!pin) {
      return `<div class="pinned-status-main pinned-status-empty" data-pin-source="${source}" data-pin-mode="${mode}">
        <div class="pinned-status-title">${modeLabel}</div>
        <div class="pinned-status-meta">לא קובע</div>
      </div>`;
    }
    return `<div class="pinned-status-main" data-pin-source="${source}" data-pin-mode="${mode}">
      <div>
        <div class="pinned-status-title">📌 ${pin.label}</div>
        <div class="pinned-status-meta">קובע: ${formatPinnedDate(pin.pinnedAt)}<br>
          עוגן: ${buildAnchorLabel(pin)} • ${pin.combinations.length} קומבינציות</div>
      </div>
      <div class="pinned-actions">
        <button class="pill-btn" onclick="renderPinnedFutureComparisons(); scrollToSection('pinnedFutureCard')">השווה עתידי</button>
        <button class="pill-btn" onclick="sendPinnedFormToForm('${source}', '${mode}')">שלח לטופס</button>
        <button class="pill-btn" onclick="pinForm('${source}', '${mode}')">החלף</button>
        <button class="pill-btn" onclick="clearPinnedForm('${source}', '${mode}')">בטל PIN</button>
      </div>
    </div>`;
  }).join('');
}
```

- [ ] **Step 8: Update all PIN consumers and Backtest lifecycle hooks**

Use a stable flattening helper so the existing future renderer works with V2 before Task 2 groups it:

```js
function listPinnedForms() {
  return ['main', 'form2'].flatMap(source =>
    ['baseline', 'improved'].map(mode => getPinnedForm(source, mode)).filter(Boolean)
  );
}

function renderPinnedFutureComparisons() {
  const container = document.getElementById('pinnedFutureContent');
  if (!container) return;
  const activePins = listPinnedForms();
  if (activePins.length === 0) {
    container.innerHTML = '<p class="pinned-empty-message">אין עדיין טפסים מקובעים.</p>';
    return;
  }
  container.innerHTML = activePins.map(renderPinnedFutureSource).join('');
}
```

Also make these lifecycle changes:

```js
// At the start of processAnalysisRows, before replacing currentData:
lastAnalysis = null;
renderPinnedFormStatus();

// At the end of hydrateOptimizedForms:
renderPinnedFormStatus();

// After a successful Backtest message hydrates optimized forms:
renderPinnedFormStatus();
```

Keep the existing calls after analysis completion. These calls disable improved PIN actions during a dataset change and re-enable only the source whose hydrated policy is validated.

- [ ] **Step 9: Add compact two-row status styles and disabled-button behavior**

Adjust the existing PIN styles without changing the page palette:

```css
.pin-form-btn:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
.pin-form-btn-improved { border-color: var(--success-border); color: var(--success); background: rgba(16, 185, 129, .10); }
.pinned-status { display: grid; gap: 8px; }
.pinned-status-main { margin: 0; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.pinned-status-main:last-child { padding-bottom: 0; border-bottom: 0; }
.pinned-status-empty { min-height: 38px; }
.pinned-empty-message { color: var(--text-muted); text-align: center; }
```

At the existing mobile breakpoint, retain the one-column action layout and change `.pin-toolbar` to two stable columns above 420px and one column at 420px or below:

```css
@media (max-width: 760px) {
  .pin-toolbar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
}
@media (max-width: 420px) {
  .pin-toolbar { grid-template-columns: 1fr; }
}
```

- [ ] **Step 10: Run the focused tests**

Run:

```powershell
node tests\verify-pinned-forms.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tests\verify-pinned-forms-playwright.js
```

Expected: `Pinned forms verification passed` and `Pinned forms Playwright verification passed`.

- [ ] **Step 11: Commit the four-slot state and actions**

Run:

```powershell
git add lotto_analyzer.html tests/verify-pinned-forms.js tests/verify-pinned-forms-playwright.js
git commit -m "feat: add four independent lotto pin slots"
```

Expected: one commit containing V2 migration, four isolated operations, explicit buttons/status rows, and focused tests.

---

### Task 2: Group Future Comparisons And Verify Responsive Layout

**Files:**
- Modify: `tests/verify-pinned-forms.js`
- Modify: `tests/verify-pinned-forms-playwright.js`
- Modify: `lotto_analyzer.html:687-710, 917-923, 1795-1880`

**Interfaces:**
- Consumes: `getPinnedForm(source, mode)`, `renderPinnedFutureSource(pin)`, and existing scoring/filtering functions.
- Produces: `renderPinnedFutureGroup(source)` and a stable two-column desktop/one-column mobile comparison layout.

- [ ] **Step 1: Add failing grouped-render contracts**

Append to `tests/verify-pinned-forms.js`:

```js
assert(html.includes('function renderPinnedFutureGroup(source)'), 'Future PIN results must group by source');
assert(html.includes('class="pinned-future-grid"'), 'Future source group must contain a baseline/improved grid');
assert(html.includes('data-pin-mode="${mode}"'), 'Rendered PIN slots must expose their mode');
```

In `tests/verify-pinned-forms-playwright.js`, add `outputDir` near `root`, create it, and append this helper before the main IIFE:

```js
const outputDir = path.join(root, 'test-results');
fs.mkdirSync(outputDir, { recursive: true });

async function verifyResponsiveGroups(browser, baseUrl, viewport, screenshotName) {
  const session = await openAnalyzer(browser, baseUrl);
  await session.page.setViewportSize(viewport);
  const pins = {
    version: 2,
    main: { baseline: makePin('main', 'baseline', 1), improved: makePin('main', 'improved', 8) },
    form2: { baseline: makePin('form2', 'baseline', 15), improved: makePin('form2', 'improved', 22) },
  };
  pins.main.improved.anchorDrawNumber = 4001;
  pins.main.improved.anchorDrawDate = '17/07/2026';
  await session.page.evaluate(pins => {
    pinnedForms = pins;
    currentData = [
      { drawNumber: 4002, date: '20/07/2026', numbers: [1, 2, 3, 4, 5, 6], strong: 1 },
      { drawNumber: 4001, date: '17/07/2026', numbers: [7, 8, 9, 10, 11, 12], strong: 2 },
    ];
    document.getElementById('results').style.display = 'block';
    renderPinnedFormStatus();
    renderPinnedFutureComparisons();
  }, pins);

  assert.strictEqual(await session.page.locator('.pinned-future-group').count(), 2);
  assert.strictEqual(await session.page.locator('.pinned-future-source').count(), 4);
  const modes = await session.page.locator('.pinned-future-source').evaluateAll(nodes =>
    nodes.map(node => node.dataset.pinMode)
  );
  assert.deepStrictEqual(modes, ['baseline', 'improved', 'baseline', 'improved']);
  const mainGroup = session.page.locator('.pinned-future-group[data-pin-source="main"]');
  assert.ok((await mainGroup.locator('[data-pin-mode="baseline"]').textContent()).includes('2 הגרלות עתידיות'));
  assert.ok((await mainGroup.locator('[data-pin-mode="improved"]').textContent()).includes('1 הגרלות עתידיות'));

  const width = await session.page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  assert.ok(width.scroll <= width.client + 1, 'Analyzer must not overflow horizontally');

  const firstGroupSlots = session.page.locator('.pinned-future-group').first().locator('.pinned-future-source');
  const boxes = await firstGroupSlots.evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width };
  }));
  if (viewport.width > 760) assert.ok(Math.abs(boxes[0].top - boxes[1].top) < 2, 'Desktop slots must be side by side');
  else assert.ok(boxes[1].top > boxes[0].top, 'Mobile slots must stack');

  await session.page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true });
  await session.context.close();
}
```

Call it inside the main IIFE after the behavioral session closes:

```js
await verifyResponsiveGroups(browser, baseUrl, { width: 1440, height: 900 }, 'pin-slots-desktop.png');
await verifyResponsiveGroups(browser, baseUrl, { width: 390, height: 844 }, 'pin-slots-mobile.png');
```

- [ ] **Step 2: Run focused tests and verify grouping fails**

Run:

```powershell
node tests\verify-pinned-forms.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tests\verify-pinned-forms-playwright.js
```

Expected: static test FAILS on `renderPinnedFutureGroup`; browser test fails to find two source groups.

- [ ] **Step 3: Group baseline and improved renderers under each source**

Replace Task 1's flat `renderPinnedFutureComparisons` with:

```js
function renderPinnedFutureComparisons() {
  const container = document.getElementById('pinnedFutureContent');
  if (!container) return;
  if (listPinnedForms().length === 0) {
    container.innerHTML = '<p class="pinned-empty-message">אין עדיין טפסים מקובעים.</p>';
    return;
  }
  container.innerHTML = ['main', 'form2'].map(renderPinnedFutureGroup).join('');
}

function renderPinnedFutureGroup(source) {
  const sourceMeta = PINNED_FORM_SOURCES[source];
  const slots = ['baseline', 'improved'].map(mode => {
    const pin = getPinnedForm(source, mode);
    if (pin) return renderPinnedFutureSource(pin);
    return `<div class="pinned-future-source pinned-future-empty" data-pin-mode="${mode}">
      <div class="pinned-future-title">${PINNED_FORM_MODES[mode].label}</div>
      <div class="pinned-status-meta">לא קובע</div>
    </div>`;
  }).join('');
  return `<section class="pinned-future-group" data-pin-source="${source}">
    <h3 class="pinned-future-group-title">${sourceMeta.label}</h3>
    <div class="pinned-future-grid">${slots}</div>
  </section>`;
}
```

In every return branch of `renderPinnedFutureSource(pin)`, change its outer element to include mode identity:

```html
<div class="pinned-future-source" data-pin-mode="${pin.mode}">
```

Keep `getFutureRowsForPin`, `scorePinnedFormAgainstDraw`, aggregate calculations, and draw-detail rendering unchanged.

- [ ] **Step 4: Add stable responsive comparison styles**

Add beside the existing future-PIN styles:

```css
.pinned-future-group { margin-bottom: 18px; }
.pinned-future-group:last-child { margin-bottom: 0; }
.pinned-future-group-title { margin: 0 0 10px; font-size: 15px; color: var(--text); }
.pinned-future-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
.pinned-future-source { min-width: 0; margin: 0; }
.pinned-future-empty { min-height: 96px; display: flex; flex-direction: column; justify-content: center; }

@media (max-width: 760px) {
  .pinned-future-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: Run focused tests and inspect both screenshots**

Run:

```powershell
node tests\verify-pinned-forms.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tests\verify-pinned-forms-playwright.js
```

Expected: both tests pass. Inspect `test-results/pin-slots-desktop.png` and `test-results/pin-slots-mobile.png` for clipped Hebrew labels, overlapping actions, inconsistent slot widths, nested horizontal scrolling, or hidden anchors.

- [ ] **Step 6: Commit grouped future comparisons**

Run:

```powershell
git add lotto_analyzer.html tests/verify-pinned-forms.js tests/verify-pinned-forms-playwright.js
git commit -m "feat: group future results for four pin slots"
```

Expected: one commit containing only grouped rendering, responsive styles, and its additional verification.

---

### Task 3: Run Full Regression, Review, And Publish

**Files:**
- Modify only when a confirmed verification or review finding identifies a defect in Task 1 or Task 2 files.

**Interfaces:**
- Consumes: the complete four-slot implementation and all existing project tests.
- Produces: reviewed commits integrated into `main`, pushed to `origin/main`, and verified on GitHub Pages.

- [ ] **Step 1: Run every JavaScript contract test**

Run:

```powershell
node tests\test-lotto-combos.js
node tests\verify-strategy-core.js
node tests\verify-analyzer-core-integration.js
node tests\verify-backtest-core.js
node tests\verify-optimized-forms.js
node tests\verify-backtest-worker.js
node tests\verify-backtest-ui.js
node tests\verify-backtest-review-fixes.js
node tests\verify-backtest-shell.js
node tests\verify-form2-diversity.js
node tests\verify-pinned-forms.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tests\verify-backtest-playwright.js
node tests\verify-pinned-forms-playwright.js
```

Expected: every script prints its final `passed` message and exits zero.

- [ ] **Step 2: Run the automatic-results updater tests**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest tests.test_update_lotto_results -v
```

Expected: all updater tests pass without modifying `NUMBERS.xlsx`.

- [ ] **Step 3: Verify repository integrity**

Run:

```powershell
git diff --check
git status --short
git log --oneline -8
```

Expected: no whitespace errors, no generated screenshots staged, no unrelated file changes, and one intentional commit for each implementation task.

- [ ] **Step 4: Perform two-stage review**

Invoke `superpowers:requesting-code-review` twice:

1. Review behavior against `docs/superpowers/specs/2026-07-14-lottoamir-four-pin-slots-design.md`.
2. Review maintainability, V1/V2 migration safety, atomic-save behavior, slot isolation, dialog flows, and mobile layout.

Resolve every confirmed high- or medium-severity finding, rerun Steps 1-3, and commit each focused fix with `fix: ...`.

- [ ] **Step 5: Finish the development branch**

Invoke `superpowers:finishing-a-development-branch`, choose integration into local `main`, and use a fast-forward merge:

```powershell
git switch main
git merge --ff-only codex/lottoamir-four-pin-slots
```

Expected: local `main` contains the approved design, implementation plan, implementation commits, and any reviewed fixes.

- [ ] **Step 6: Push the finished site to GitHub**

Run:

```powershell
git push origin main
```

Expected: `origin/main` advances to the local `main` commit.

- [ ] **Step 7: Verify GitHub Pages and the public workflow**

Run:

```powershell
gh api repos/moadi1987-eng/LottoAmir/pages/builds/latest --jq "{status: .status, commit: .commit}"
```

Expected: the latest Pages build reports `built` for the pushed commit.

Open `https://moadi1987-eng.github.io/LottoAmir/` and verify:

- Both forms show `PIN בסיס` and `PIN משופר`.
- Improved PIN is disabled before a validated Backtest and enabled afterward per source.
- All four slots can remain pinned simultaneously.
- Replacing one slot does not prompt for or replace a neighboring slot.
- The future section shows baseline and improved side by side on desktop and stacked on mobile.
- Refreshing the deployed page preserves the four V2 slots in the same browser.
