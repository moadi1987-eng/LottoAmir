# LottoAmir PIN Number RTL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display ascending PIN combination numbers from right to left, with the smallest number visually rightmost, without changing the underlying combination order.

**Architecture:** Keep scoring data unchanged and replace the mixed-direction text fragment in each PIN `מספרים` cell with explicit number and separator elements inside one RTL inline-flex wrapper. Extend the existing real-browser PIN regression to validate both logical DOM order and physical screen position on desktop and mobile.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js `assert`, Playwright with Chrome.

## Global Constraints

- Apply the change only to the `מספרים` column inside future-draw tables in the four PIN cards.
- Keep source combination arrays in ascending numeric order.
- Keep PIN scoring, winnings, row sorting, storage, anchors, and regular-Lotto behavior unchanged.
- Keep drawn-number badges and non-PIN analyzer tables unchanged.
- Add no runtime dependency or persistent browser state.

---

### Task 1: Render Stable RTL PIN Number Lists

**Files:**
- Modify: `tests/verify-pinned-forms-playwright.js`
- Modify: `lotto_analyzer.html`

**Interfaces:**
- Consumes: `result.numbers`, the existing `drawSet`, and each rendered PIN row's `data-pin-combo-number`.
- Produces: `.pinned-number-list`, `.pinned-number-token`, `.pinned-number-separator`, and `.pinned-number-hit`.

- [ ] **Step 1: Add a failing real-browser layout assertion**

After the existing first click on the `#` sort button, locate combination `#1` and verify its rendered number list:

```js
  const comboOneNumberList = olderNumberedDraw
    .locator('tr[data-pin-combo-number="1"] .pinned-number-list');
  const numberTokens = comboOneNumberList.locator('.pinned-number-token');
  assert.deepStrictEqual(
    await numberTokens.evaluateAll(nodes => nodes.map(node => node.textContent.trim())),
    ['1', '2', '3', '20', '21', '22'],
  );
  assert.deepStrictEqual(
    await comboOneNumberList.locator('.pinned-number-hit')
      .evaluateAll(nodes => nodes.map(node => node.textContent.trim())),
    ['1', '2', '3'],
  );
  const numberPositions = await numberTokens.evaluateAll(nodes =>
    nodes.map(node => node.getBoundingClientRect().left)
  );
  assert.ok(
    numberPositions[0] > numberPositions.at(-1),
    'The smallest PIN number must be visually right of the largest PIN number',
  );
```

Because `verifyResponsiveGroups` runs with desktop and mobile viewports, this one assertion covers both layouts. It also runs after row sorting, proving that the number wrapper remains attached to the correct logical row.

- [ ] **Step 2: Run the PIN Playwright test and verify RED**

```powershell
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\verify-pinned-forms-playwright.js
```

Expected: FAIL while waiting for `.pinned-number-list`, because the RTL wrapper does not exist.

- [ ] **Step 3: Add focused RTL number-list styles**

Add near the existing PIN table styles:

```css
.pinned-number-list {
    display: inline-flex;
    flex-direction: row;
    direction: rtl;
    align-items: center;
    white-space: nowrap;
}
.pinned-number-separator {
    margin-inline: 2px;
    color: var(--text-muted);
}
```

- [ ] **Step 4: Render explicit number and separator elements**

Replace the existing `.map(...).join(', ')` fragment in `renderFutureDrawDetails` with:

```js
const nums = (result.numbers || []).map(function(n, index, numbers) {
    const hit = drawSet.has(n);
    const numberToken = hit
        ? '<span class="pinned-number-token pinned-number-hit" style="background: rgba(16,185,129,0.35); color: #34d399; padding: 2px 6px; border-radius: 4px; font-weight: 800;">' + n + '</span>'
        : '<span class="pinned-number-token" style="color: var(--text-muted);">' + n + '</span>';
    const separator = index < numbers.length - 1
        ? '<span class="pinned-number-separator" aria-hidden="true">,</span>'
        : '';
    return numberToken + separator;
}).join('');
```

Replace the current number cell with:

```js
'<td style="font-size:13px;"><span class="pinned-number-list" dir="rtl">' +
    nums +
'</span></td>' +
```

- [ ] **Step 5: Run focused tests and verify GREEN**

```powershell
node tests\verify-pinned-forms.js
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\verify-pinned-forms-playwright.js
```

Expected: both commands exit `0`, and the browser test ends with `Pinned forms Playwright verification passed`.

- [ ] **Step 6: Inspect responsive screenshots**

Inspect `test-results/pin-slots-desktop.png` and `test-results/pin-slots-mobile.png`. Confirm the smallest number appears on the right, separators remain between numbers, hit highlighting remains correct, the prize column stays visible, and the page has no horizontal overflow.

- [ ] **Step 7: Commit the implementation**

```powershell
git add -- lotto_analyzer.html tests/verify-pinned-forms-playwright.js
git diff --cached --check
git commit -m "feat: display PIN numbers right to left"
```

Expected: one focused feature commit containing only the analyzer and its Playwright regression.

---

### Task 2: Verify and Publish All Changes from 2026-07-25

**Files:**
- Verify: `lotto_analyzer.html`
- Verify: `tests/*.js`
- Publish: all commits in `origin/main..main`

**Interfaces:**
- Consumes: the PIN table sorting commit, the RTL display commit, and their design and plan commits.
- Produces: a tested `main` whose HEAD is present on `origin/main`.

- [ ] **Step 1: Run all fast Node regressions**

```powershell
$scripts = @(
  'tests\test-lotto-combos.js',
  'tests\verify-strategy-core.js',
  'tests\verify-analyzer-core-integration.js',
  'tests\verify-backtest-core.js',
  'tests\verify-optimized-forms.js',
  'tests\verify-backtest-worker.js',
  'tests\verify-backtest-ui.js',
  'tests\verify-backtest-review-fixes.js',
  'tests\verify-backtest-shell.js',
  'tests\verify-form2-diversity.js',
  'tests\verify-pinned-forms.js'
)
foreach ($script in $scripts) {
  node $script
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Expected: all 11 commands exit `0`.

- [ ] **Step 2: Run both real-browser regressions**

```powershell
$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\verify-backtest-playwright.js
node tests\verify-pinned-forms-playwright.js
```

Expected: both commands exit `0`.

- [ ] **Step 3: Merge the isolated feature branch into main**

From the main checkout:

```powershell
git checkout main
git pull --ff-only
git merge --ff-only codex/pin-number-rtl

$scripts = @(
  'tests\test-lotto-combos.js',
  'tests\verify-strategy-core.js',
  'tests\verify-analyzer-core-integration.js',
  'tests\verify-backtest-core.js',
  'tests\verify-optimized-forms.js',
  'tests\verify-backtest-worker.js',
  'tests\verify-backtest-ui.js',
  'tests\verify-backtest-review-fixes.js',
  'tests\verify-backtest-shell.js',
  'tests\verify-form2-diversity.js',
  'tests\verify-pinned-forms.js'
)
foreach ($script in $scripts) {
  node $script
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$env:NODE_PATH='C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\verify-backtest-playwright.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests\verify-pinned-forms-playwright.js
```

Expected: the merge is a fast-forward and all 13 checks pass on the merged `main`.

- [ ] **Step 4: Verify GitHub authentication and intended scope**

```powershell
gh --version
gh auth status
git status --short --branch
git log --oneline origin/main..main
```

Expected: GitHub CLI is available and authenticated, the working tree is clean, and the listed commits are exactly today's approved PIN sorting and RTL work plus their documentation.

- [ ] **Step 5: Push main and verify the remote ref**

```powershell
git push origin main
git fetch origin main
git rev-parse main
git rev-parse origin/main
```

Expected: the push succeeds and both hashes are identical.
