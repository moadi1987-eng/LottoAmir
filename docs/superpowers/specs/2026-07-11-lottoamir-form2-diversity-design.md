# LottoAmir Form 2 Diversity Design

## Goal
Improve the second 14-line form so it keeps its statistical strategies and complete strong-number rotation while producing 14 distinct, better-distributed regular-number combinations.

The change applies only to `generateCombinationsForm2(...)` and its presentation. The first form, PIN storage, future comparisons, form transfer, and workbook loading remain unchanged.

## Current Baseline
Using the current `NUMBERS.xlsx` data and the website's existing algorithm, Form 2 currently produces:

- 14 playable rows, but only 10 distinct regular-number combinations
- Two repeated regular-number groups, each appearing three times with different strong numbers
- 26 of 37 regular numbers covered
- Maximum pair overlap of 6 regular numbers
- Maximum regular-number exposure of 9 appearances in 14 rows
- Complete strong-number coverage: each strong number from 1 through 7 appears exactly twice

The strong-number rotation is valuable and must be preserved. The problem is the concentration and convergence of several statistical strategies on the same six regular numbers.

## Approaches Considered

### 1. Minimal duplicate repair
Replace one number only when two rows are exactly equal.

Advantages:

- Very small behavioral change
- Maximum preservation of existing statistical selections

Disadvantages:

- Leaves many five-number overlaps
- Leaves high exposure for a few regular numbers
- Does not materially improve total coverage

### 2. Balanced deterministic diversification - selected
Generate the same 14 statistical base rows, then run a deterministic diversification pass that preserves as many original selections as possible while enforcing form-level quality rules.

Advantages:

- Preserves the identity of all 14 strategies
- Removes repeated regular-number rows
- Reduces concentration and overlap
- Produces the same result every time for the same workbook
- Keeps the existing complete strong-number rotation

Disadvantages:

- Some rows may replace one or two lower-priority numbers
- Requires a small optimization helper after base generation

### 3. Coverage-first rebuild
Ignore the base rows after scoring and optimize all 84 regular-number slots primarily for maximum coverage.

Advantages:

- Broadest possible coverage
- Lowest overlap

Disadvantages:

- Weakens the meaning of the 14 named statistical strategies
- Changes the product from statistical recommendations into a system-form generator

## Selected Design

### Base generation
Keep the current 14 Form 2 calculations as the starting point. Each strategy still produces its preferred six numbers before diversification.

Replace numeric strategy labels such as `2`, `3`, and `4` with the descriptive strategy names already documented in the source comments:

1. `בשלים + תדירות`
2. `פריצת קור`
3. `מגמת עלייה מואצת`
4. `פער אופטימלי`
5. `איזון פיזור`
6. `זוגות מאמצע הדירוג`
7. `שלישייה מובילה + קרים`
8. `ממוצע נע`
9. `אנטי-אחרון`
10. `מספרים בשלים`
11. `תנודה בין חלונות`
12. `חזרת מגמה`
13. `סינרגיה מלאה`
14. `ממוצע משוקלל`

### Candidate priority
Build one deterministic priority list containing every regular number from 1 through 37:

1. Numbers selected by the row's original strategy
2. Remaining numbers ordered by the existing overall statistical rank
3. Any missing numbers from 1 through 37 in numeric order

No random selection is introduced. The same workbook and row selection must always produce the same 14 rows.

### Diversification pass
Add a pure helper:

`diversifyForm2Combinations(combos, candidatePriority, options)`

Process rows in strategy order. For each row, evaluate deterministic alternatives that retain the largest possible part of the original row. Prefer one-number replacements, then two-number replacements. Use a broader deterministic fallback only when the normal alternatives cannot satisfy all hard rules.

Candidate scoring, in priority order:

1. Satisfy every hard rule
2. Preserve the greatest number of original strategy selections
3. Add a regular number not yet covered by earlier rows until the coverage target is reached
4. Prefer lower current exposure across the form
5. Prefer the better-ranked statistical candidate
6. Break remaining ties by lower numeric value for deterministic output

### Hard rules
The final second form must satisfy all of the following:

- Exactly 14 combinations
- Exactly 6 distinct regular numbers from 1 through 37 in every combination
- 14 distinct regular-number combinations
- No two combinations share more than 4 regular numbers
- No regular number appears in more than 7 of the 14 combinations
- At least 30 of the 37 regular numbers are covered when the candidate list contains all 37 numbers
- Every strong number from 1 through 7 appears exactly twice
- Each combination keeps its original `comboNum` and descriptive `strategy`

### Strong-number rotation
Extract the current strong rotation into a pure helper:

`buildForm2StrongRotation(strongHot, strongMedium, strongCold)`

The helper returns 14 entries. Every strong number from 1 through 7 appears exactly twice. Diversification changes only regular numbers and never changes this rotation.

### Quality metrics
Add a pure helper:

`getForm2DiversityMetrics(combos)`

It returns:

- `combinationCount`
- `uniqueCombinationCount`
- `coveredNumberCount`
- `maximumExposure`
- `maximumOverlap`
- `strongCounts`

Display a compact summary above the second form:

`כיסוי 30/37 | שישיות שונות 14/14 | חפיפה מרבית 4 | חזק 1–7 ×2`

The values are calculated from the generated form rather than hard-coded.

## Data Flow
1. Excel data is normalized and analyzed exactly as today.
2. The 14 existing Form 2 strategies create their base combinations.
3. A full 1-through-37 candidate priority is built from the current statistical ranking.
4. `diversifyForm2Combinations(...)` creates the final regular-number rows.
5. `buildForm2StrongRotation(...)` assigns strong numbers.
6. `getForm2DiversityMetrics(...)` calculates the summary shown in the Form 2 card.
7. The final combinations continue through the existing comparison, PIN, save, and transfer flows.

## Fallback And Error Handling
If a malformed base row contains fewer than six valid unique numbers, fill it from the deterministic candidate priority before diversification.

If the normal one-number and two-number alternatives cannot satisfy the hard rules, use a deterministic broader fallback built from the full 1-through-37 candidate list. The fallback must still preserve `comboNum`, `strategy`, and the assigned strong number.

If fewer than 37 candidate numbers are supplied, append every missing number from 1 through 37 before optimization.

The generator must never return an invalid or partially filled playable row.

## Testing
Create `tests/verify-form2-diversity.js` and execute the real browser helper functions in a Node VM with lightweight DOM stubs.

The tests must prove:

- A synthetic 14-row input with repeated and highly overlapping rows becomes 14 distinct valid rows
- Maximum overlap is 4 or lower
- Maximum exposure is 7 or lower
- Coverage is at least 30 regular numbers
- Strong numbers 1 through 7 appear exactly twice
- Strategy labels and `comboNum` values are preserved
- Running the same input twice returns identical output
- The quality summary container exists in `lotto_analyzer.html`
- Existing PIN verification still passes
- Every inline script in `lotto_analyzer.html` parses successfully

Run the generator against the current `NUMBERS.xlsx` before release and verify the same hard rules on the real Form 2 output.

## Out Of Scope
- Changing the first 14-combination form
- Changing the mathematical scoring inside the 14 existing Form 2 strategies
- Adding randomness
- Claiming improved lottery prediction probability
- Changing PIN storage or future-comparison behavior
- Fixing historical backtest data leakage; that remains a separate follow-up stage
