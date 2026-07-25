# LottoAmir PIN Table Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `#` and `פגיעות` headers in every expanded PIN draw table clickable so each table can switch independently between high-to-low and low-to-high row ordering.

**Architecture:** Keep PIN scoring and winnings calculation unchanged, and implement sorting as a presentation-only operation on the rendered table rows. Render numeric sort metadata on every row, use native buttons inside the two sortable headers, and route their clicks through one delegated handler on `#pinnedFutureContent`.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js `assert`, Playwright with Chromium.

## Global Constraints

- The feature applies to all four PIN cards.
- Sorting is local to the specific expanded draw table whose header was clicked.
- The feature changes presentation order only.
- Prize calculation, hit calculation, PIN storage, PIN anchors, form generation, and regular-Lotto behavior remain unchanged.
- A newly rendered PIN draw table defaults to hits from high to low.
- No new runtime dependency or `localStorage` key is allowed.

---

## File Map

- Modify `lotto_analyzer.html`: add sortable-header styling, row sort metadata, accessible header buttons, the table-sorting helpers, and the delegated click listener.
- Modify `tests/verify-pinned-forms-playwright.js`: verify real browser ordering, direction toggles, arrow and `aria-sort` state, keyboard operation, row integrity, and table isolation.
- Preserve `tests/verify-pinned-forms.js`: use it as the existing syntax and PIN contract regression without adding source-text-only sorting assertions.

---

### Task 1: Add Accessible Per-Table PIN Row Sorting

**Files:**
- Modify: `tests/verify-pinned-forms-playwright.js:116-135`
- Modify: `tests/verify-pinned-forms-playwright.js:420-539`
- Modify: `lotto_analyzer.html:733-755`
- Modify: `lotto_analyzer.html:2336-2367`
- Modify: `lotto_analyzer.html:2518-2620`
- Modify: `lotto_analyzer.html:2642-2645`

**Interfaces:**
- Consumes: existing `<details class="future-draw">` tables, `score.results`, and `winnings.lines`.
- Produces: `sortPinnedDrawTable(table, key, direction)` and `handlePinnedFutureSort(event)`.
- DOM contract: `button[data-pin-sort-key="combo"]`, `button[data-pin-sort-key="hits"]`, `th[data-pin-sort-column]`, and row attributes `data-pin-combo-number`, `data-pin-regular-matches`, `data-pin-strong-match`, and `data-pin-result-index`.

- [ ] **Step 1: Add a helper that reads real rendered PIN rows**

Add this helper after `readPinnedWinnings` in `tests/verify-pinned-forms-playwright.js`:

```js
async function readPinnedCombinationRows(draw) {
  return draw.locator('tbody tr').evaluateAll(rows => rows.map(row => ({
    rank: row.cells[0].textContent.trim(),
    combo: Number(row.dataset.pinComboNumber),
    hits: Number(row.dataset.pinRegularMatches),
    strong: Number(row.dataset.pinStrongMatch),
    prize: row.querySelector('[data-pin-line-prize]').textContent.trim(),
  })));
}
```

This reads the real DOM produced by `lotto_analyzer.html`; it does not duplicate the production comparator.

- [ ] **Step 2: Write the failing browser behavior assertions**

After `olderNumberedDraw` is opened and its `₪89` total is asserted, add assertions with literal, hand-checked expectations:

```js
  const numberHeader = olderNumberedDraw.locator('th[data-pin-sort-column="combo"]');
  const hitsHeader = olderNumberedDraw.locator('th[data-pin-sort-column="hits"]');
  const numberSort = numberHeader.locator('button[data-pin-sort-key="combo"]');
  const hitsSort = hitsHeader.locator('button[data-pin-sort-key="hits"]');
  const neighborDraw = improvedCard.locator('details.future-draw[data-pin-draw-label="#4002"]');
  const neighborBeforeSort = await readPinnedCombinationRows(neighborDraw);

  assert.strictEqual(await numberHeader.getAttribute('aria-sort'), 'none');
  assert.strictEqual(await hitsHeader.getAttribute('aria-sort'), 'descending');
  assert.strictEqual(
    (await hitsHeader.locator('[data-pin-sort-indicator]').textContent()).trim(),
    '▼',
  );

  await numberSort.click();
  let sortedRows = await readPinnedCombinationRows(olderNumberedDraw);
  assert.deepStrictEqual(sortedRows.map(row => row.combo), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.strictEqual(await numberHeader.getAttribute('aria-sort'), 'descending');
  assert.strictEqual(await hitsHeader.getAttribute('aria-sort'), 'none');
  assert.deepStrictEqual(
    sortedRows.filter(row => row.combo <= 3).map(row => [row.combo, row.hits, row.strong, row.prize]),
    [[3, 3, 0, '₪15'], [2, 3, 0, '₪15'], [1, 3, 1, '₪59']],
  );

  await numberSort.click();
  sortedRows = await readPinnedCombinationRows(olderNumberedDraw);
  assert.deepStrictEqual(sortedRows.map(row => row.combo), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.strictEqual(await numberHeader.getAttribute('aria-sort'), 'ascending');

  await hitsSort.press('Enter');
  sortedRows = await readPinnedCombinationRows(olderNumberedDraw);
  assert.deepStrictEqual(
    sortedRows.slice(0, 4).map(row => [row.combo, row.hits, row.strong]),
    [[1, 3, 1], [3, 3, 0], [2, 3, 0], [4, 2, 0]],
  );
  assert.strictEqual(await hitsHeader.getAttribute('aria-sort'), 'descending');

  await hitsSort.press('Enter');
  sortedRows = await readPinnedCombinationRows(olderNumberedDraw);
  assert.deepStrictEqual(
    sortedRows.slice(-4).map(row => [row.combo, row.hits, row.strong]),
    [[4, 2, 0], [2, 3, 0], [3, 3, 0], [1, 3, 1]],
  );
  assert.strictEqual(await hitsHeader.getAttribute('aria-sort'), 'ascending');
  assert.deepStrictEqual(await readPinnedCombinationRows(neighborDraw), neighborBeforeSort);
```

The descending hit order uses the approved tie-breaks: strong hit first, then combination number in descending order. The ascending order reverses all three comparisons.

- [ ] **Step 3: Run the Playwright test and verify RED**

Run:

```powershell
node tests\verify-pinned-forms-playwright.js
```

Expected: FAIL when locating `th[data-pin-sort-column="combo"]` or when reading missing `data-pin-combo-number`; the failure must show that sortable headers and row metadata do not exist yet.

- [ ] **Step 4: Add minimal sortable-header styling**

Add near the existing `.pinned-future-title` and `.future-draw` styles in `lotto_analyzer.html`:

```css
.pin-sort-button {
    appearance: none;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: inherit;
    cursor: pointer;
    white-space: nowrap;
}
.pin-sort-button:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 3px;
    border-radius: 3px;
}
.pin-sort-indicator {
    display: inline-block;
    min-width: 1em;
    margin-inline-start: 3px;
}
```

- [ ] **Step 5: Add the presentation-only sorting helpers**

Add after `handlePinnedFutureToggle` in `lotto_analyzer.html`:

```js
function readPinnedRowSortValue(row, key) {
    const raw = key === 'combo'
        ? row.dataset.pinComboNumber
        : row.dataset.pinRegularMatches;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
}

function comparePinnedTableRows(left, right, key, direction) {
    const factor = direction === 'asc' ? 1 : -1;
    if (key === 'hits') {
        const hitDifference = readPinnedRowSortValue(left, 'hits')
            - readPinnedRowSortValue(right, 'hits');
        if (hitDifference !== 0) return hitDifference * factor;
        const strongDifference = Number(left.dataset.pinStrongMatch)
            - Number(right.dataset.pinStrongMatch);
        if (strongDifference !== 0) return strongDifference * factor;
    }
    const comboDifference = readPinnedRowSortValue(left, 'combo')
        - readPinnedRowSortValue(right, 'combo');
    if (comboDifference !== 0) return comboDifference * factor;
    return Number(left.dataset.pinResultIndex) - Number(right.dataset.pinResultIndex);
}

function updatePinnedSortHeaders(table, key, direction) {
    table.querySelectorAll('th[data-pin-sort-column]').forEach(function(header) {
        const active = header.dataset.pinSortColumn === key;
        header.setAttribute('aria-sort', active
            ? (direction === 'asc' ? 'ascending' : 'descending')
            : 'none');
        const indicator = header.querySelector('[data-pin-sort-indicator]');
        if (indicator) indicator.textContent = active ? (direction === 'asc' ? '▲' : '▼') : '';
    });
}

function sortPinnedDrawTable(table, key, direction) {
    if (!table || !['combo', 'hits'].includes(key) || !['asc', 'desc'].includes(direction)) return;
    const body = table.tBodies[0];
    if (!body) return;
    Array.from(body.rows)
        .sort(function(left, right) {
            return comparePinnedTableRows(left, right, key, direction);
        })
        .forEach(function(row) { body.appendChild(row); });
    table.dataset.pinSortKey = key;
    table.dataset.pinSortDirection = direction;
    updatePinnedSortHeaders(table, key, direction);
}

function handlePinnedFutureSort(event) {
    const control = event.target && event.target.closest
        ? event.target.closest('button[data-pin-sort-key]')
        : null;
    const container = document.getElementById('pinnedFutureContent');
    if (!control || !container || !container.contains(control)) return;
    const table = control.closest('table');
    if (!table) return;
    const key = control.dataset.pinSortKey;
    const currentKey = table.dataset.pinSortKey || 'hits';
    const currentDirection = table.dataset.pinSortDirection || 'desc';
    const direction = currentKey === key
        ? (currentDirection === 'desc' ? 'asc' : 'desc')
        : 'desc';
    sortPinnedDrawTable(table, key, direction);
}
```

- [ ] **Step 6: Render aligned prize rows and numeric sort metadata**

In `renderFutureDrawDetails`, replace direct `score.results.map(...)` rendering with an aligned presentation structure:

```js
const presentationRows = score.results.map(function(result, rank) {
    return {
        result: result,
        rank: rank,
        prizeLine: winnings.lines[rank]
    };
});

const rows = presentationRows.map(function(entry) {
    const result = entry.result;
    const rank = entry.rank;
    const combo = result.combo || {};
    const parsedComboNumber = Number(combo.comboNum);
    const comboNumber = Number.isFinite(parsedComboNumber)
        ? parsedComboNumber
        : result.index + 1;
    const drawSet = new Set(drawNumbers);
    const nums = (result.numbers || []).map(function(n) {
        return drawSet.has(n)
            ? '<span style="background: rgba(16,185,129,0.35); color: #34d399; padding: 2px 6px; border-radius: 4px; font-weight: 800;">' + n + '</span>'
            : '<span style="color: var(--text-muted);">' + n + '</span>';
    }).join(', ');
    const comboStrong = combo.strong == null ? '—' : combo.strong;
    const strongCell = result.strongMatch
        ? '<span style="background: rgba(139,92,246,0.35); color: #a78bfa; padding: 2px 6px; border-radius: 4px; font-weight: 800;">' + comboStrong + '</span>'
        : '<span style="color: var(--text-muted);">' + comboStrong + '</span>';
    const matchColor = result.regularMatches >= 3 ? '#34d399'
        : result.regularMatches >= 2 ? '#fbbf24'
        : '#94a3b8';
    const rowBg = result.regularMatches >= 4 ? 'rgba(16, 185, 129, 0.22)'
        : result.regularMatches >= 3 ? 'rgba(16, 185, 129, 0.12)'
        : result.regularMatches >= 2 ? 'rgba(245, 158, 11, 0.12)'
        : 'transparent';
    return '<tr data-pin-combo-number="' + comboNumber +
        '" data-pin-regular-matches="' + result.regularMatches +
        '" data-pin-strong-match="' + (result.strongMatch ? 1 : 0) +
        '" data-pin-result-index="' + result.index +
        '" style="background:' + rowBg + ';">' +
        '<td style="font-weight:700;">' + (rank + 1) + '</td>' +
        '<td style="font-weight:700;">#' + comboNumber + '</td>' +
        '<td style="font-size:12px;">' + escapeBacktestText(combo.strategy || '—') + '</td>' +
        '<td style="font-size:13px; direction:ltr;">' + nums + '</td>' +
        '<td>' + strongCell + '</td>' +
        '<td style="font-size:18px; font-weight:800; color:' + matchColor + ';">' + result.regularMatches + '/6</td>' +
        '<td style="font-size:16px;">' + (result.strongMatch ? '✅' : '❌') + '</td>' +
        '<td data-pin-line-prize>' + renderPinnedLinePrize(entry.prizeLine) + '</td>' +
    '</tr>';
});
```

Use `comboNumber` for the displayed `#` cell. The code above preserves every existing cell and inline highlight while adding only row metadata and the aligned `entry.prizeLine` lookup.

- [ ] **Step 7: Render accessible clickable headers and default state**

Change only the `#` and `פגיעות` headers and add default table state:

```html
<table class="numbers-table" data-pin-sort-key="hits" data-pin-sort-direction="desc">
    <thead>
        <tr>
            <th>דירוג</th>
            <th scope="col" data-pin-sort-column="combo" aria-sort="none">
                <button type="button" class="pin-sort-button" data-pin-sort-key="combo">
                    #<span class="pin-sort-indicator" data-pin-sort-indicator aria-hidden="true"></span>
                </button>
            </th>
            <th>אסטרטגיה</th>
            <th>מספרים</th>
            <th>חזק</th>
            <th scope="col" data-pin-sort-column="hits" aria-sort="descending">
                <button type="button" class="pin-sort-button" data-pin-sort-key="hits">
                    פגיעות<span class="pin-sort-indicator" data-pin-sort-indicator aria-hidden="true">▼</span>
                </button>
            </th>
            <th>חזק</th>
            <th>זכייה</th>
        </tr>
    </thead>
</table>
```

Keep the current `<tbody>${rows}</tbody>` and surrounding markup.

- [ ] **Step 8: Register one delegated sort listener**

Next to the existing captured `toggle` listener, add:

```js
document.getElementById('pinnedFutureContent')
    .addEventListener('click', handlePinnedFutureSort);
```

The native `<button>` handles Enter and Space keyboard activation by dispatching the same click event.

- [ ] **Step 9: Run focused tests and verify GREEN**

Run:

```powershell
node tests\verify-pinned-forms.js
node tests\verify-pinned-forms-playwright.js
```

Expected: both commands exit `0`; the Playwright output ends with `Pinned forms Playwright verification passed`.

- [ ] **Step 10: Check the browser artifacts**

Inspect the refreshed desktop and mobile screenshots:

```powershell
Get-ChildItem test-results\pin-slots-*.png | Select-Object Name,Length,LastWriteTime
```

Open `test-results/pin-slots-desktop.png` and `test-results/pin-slots-mobile.png`. Confirm both sortable labels and the active arrow are readable, header buttons do not expand the table, the prize column remains visible after horizontal scrolling, desktop cards stay side by side, and mobile cards stay stacked.

- [ ] **Step 11: Commit the working feature**

```powershell
git add -- lotto_analyzer.html tests/verify-pinned-forms-playwright.js
git diff --cached --check
git commit -m "feat: sort PIN rows by number or hits"
```

Expected: one focused feature commit containing only the analyzer and its browser regression.

---

### Task 2: Run Full PIN and Analyzer Regression

**Files:**
- Verify: `lotto_analyzer.html`
- Verify: `Lotto_All_In_One.html`
- Verify: `tests/*.js`

**Interfaces:**
- Consumes: the committed sortable PIN table behavior from Task 1.
- Produces: fresh evidence that the change does not affect scoring, prizes, Backtest, responsive layout, or the embedded analyzer shell.

- [ ] **Step 1: Run all fast Node regression scripts**

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
```

Expected: every command exits `0`.

- [ ] **Step 2: Run both real-browser suites**

```powershell
node tests\verify-backtest-playwright.js
node tests\verify-pinned-forms-playwright.js
```

Expected: both commands exit `0` with no unhandled browser errors.

- [ ] **Step 3: Review final scope and repository state**

```powershell
git diff --check HEAD^..HEAD
git show --stat --oneline --summary HEAD
git status --short
```

Expected: no whitespace errors, the feature commit contains only `lotto_analyzer.html` and `tests/verify-pinned-forms-playwright.js`, and the working tree is clean except for ignored screenshots under `test-results/`.
