# LottoAmir Open Draw PIN Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every future PIN summary react to the single future draw currently open in that PIN card.

**Architecture:** Preserve the existing anchor filtering and scoring functions, but normalize each scored draw into a small metric object during rendering. Store only escaped display values and validated numeric values on that draw's native `<details>` element, then use one captured `toggle` handler to enforce a per-card accordion and update stable summary hooks without rerendering other PIN cards.

**Tech Stack:** Static HTML/CSS/JavaScript, native `<details>` events, existing PIN scoring helpers, Node.js `assert`, Playwright with system Chrome, Git, GitHub Pages.

## Global Constraints

- The newest future draw is open by default in every populated PIN card.
- At most one future draw may be open inside a single `.pinned-future-source` card.
- Opening or closing a draw updates only its containing PIN card.
- Closing the only open draw shows `—` values and `פתח הגרלה להצגת נתונים`.
- The metadata line continues to show the total number of future draws after the PIN anchor.
- Do not change PIN storage, migration, anchors, combination snapshots, scoring, generation, transfer, or the `NUMBERS.xlsx` updater.
- Do not persist the selected draw across refreshes or rerenders.
- Keep the existing two-column desktop and one-column mobile PIN layout without horizontal overflow.
- Add no runtime dependency or build step.

## File Map

- Modify `lotto_analyzer.html`: open-draw metric normalization, stable summary hooks, per-card accordion handler, and small responsive metric styles.
- Modify `tests/verify-pinned-forms.js`: static contracts for the new metric and toggle helpers.
- Modify `tests/verify-pinned-forms-playwright.js`: deterministic open-draw behavior, empty state, card isolation, rerender reset, and responsive screenshots.
- Do not modify `Lotto_All_In_One.html`, PIN storage keys, or updater scripts.

---

### Task 1: Calculate PIN Metrics From The Open Future Draw

**Files:**
- Modify: `tests/verify-pinned-forms.js:11-57`
- Modify: `tests/verify-pinned-forms-playwright.js:48-148`
- Modify: `lotto_analyzer.html:747-782, 1982-2164, 2170-2182`

**Interfaces:**
- Consumes: `scorePinnedFormAgainstDraw(pin, drawRow)`, `formatDrawDateForDisplay(value)`, `escapeBacktestText(value)`, `.pinned-future-source`, and native `details.future-draw` elements.
- Produces: `createPinnedDrawMetrics(pin, item)`, `renderPinnedDrawMetricAttributes(metrics)`, `readPinnedDrawMetrics(detail)`, `getPinnedDrawMetricDisplay(metrics)`, `renderPinnedOpenDrawStats(metrics)`, `updatePinnedOpenDrawStats(card, detail)`, and `handlePinnedFutureToggle(event)`.

- [ ] **Step 1: Add failing static contracts for the open-draw metric layer**

Add these hooks to `requiredText` in `tests/verify-pinned-forms.js`:

```js
  'function createPinnedDrawMetrics(pin, item)',
  'function renderPinnedDrawMetricAttributes(metrics)',
  'function readPinnedDrawMetrics(detail)',
  'function getPinnedDrawMetricDisplay(metrics)',
  'function renderPinnedOpenDrawStats(metrics)',
  'function updatePinnedOpenDrawStats(card, detail)',
  'function handlePinnedFutureToggle(event)',
  'data-pin-open-draw-stats',
  'data-pin-stat="draw"',
  'data-pin-stat="regular"',
  'data-pin-stat="strong"',
  'data-pin-stat="best"'
```

Append these exact behavior contracts before script parsing:

```js
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
```

- [ ] **Step 2: Add deterministic failing Playwright coverage**

Add this helper after `openAnalyzer` in `tests/verify-pinned-forms-playwright.js`:

```js
async function readPinnedOpenDrawStats(card) {
  const read = async name => (await card
    .locator(`[data-pin-stat="${name}"]`)
    .textContent()).trim();
  return {
    draw: await read('draw'),
    drawDate: await read('draw-date'),
    regular: await read('regular'),
    rate: await read('rate'),
    strong: await read('strong'),
    best: await read('best'),
  };
}
```

Inside `verifyResponsiveGroups`, immediately after creating `pins`, replace only the main baseline combinations with a deterministic 14-row form:

```js
  pins.main.baseline.combinations = Array.from({ length: 14 }, (_, index) => ({
    comboNum: index + 1,
    strategy: `deterministic ${index + 1}`,
    numbers: [1, 2, 3, 4, 5, 6],
    strong: 1,
  }));
```

After the existing future-draw-count assertions, add this complete behavior check:

```js
  const baselineCard = mainGroup.locator('[data-pin-mode="baseline"]');
  const improvedCard = mainGroup.locator('[data-pin-mode="improved"]');
  const baselineDraws = baselineCard.locator('details.future-draw');

  assert.strictEqual(await baselineDraws.count(), 2);
  assert.ok(await baselineDraws.nth(0).evaluate(node => node.open));
  assert.ok(!(await baselineDraws.nth(1).evaluate(node => node.open)));
  assert.strictEqual(await baselineCard.locator('details.future-draw[open]').count(), 1);
  assert.strictEqual(await baselineCard.locator('[data-pin-open-draw-stats]').getAttribute('aria-live'), 'polite');

  const newestStats = await readPinnedOpenDrawStats(baselineCard);
  assert.ok(newestStats.drawDate.includes('2026'));
  assert.deepStrictEqual({ ...newestStats, drawDate: '<localized-date>' }, {
    draw: '#4002',
    drawDate: '<localized-date>',
    regular: '84',
    rate: '100.0%',
    strong: '14',
    best: '6/6 + חזק',
  });

  const improvedBefore = await readPinnedOpenDrawStats(improvedCard);
  await baselineDraws.nth(1).locator('summary').click();
  assert.ok(!(await baselineDraws.nth(0).evaluate(node => node.open)));
  assert.ok(await baselineDraws.nth(1).evaluate(node => node.open));
  assert.strictEqual(await baselineCard.locator('details.future-draw[open]').count(), 1);
  const olderStats = await readPinnedOpenDrawStats(baselineCard);
  assert.ok(olderStats.drawDate.includes('2026'));
  assert.notStrictEqual(olderStats.drawDate, newestStats.drawDate);
  assert.deepStrictEqual({ ...olderStats, drawDate: '<localized-date>' }, {
    draw: '#4001',
    drawDate: '<localized-date>',
    regular: '0',
    rate: '0.0%',
    strong: '0',
    best: '0/6',
  });
  assert.deepStrictEqual(await readPinnedOpenDrawStats(improvedCard), improvedBefore);

  await baselineDraws.nth(1).locator('summary').click();
  assert.strictEqual(await baselineCard.locator('details.future-draw[open]').count(), 0);
  assert.deepStrictEqual(await readPinnedOpenDrawStats(baselineCard), {
    draw: '—',
    drawDate: 'פתח הגרלה להצגת נתונים',
    regular: '—',
    rate: '—',
    strong: '—',
    best: '—',
  });

  await session.page.evaluate(() => renderPinnedFutureComparisons());
  const resetBaselineCard = mainGroup.locator('[data-pin-mode="baseline"]');
  assert.strictEqual(await resetBaselineCard.locator('details.future-draw[open]').count(), 1);
  assert.strictEqual(
    (await resetBaselineCard.locator('[data-pin-stat="draw"]').textContent()).trim(),
    '#4002',
  );
```

Use the deterministic `dd.mm.yyyy` expectation above because Chromium with the existing `he-IL` formatter produces that exact local display in the project's Playwright environment.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
node tests\verify-pinned-forms.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\.pnpm\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\verify-pinned-forms-playwright.js
```

Expected:

- Static test fails on `function createPinnedDrawMetrics(pin, item)`.
- Browser test fails because `[data-pin-open-draw-stats]` and the per-stat hooks do not exist and both draw panels can remain open.

- [ ] **Step 4: Add stable metric styles**

Add beside the existing `.pinned-future-title` and `.future-draw` rules in `lotto_analyzer.html`:

```css
        .pinned-open-draw-stats .stat-box {
            min-width: 0;
        }
        .pinned-open-draw-stats .stat-value {
            overflow-wrap: anywhere;
        }
        .pinned-stat-meta {
            min-height: 16px;
            margin-top: 4px;
            color: var(--text-muted);
            font-size: 11px;
            line-height: 1.35;
            overflow-wrap: anywhere;
        }
```

Do not add another breakpoint. The existing `.stats-grid` rules already use four columns on wide screens, two columns below 768px, and one column below 480px.

- [ ] **Step 5: Add metric normalization, rendering, and update helpers**

Insert these complete helpers after `scorePinnedFormAgainstDraw` and before `listPinnedForms`:

```js
        function createPinnedDrawMetrics(pin, item) {
            const draw = item && item.draw ? item.draw : {};
            const score = item && item.score ? item.score : {};
            const combinationCount = pin && Array.isArray(pin.combinations)
                ? pin.combinations.length
                : 0;
            const totalRegular = Number(score.totalRegular);
            const totalStrong = Number(score.totalStrong);
            const bestRegular = score.best ? Number(score.best.regularMatches) : null;
            const maxRegular = combinationCount * 6;
            if (combinationCount <= 0
                || !Number.isFinite(totalRegular)
                || !Number.isFinite(totalStrong)) {
                return null;
            }
            return {
                drawLabel: draw.drawNumber != null && draw.drawNumber !== ''
                    ? '#' + draw.drawNumber
                    : 'שורה ' + item.rowNumber,
                drawDate: draw.date != null && draw.date !== ''
                    ? formatDrawDateForDisplay(draw.date)
                    : '',
                totalRegular: totalRegular,
                hitRate: maxRegular > 0 ? (totalRegular / maxRegular) * 100 : 0,
                totalStrong: totalStrong,
                bestRegular: Number.isFinite(bestRegular) ? bestRegular : null,
                bestStrong: Boolean(score.best && score.best.strongMatch)
            };
        }

        function renderPinnedDrawMetricAttributes(metrics) {
            if (!metrics) return '';
            return [
                'data-pin-draw-label="' + escapeBacktestText(metrics.drawLabel) + '"',
                'data-pin-draw-date="' + escapeBacktestText(metrics.drawDate) + '"',
                'data-pin-total-regular="' + metrics.totalRegular + '"',
                'data-pin-hit-rate="' + metrics.hitRate + '"',
                'data-pin-total-strong="' + metrics.totalStrong + '"',
                'data-pin-best-regular="' + (metrics.bestRegular == null ? '' : metrics.bestRegular) + '"',
                'data-pin-best-strong="' + (metrics.bestStrong ? '1' : '0') + '"'
            ].join(' ');
        }

        function readPinnedDrawMetrics(detail) {
            if (!detail || !detail.dataset) return null;
            const totalRegular = Number(detail.dataset.pinTotalRegular);
            const hitRate = Number(detail.dataset.pinHitRate);
            const totalStrong = Number(detail.dataset.pinTotalStrong);
            const bestRaw = detail.dataset.pinBestRegular;
            const bestRegular = bestRaw === '' ? null : Number(bestRaw);
            if (!detail.dataset.pinDrawLabel
                || !Number.isFinite(totalRegular)
                || !Number.isFinite(hitRate)
                || !Number.isFinite(totalStrong)
                || (bestRegular != null && !Number.isFinite(bestRegular))) {
                return null;
            }
            return {
                drawLabel: detail.dataset.pinDrawLabel,
                drawDate: detail.dataset.pinDrawDate || '',
                totalRegular: totalRegular,
                hitRate: hitRate,
                totalStrong: totalStrong,
                bestRegular: bestRegular,
                bestStrong: detail.dataset.pinBestStrong === '1'
            };
        }

        function getPinnedDrawMetricDisplay(metrics) {
            if (!metrics) {
                return {
                    draw: '—',
                    drawDate: 'פתח הגרלה להצגת נתונים',
                    regular: '—',
                    rate: '—',
                    strong: '—',
                    best: '—'
                };
            }
            return {
                draw: metrics.drawLabel,
                drawDate: metrics.drawDate,
                regular: String(metrics.totalRegular),
                rate: metrics.hitRate.toFixed(1) + '%',
                strong: String(metrics.totalStrong),
                best: metrics.bestRegular == null
                    ? '—'
                    : metrics.bestRegular + '/6' + (metrics.bestStrong ? ' + חזק' : '')
            };
        }

        function renderPinnedOpenDrawStats(metrics) {
            const display = getPinnedDrawMetricDisplay(metrics);
            return `
                <div class="stats-grid pinned-open-draw-stats" data-pin-open-draw-stats aria-live="polite" style="margin-bottom: 10px;">
                    <div class="stat-box">
                        <div class="stat-label">הגרלה פתוחה</div>
                        <div class="stat-value" data-pin-stat="draw">${escapeBacktestText(display.draw)}</div>
                        <div class="pinned-stat-meta" data-pin-stat="draw-date">${escapeBacktestText(display.drawDate)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">סך פגיעות רגילות</div>
                        <div class="stat-value" data-pin-stat="regular" style="color: var(--success);">${escapeBacktestText(display.regular)}</div>
                        <div class="pinned-stat-meta" data-pin-stat="rate">${escapeBacktestText(display.rate)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">פגיעות חזק</div>
                        <div class="stat-value" data-pin-stat="strong">${escapeBacktestText(display.strong)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">התוצאה הטובה ביותר</div>
                        <div class="stat-value" data-pin-stat="best" style="color: var(--warning);">${escapeBacktestText(display.best)}</div>
                    </div>
                </div>
            `;
        }

        function updatePinnedOpenDrawStats(card, detail) {
            if (!card) return;
            const display = getPinnedDrawMetricDisplay(readPinnedDrawMetrics(detail));
            Object.keys(display).forEach(function(name) {
                const target = card.querySelector('[data-pin-stat="' + name + '"]');
                if (target) target.textContent = display[name];
            });
        }

        function handlePinnedFutureToggle(event) {
            const detail = event.target;
            if (!detail || !detail.matches || !detail.matches('details.future-draw')) return;
            const card = detail.closest('.pinned-future-source');
            if (!card) return;
            if (detail.open) {
                card.querySelectorAll('details.future-draw[open]').forEach(function(sibling) {
                    if (sibling !== detail) sibling.open = false;
                });
                updatePinnedOpenDrawStats(card, detail);
                return;
            }
            updatePinnedOpenDrawStats(card, card.querySelector('details.future-draw[open]'));
        }
```

- [ ] **Step 6: Replace aggregate summary rendering with open-draw rendering**

In `renderPinnedFutureSource`, retain `futureRows` and scoring but replace the aggregate calculations and details rendering with:

```js
            const scoredRows = futureRows.map(function(item) {
                const score = scorePinnedFormAgainstDraw(pin, item.draw);
                const scoredItem = Object.assign({}, item, { score: score });
                scoredItem.metrics = createPinnedDrawMetrics(pin, scoredItem);
                return scoredItem;
            });
            const drawDetails = scoredRows.map(function(item, drawIndex) {
                return renderFutureDrawDetails(pin, item, drawIndex === 0, item.metrics);
            }).join('');
```

Delete `aggregateRegular`, `aggregateStrong`, `bestOverall`, `maxRegular`, `hitRate`, and `bestText` from this function. Keep the anchor metadata line unchanged, then replace the current summary `<div class="stats-grid">...</div>` with:

```js
                    ${renderPinnedOpenDrawStats(scoredRows[0].metrics)}
```

Change the details renderer signature and opening tag:

```js
        function renderFutureDrawDetails(pin, item, shouldOpen, metrics) {
```

```html
                <details class="future-draw" ${renderPinnedDrawMetricAttributes(metrics)} ${shouldOpen ? 'open' : ''}>
```

Keep every existing summary line, result table, match highlight, and row score unchanged.

- [ ] **Step 7: Install one captured toggle handler**

Immediately after the existing `defaultDataBtn` event registration, add:

```js
        document.getElementById('pinnedFutureContent')
            .addEventListener('toggle', handlePinnedFutureToggle, true);
```

The listener is attached once to the stable container. Do not bind listeners inside `renderPinnedFutureComparisons`, because that function reruns after workbook loads, PIN replacements, and PIN clears.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```powershell
node tests\verify-pinned-forms.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\.pnpm\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\verify-pinned-forms-playwright.js
```

Expected:

- `Pinned forms verification passed`
- `Pinned forms Playwright verification passed`

Inspect both generated screenshots:

- `test-results/pin-slots-desktop.png`
- `test-results/pin-slots-mobile.png`

Confirm the selected draw identifier fits, the metric boxes remain aligned, the accordion summaries do not overlap, and the page has no horizontal overflow.

- [ ] **Step 9: Commit the focused feature**

Run:

```powershell
git add lotto_analyzer.html tests/verify-pinned-forms.js tests/verify-pinned-forms-playwright.js
git commit -m "feat: calculate PIN metrics from open draw"
```

Expected: one feature commit containing only the metric helpers, accordion behavior, focused styles, and regression tests.

---

### Task 2: Full Regression, Review, Integration, And Publication

**Files:**
- Modify only when a confirmed review finding requires a focused correction to Task 1 files.

**Interfaces:**
- Consumes: the completed open-draw metric implementation and the repository's full verification suite.
- Produces: reviewed commits integrated into `main`, pushed to `origin/main`, and verified in GitHub Pages.

- [ ] **Step 1: Run every JavaScript contract and browser test**

Run:

```powershell
$tests = @(
  'tests/test-lotto-combos.js',
  'tests/verify-strategy-core.js',
  'tests/verify-analyzer-core-integration.js',
  'tests/verify-backtest-core.js',
  'tests/verify-optimized-forms.js',
  'tests/verify-backtest-worker.js',
  'tests/verify-backtest-ui.js',
  'tests/verify-backtest-review-fixes.js',
  'tests/verify-backtest-shell.js',
  'tests/verify-form2-diversity.js',
  'tests/verify-pinned-forms.js'
)
foreach ($test in $tests) {
  node $test
  if ($LASTEXITCODE -ne 0) { throw "$test failed with exit code $LASTEXITCODE" }
}
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\.pnpm\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\verify-backtest-playwright.js
if ($LASTEXITCODE -ne 0) { throw 'Backtest Playwright failed' }
node tests\verify-pinned-forms-playwright.js
if ($LASTEXITCODE -ne 0) { throw 'PIN Playwright failed' }
```

Expected: all 13 JavaScript/Chrome scripts exit zero and print their final `passed` messages.

- [ ] **Step 2: Run the automatic-results updater regression suite**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest tests.test_update_lotto_results -v
```

Expected: all 23 updater tests pass and `NUMBERS.xlsx` remains unmodified.

- [ ] **Step 3: Verify repository integrity**

Run:

```powershell
git diff --check
git status --short
git log --oneline -8
```

Expected: no whitespace errors, no generated screenshots staged, no unrelated paths changed, and one focused implementation commit after the approved spec and plan commits.

- [ ] **Step 4: Perform two-stage review**

Invoke `superpowers:requesting-code-review` twice:

1. Review behavior against `docs/superpowers/specs/2026-07-19-lottoamir-open-draw-pin-metrics-design.md`, especially default selection, single-open accordion behavior, empty state, and PIN-card isolation.
2. Review maintainability and safety, especially captured toggle ordering, rerender behavior, attribute parsing, text escaping, `NaN` prevention, keyboard behavior, and mobile layout.

For any confirmed finding, stop integration, add the smallest failing assertion to `tests/verify-pinned-forms.js` or `tests/verify-pinned-forms-playwright.js`, observe RED, implement only the corresponding correction, rerun Tasks 2 Steps 1-3, and commit with `fix: harden open draw PIN metrics`.

- [ ] **Step 5: Finish the development branch and fast-forward local main**

Invoke `superpowers:finishing-a-development-branch`, choose local integration, then run from the main checkout:

```powershell
git switch main
git pull --ff-only origin main
git merge --ff-only codex/lottoamir-open-draw-pin-metrics
```

Expected: local `main` contains the spec, plan, implementation, tests, and any focused review fix without a merge commit.

- [ ] **Step 6: Reverify the merged main and push**

Run the focused tests again from `main`:

```powershell
node tests\verify-pinned-forms.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\.pnpm\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\verify-pinned-forms-playwright.js
git status --short --branch
git push origin main
```

Expected: both focused tests pass, the worktree is clean, and `origin/main` advances to the local commit.

- [ ] **Step 7: Verify the public GitHub Pages file**

Poll the deployed analyzer until the open-draw hooks appear:

```powershell
$uri = 'https://moadi1987-eng.github.io/LottoAmir/lotto_analyzer.html?feature=open-draw-pin-metrics'
for ($attempt = 1; $attempt -le 18; $attempt++) {
  $response = Invoke-WebRequest -Uri $uri -Headers @{ 'Cache-Control'='no-cache'; 'Pragma'='no-cache' }
  $ready = $response.StatusCode -eq 200 `
    -and $response.Content.Contains('data-pin-open-draw-stats') `
    -and $response.Content.Contains('function handlePinnedFutureToggle(event)') `
    -and $response.Content.Contains('פתח הגרלה להצגת נתונים')
  if ($ready) { break }
  Start-Sleep -Seconds 10
}
if (-not $ready) { throw 'GitHub Pages did not publish open-draw PIN metrics in time' }
```

Expected: HTTP `200` and all three feature tokens are present in the public file.

Open `https://moadi1987-eng.github.io/LottoAmir/Lotto_All_In_One.html`, enter the analyzer PIN section, and confirm the newest draw is initially selected, opening another draw changes only that card's metrics, closing it produces the empty state, and the page remains usable at desktop and phone widths.
