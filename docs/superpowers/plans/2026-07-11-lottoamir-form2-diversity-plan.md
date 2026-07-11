# LottoAmir Form 2 Diversity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Form 2's 14 statistical strategies and strong-number rotation while producing 14 distinct, deterministic, better-distributed regular-number combinations with visible quality metrics.

**Architecture:** Keep the existing 14 base calculations in `lotto_analyzer.html`, then pass them through pure deterministic helpers before assigning strong numbers. A Node VM test executes the real inline browser script with DOM stubs and verifies the hard diversity rules without introducing application dependencies.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Node.js built-ins (`fs`, `vm`, `assert`), GitHub Pages.

## Global Constraints

- Exactly 14 Form 2 combinations with exactly 6 distinct regular numbers from 1 through 37.
- All 14 regular-number combinations must be distinct.
- Maximum pair overlap is 4 regular numbers.
- Maximum exposure is 7 appearances for any regular number.
- At least 30 of the 37 regular numbers are covered.
- Every strong number from 1 through 7 appears exactly twice.
- The same workbook and row selection must produce identical output.
- Preserve `comboNum`, descriptive `strategy`, Form 1, PIN, comparison, transfer, and workbook-loading behavior.
- Do not add randomness or claim improved prediction probability.

---

### Task 1: Add failing behavioral verification

**Files:**
- Create: `tests/verify-form2-diversity.js`
- Read: `lotto_analyzer.html`

**Interfaces:**
- Consumes: the final inline script from `lotto_analyzer.html`
- Produces: executable assertions for `diversifyForm2Combinations`, `buildForm2StrongRotation`, `getForm2DiversityMetrics`, and `renderForm2DiversitySummary`

- [x] **Step 1: Create the Node VM test harness**

The test must load the real browser script, provide lightweight element, storage, timer, URL, Blob, and FileReader stubs, and expose the four required functions through `vm.runInContext(...)`.

Use 14 synthetic combinations derived from the same six regular numbers so the existing implementation cannot pass accidentally:

```js
const baseCombos = Array.from({ length: 14 }, (_, index) => ({
  comboNum: index + 1,
  strategy: `אסטרטגיה ${index + 1}`,
  numbers: [1, 2, 3, 4, 5, 6],
  strong: 1,
}));
const priority = Array.from({ length: 37 }, (_, index) => index + 1);
const options = { minimumCoverage: 30, maximumExposure: 7, maximumOverlap: 4 };
```

Run these assertions against the real helper output:

```js
assert.strictEqual(diversified.length, 14);
assert.strictEqual(metrics.uniqueCombinationCount, 14);
assert.ok(metrics.coveredNumberCount >= 30);
assert.ok(metrics.maximumExposure <= 7);
assert.ok(metrics.maximumOverlap <= 4);
assert.deepStrictEqual(diversified, secondRun);
assert.deepStrictEqual(
  diversified.map(combo => combo.comboNum),
  baseCombos.map(combo => combo.comboNum),
);
assert.deepStrictEqual(
  diversified.map(combo => combo.strategy),
  baseCombos.map(combo => combo.strategy),
);
```

Validate every row with:

```js
for (const combo of diversified) {
  assert.strictEqual(combo.numbers.length, 6);
  assert.strictEqual(new Set(combo.numbers).size, 6);
  assert.ok(combo.numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 37));
}
```

Validate strong rotation with a deliberately shuffled statistical order:

```js
const rotation = buildForm2StrongRotation(
  [{ number: 6 }, { number: 2 }, { number: 4 }],
  [{ number: 1 }, { number: 7 }],
  [{ number: 3 }, { number: 5 }],
);
const strongCounts = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, 0]));
rotation.forEach(number => { strongCounts[number] += 1; });
assert.deepStrictEqual(strongCounts, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2 });
```

Validate the UI contract:

```js
assert.ok(html.includes('id="form2DiversitySummary"'));
renderForm2DiversitySummary(diversified);
assert.ok(document.getElementById('form2DiversitySummary').textContent.includes('14/14'));
```

- [x] **Step 2: Run the new test and verify RED**

Run: `node tests/verify-form2-diversity.js`

Expected: FAIL because `diversifyForm2Combinations` and the quality-summary container do not exist.

---

### Task 2: Implement pure diversity helpers and integrate Form 2

**Files:**
- Modify: `lotto_analyzer.html:2232-2494`
- Test: `tests/verify-form2-diversity.js`

**Interfaces:**
- Consumes: base Form 2 combinations and ranked number arrays
- Produces:
  - `buildForm2CandidatePriority(mainStats, hot, medium, cold): number[]`
  - `buildForm2StrongRotation(strongHot, strongMedium, strongCold): number[]`
  - `diversifyForm2Combinations(combos, candidatePriority, options): object[]`
  - `getForm2DiversityMetrics(combos): object`

- [x] **Step 1: Add deterministic utility helpers**

Add helpers that normalize number lists, build sorted combination keys, count overlap, generate fixed-size selections, and build a complete candidate priority ending with every missing number from 1 through 37.

The selection helper must be deterministic:

```js
function getNumberSelections(values, count) {
  const selections = [];
  function visit(start, selected) {
    if (selected.length === count) {
      selections.push(selected.slice());
      return;
    }
    const remaining = count - selected.length;
    for (let i = start; i <= values.length - remaining; i++) {
      selected.push(values[i]);
      visit(i + 1, selected);
      selected.pop();
    }
  }
  if (count === 0) return [[]];
  visit(0, []);
  return selections;
}
```

- [x] **Step 2: Add the strong rotation helper**

Combine the hot, medium, and cold strong rankings, remove duplicates, append missing values 1 through 7, and return two cycles of the final seven-number order.

```js
function buildForm2StrongRotation(strongHot, strongMedium, strongCold) {
  const order = [];
  const seen = new Set();
  [...(strongHot || []), ...(strongMedium || []), ...(strongCold || [])].forEach(item => {
    const number = parseInt(item && item.number, 10);
    if (number >= 1 && number <= 7 && !seen.has(number)) {
      seen.add(number);
      order.push(number);
    }
  });
  for (let number = 1; number <= 7; number++) {
    if (!seen.has(number)) order.push(number);
  }
  return Array.from({ length: 14 }, (_, index) => order[index % 7]);
}
```

- [x] **Step 3: Add the diversification algorithm**

Process rows in order. For row `i`, require total coverage of at least `Math.ceil(minimumCoverage * (i + 1) / combos.length)` after accepting that row. Search alternatives by retained original count from 6 down to 0. For each retained subset, combine it with ranked replacement selections and reject candidates that violate uniqueness, maximum overlap, maximum exposure, or scheduled coverage.

Within the first retained-count level that has valid candidates, choose by this exact order:

1. More newly covered regular numbers
2. Lower sum of current exposures
3. Lower sum of candidate-priority indices
4. Lexicographically smaller normalized combination key

Copy `comboNum`, `strategy`, and `strong` from the base object and replace only `numbers`.

- [x] **Step 4: Add the metrics helper**

Return real computed values:

```js
{
  combinationCount,
  uniqueCombinationCount,
  coveredNumberCount,
  maximumExposure,
  maximumOverlap,
  strongCounts
}
```

- [x] **Step 5: Integrate helpers into `generateCombinationsForm2(...)`**

Keep the 14 existing base calculations, replace numeric strategy labels with the descriptive labels from the design spec, then finish with:

```js
const candidatePriority = buildForm2CandidatePriority(mainStats, hot, medium, cold);
const diversified = diversifyForm2Combinations(combos, candidatePriority, {
  minimumCoverage: 30,
  maximumExposure: 7,
  maximumOverlap: 4,
});
const strongRotation = buildForm2StrongRotation(strongHot, strongMedium, strongCold);
diversified.forEach((combo, index) => { combo.strong = strongRotation[index]; });
return diversified;
```

- [x] **Step 6: Run the behavior test and verify helper assertions pass up to the missing UI**

Run: `node tests/verify-form2-diversity.js`

Expected: diversity and rotation assertions pass; the test still fails on the missing `form2DiversitySummary` UI contract.

---

### Task 3: Add the Form 2 quality summary

**Files:**
- Modify: `lotto_analyzer.html:256-330,1056-1070,2939-2951`
- Test: `tests/verify-form2-diversity.js`

**Interfaces:**
- Consumes: `getForm2DiversityMetrics(currentCombinationsForm2)`
- Produces: `renderForm2DiversitySummary(combos)` and `#form2DiversitySummary`

- [x] **Step 1: Add compact responsive summary markup and styling**

Add `<div class="form2-quality-summary" id="form2DiversitySummary"></div>` between the Form 2 action toolbar and the combination grid. Style it as a compact flex row that wraps on narrow screens and does not introduce a nested card.

- [x] **Step 2: Render calculated metrics**

Implement:

```js
function renderForm2DiversitySummary(combos) {
  const element = document.getElementById('form2DiversitySummary');
  if (!element) return;
  const metrics = getForm2DiversityMetrics(combos || []);
  element.textContent =
    'כיסוי ' + metrics.coveredNumberCount + '/37 | ' +
    'שישיות שונות ' + metrics.uniqueCombinationCount + '/' + metrics.combinationCount + ' | ' +
    'חפיפה מרבית ' + metrics.maximumOverlap + ' | ' +
    'חזק 1–7 ×2';
}
```

Call it immediately after rendering `combinationsForm2` in `displayResults(...)`.

- [x] **Step 3: Run all local tests**

Run:

```text
node tests/verify-form2-diversity.js
node tests/verify-pinned-forms.js
```

Expected: both scripts exit 0, all inline scripts parse, and all diversity assertions pass.

- [ ] **Step 4: Commit the implementation**

Stage only:

```text
lotto_analyzer.html
tests/verify-form2-diversity.js
docs/superpowers/plans/2026-07-11-lottoamir-form2-diversity-plan.md
```

Commit: `feat: diversify second lotto form`

---

### Task 4: Verify real data and publish GitHub Pages

**Files:**
- Read: `NUMBERS.xlsx`
- Read: `lotto_analyzer.html`
- No additional production files

**Interfaces:**
- Consumes: the current workbook and final browser generator
- Produces: release evidence and updated GitHub Pages site

- [x] **Step 1: Run the final generator against the current workbook**

Use a temporary Node analysis harness with the bundled spreadsheet runtime to import `NUMBERS.xlsx`, execute the actual analyzer script, and assert:

```text
combinationCount = 14
uniqueCombinationCount = 14
coveredNumberCount >= 30
maximumExposure <= 7
maximumOverlap <= 4
strongCounts 1..7 = 2 each
```

- [ ] **Step 2: Run final repository verification**

Run:

```text
node tests/verify-form2-diversity.js
node tests/verify-pinned-forms.js
git diff --check
git status --short --branch
```

Expected: tests exit 0, `git diff --check` exits 0, and only the intended commit is ahead of `origin/main`.

- [ ] **Step 3: Push directly to `origin/main`**

The user explicitly requested direct publication and this repository's GitHub Pages deployment uses `main`.

Run: `git push origin main`

- [ ] **Step 4: Verify GitHub Pages**

Check the Pages API until status is `built`, then fetch cache-busted copies of `Lotto_All_In_One.html` and `lotto_analyzer.html`. Require HTTP 200 and verify the public analyzer contains `form2DiversitySummary`, `diversifyForm2Combinations`, and `buildForm2StrongRotation`.
