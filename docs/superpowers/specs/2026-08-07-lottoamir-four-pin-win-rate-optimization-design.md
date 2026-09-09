# LottoAmir Four-PIN Win-Rate Optimization Design

## Status

Approved in conversation on 2026-08-07. The user authorized the design, planning, and implementation stages. This document still serves as the reviewable contract before the implementation plan is written.

## Goal

Generate a fresh portfolio of four 14-line Lotto forms after every new analysis:

- PIN 1 and PIN 2 maximize the percentage of evaluated draws in which at least one line matches three or more regular numbers.
- PIN 3 and PIN 4 concentrate on four-or-more regular-number outcomes while allowing at most a one-percentage-point 3+ holdout-rate regression against their equal-size legacy pair.
- All 56 lines are selected as one portfolio so one form does not unknowingly waste coverage already supplied by another.

The primary outcome is a binary draw-level win rate. The feature does not claim that historical lottery patterns make a particular number inherently more likely or guarantee a future prize.

## Definition of a Win

For a form or group of forms and one target draw:

```text
win3Plus = 1 when at least one line has 3, 4, 5, or 6 regular matches
win3Plus = 0 otherwise
```

Each target draw contributes at most one win, regardless of how many lines match or how many total regular numbers are matched across the form. The primary rate is:

```text
win3PlusRate = draws with win3Plus = 1 / evaluated draws
```

The corresponding `win4PlusRate`, `win5PlusRate`, and `win6Rate` use the same binary per-draw rule at their respective thresholds.

The strong number is reported separately. It does not change whether a draw counts as a 3+ or 4+ win, and it is not part of the approval score.

## Existing Behavior and Problem

The application currently generates two 14-line forms and offers four browser-local PIN slots. The existing backtest evaluates 100, 200, and 500-draw windows with a chronological 70/30 calibration and holdout split, but its main form score rewards the best line plus small contributions from other lines. That score can improve when match totals increase even if the percentage of draws with a 3+ line does not improve.

The four PIN slots are snapshots, not four jointly optimized live forms. Their contents may have been pinned on different dates and are stored in browser `localStorage`, so they are not a reproducible training baseline. The new feature creates four fresh forms from the currently loaded history and never edits an existing PIN automatically.

## Scope

### Included

- Four new 14-line forms generated together after a completed analysis.
- Two coverage forms optimized for binary 3+ win rate.
- Two depth forms optimized for binary 4+ win rate with a 3+ guardrail.
- Historical signals from 100, 200, and 500 prior-draw windows.
- Leak-free walk-forward evaluation and a chronological 70/30 split.
- A fair deterministic 56-line legacy benchmark.
- Balanced strong-number rotation in every new form.
- Off-main-thread calculation, progress, cancellation, caching, and clear validation status.
- Explicit manual PIN actions for the four newly generated forms.

### Excluded

- Automatic replacement or deletion of an existing PIN.
- Increasing the number of lines beyond 14 per form.
- Treating total matches, average matches, or the number of winning lines in one draw as the success metric.
- Using an LLM or remote AI API to choose live lottery numbers.
- Claiming guaranteed odds improvement or a predictable random draw.
- Server-side storage, accounts, or a new deployment service.

## Architecture

The deployed application remains a static browser application.

### `lotto-strategy-core.js`

The shared DOM-free core gains pure deterministic functions for:

- binary form and portfolio win scoring;
- stable number and strong-number support across the three historical windows;
- coverage-form construction and optimization;
- 14-number depth-pool selection;
- exhaustive depth-combination enumeration;
- four-form partitioning and strong-number assignment;
- legacy 56-line benchmark construction;
- paired validation and confidence metrics.

The existing strategy generators remain the source of historical candidate signals. There is no duplicate implementation in the page or worker.

### `lotto-backtest-worker.js`

The existing worker performs the additional portfolio generation and walk-forward evaluation away from the UI thread. It emits versioned progress, completion, error, and cancellation messages. The calculation uses a fixed iteration budget and deterministic tie-breakers, so the same dataset and algorithm version produce byte-equivalent forms and metrics.

### `lotto_analyzer.html`

The analyzer adds a four-form portfolio result to the Backtest workspace, renders the comparison and confidence information, and exposes a separate manual PIN action for each approved form. Existing two-form analysis, comparisons, current PIN snapshots, winnings, sorting, storage, and transfer behavior remain compatible.

### AI Model Boundary

GPT-5.6 Sol in Ultra reasoning mode may assist development and code review. It is not called by the deployed application and does not generate the final combinations. All production selection and validation are reproducible mathematical code in the shared core and worker.

## Historical Inputs and No-Look-Ahead Rule

The normalized workbook is converted to chronological oldest-first order. The evaluated windows remain exactly 100, 200, and 500 prior valid draws.

For target index `t` and window `w`, the only legal training slice is:

```text
rows[t - w : t]
```

The target at `t` and every later draw are excluded from candidate generation, stable-support calculations, form construction, and parameter selection.

Eligible targets are split chronologically:

- oldest 70%: calibration;
- newest 30%: untouched holdout.

Only calibration results determine ranks, weights, pool membership, constraints, and tie-breakers. Holdout results can approve or reject that frozen policy but cannot retune it within the same algorithm version.

## Stable Historical Support

Historical information is a secondary input, not the primary coverage objective.

For every target and each of the three windows, the existing 28 strategy identities generate candidate lines. Strategy identities are ranked from calibration results using their binary 3+ rate, then stability across three chronological calibration buckets, then their deterministic identity key.

For each regular number and window:

1. Add rank-weighted support from every above-median strategy identity whose current candidate contains the number.
2. Normalize support within that window to the range 0 through 1.
3. Compute stable support as `0.70 * median(window scores) + 0.30 * minimum(window score)`.

This rewards support that appears across multiple windows and penalizes a number that is strong in only one convenient period. Ties resolve by the smaller regular number.

Strong-number support uses the same median/minimum structure over historical strong-number frequencies. It affects rotation order only; every strong number still receives equal exposure.

## PIN 1 and PIN 2: Coverage Forms

The coverage optimizer builds 28 lines jointly before partitioning them into two 14-line forms.

### Hard constraints

- Exactly 28 unique rows.
- Exactly six distinct regular numbers from 1 through 37 per row.
- No exact duplicate with either depth form.
- Pairwise overlap of at most two regular numbers between coverage rows, ensuring that no covered triple is duplicated within the coverage group.
- Regular-number exposure is balanced at four or five appearances across the 28 rows. The required total is `28 * 6 = 168`, so twenty numbers appear five times and seventeen appear four times.

### Selection objective

The optimizer uses deterministic multi-start local search with a fixed seed derived from the dataset fingerprint and algorithm version. Candidate swaps are compared lexicographically:

1. satisfy every hard constraint;
2. maximize unique three-number subsets;
3. maximize unique two-number subsets;
4. minimize exposure variance inside each 14-line form;
5. prefer higher stable historical support only as the final statistical tie-breaker;
6. resolve remaining ties by sorted combination key.

The 28 selected rows are partitioned into PIN 1 and PIN 2 so both forms receive 14 rows, near-equal number exposure, and similar triple coverage. The optimizer never sacrifices a hard coverage rule to chase a historical score.

## PIN 3 and PIN 4: Depth Forms

### Fourteen-number pool

The regular numbers are ranked by the stable historical support defined above. The top 14 form the depth pool. A number must have non-zero support in at least two of the three windows; if fewer than 14 numbers qualify, the remaining positions are filled by descending minimum-window support, then smaller number.

### Exhaustive combination universe

The engine enumerates every six-number combination from the pool:

```text
C(14, 6) = 3,003 candidate rows
```

It then selects 28 unique rows jointly with deterministic greedy selection followed by fixed-budget local replacement search.

### Selection objective

Candidate portfolios are compared lexicographically:

1. exactly 28 valid unique rows and no duplicate from PIN 1 or PIN 2;
2. maximize unique four-number subsets covered inside the 14-number pool;
3. maximize unique five-number subsets;
4. maximize aggregate stable historical support under the already frozen support formula;
5. balance pool-number exposure and minimize unnecessary row overlap;
6. resolve remaining ties by sorted combination key.

The current 3,003 rows are never scored backward against calibration draws that preceded their training data. Calibration evaluates the complete generation policy walk-forward, with a separately generated portfolio at every calibration target. The formula above is frozen before holdout evaluation and then applied to the latest data for the current recommendation.

The selected rows are partitioned into PIN 3 and PIN 4 so each receives 14 rows and similar four-subset coverage. These forms intentionally concentrate risk: they may win less often than coverage forms, but they are designed to produce deeper matches when the selected pool is represented well in a draw.

## Strong-Number Assignment

Every form contains each strong number from 1 through 7 exactly twice. Across all four forms, every strong number therefore appears exactly eight times.

The seven numbers are ordered by stable strong-number support and repeated once. Assignment then minimizes reuse of the same strong number on highly overlapping regular-number rows across the portfolio. Remaining ties use row order and the smaller strong number.

Strong-number outcomes are displayed as a separate diagnostic and never change the binary 3+ or 4+ validation decision.

## Fair 56-Line Legacy Benchmark

The current interface exposes only two generated forms, so duplicating them to reach 56 lines would create an artificially weak benchmark. The legacy benchmark instead uses four deterministic 14-line forms produced entirely by the existing generators:

1. legacy main form from all earlier valid draws;
2. legacy Form 2 from all earlier valid draws;
3. legacy main form from the latest 500 earlier valid draws;
4. legacy Form 2 from the latest 500 earlier valid draws.

This preserves existing generation behavior while supplying the same 56-line budget as the new portfolio. Any natural overlap in those four legacy forms remains part of the benchmark because no new portfolio optimizer is applied to it. The UI labels it `Legacy 56-line benchmark`, not the user's historical PINs.

## Validation Metrics and Gate

All rates are computed per target draw, with each draw counted at most once at each scope.

### Primary metrics

- Complete 56-line portfolio: `win3PlusRate`.
- PIN 1 and PIN 2 together: `win3PlusRate`.
- PIN 3 and PIN 4 together: `win4PlusRate`.
- Depth guardrail: PIN 3 and PIN 4 combined `win3PlusRate`.

The number of matching rows, the sum of regular matches, average best matches, and the old points score do not rank or approve the new portfolio.

### Holdout approval gate

The new portfolio is `validated` only when all of the following hold on the untouched holdout:

- every structural constraint passes for all four forms;
- selection completes for every eligible holdout target without fallback;
- complete-portfolio `win3PlusRate` is strictly greater than the legacy 56-line benchmark;
- coverage-pair `win3PlusRate` is at least the legacy main-plus-Form-2 pair generated from all earlier draws;
- depth-pair `win4PlusRate` is strictly greater than the legacy main-plus-Form-2 pair generated from the latest 500 earlier draws;
- depth-pair `win3PlusRate` is no more than one percentage point below that same latest-500 legacy pair;
- the complete-portfolio 3+ rate difference is non-negative in at least two of the three chronological holdout buckets.

If any gate fails, the UI reports the reason and does not label or expose the rows as approved improved forms.

### Confidence reporting

The UI displays a 95% Wilson confidence interval for each binary rate and paired counts showing:

- draws won by both policies;
- draws won only by the new policy;
- draws won only by the legacy policy;
- draws won by neither.

A deterministic paired bootstrap interval for the rate difference uses 10,000 paired resamples and a seed derived from the dataset fingerprint and confidence-method version. It is displayed as evidence strength. Statistical significance is reported separately and is not silently substituted for the documented holdout gate.

## Backtest Workspace and PIN Flow

After a successful run, the Backtest workspace displays:

- loaded dataset fingerprint and eligible-draw count;
- calibration and holdout counts;
- legacy and new 3+ rates for the complete 56-line portfolios;
- the percentage-point difference and confidence interval;
- coverage-pair 3+ comparison;
- depth-pair 3+ and 4+ comparisons;
- every validation-gate status and any rejection reason;
- four labeled 14-line form cards when the complete gate passes.

The form cards are labeled:

```text
PIN 1 - Coverage
PIN 2 - Coverage
PIN 3 - Depth
PIN 4 - Depth
```

Each card has an explicit manual action for its matching PIN slot. If that slot already contains a snapshot, the existing overwrite confirmation remains mandatory. Generating or rerunning analysis does not mutate any PIN. A pinned form remains an immutable snapshot and continues to compare only with draws after its anchor.

## Cache and Versioning

The cache key includes:

- dataset fingerprint;
- windows `[100, 200, 500]`;
- algorithm version;
- portfolio-constraint version;
- binary-metric version;
- confidence-method version.

The cache stores compact metrics, selected current forms, stable-support metadata, validation results, and provenance. It does not store every historical generated portfolio. A draw change, algorithm change, metric change, or constraint change invalidates the result.

## Failure Handling

- No loaded data: keep existing analysis available and request workbook analysis.
- Fewer than 501 valid draws: report required and available counts; do not generate an approved portfolio.
- Coverage constraints cannot be satisfied: report the exact failed constraint and expose no partial coverage forms.
- Fewer than 14 numbers with support in two windows: fill from the documented fallback ordering; fail cleanly only if the normalized number universe itself contains fewer than 14 valid values.
- Worker error or stale message: terminate or ignore the run, preserve the last compatible valid cache, and offer retry.
- Cancellation: retain the previous valid result and activate no partial output.
- New workbook during a run: cancel the run and invalidate incompatible output.
- Cache corruption or storage failure: ignore the cache; keep a successful in-memory result for the page session.
- Validation failure: show metrics and reasons but do not present the forms as improved or change any PIN.

No failure path clears saved analysis, changes an existing PIN, or sends partial rows to the ticket UI.

## Testing

### Binary metric tests

- A draw with zero qualifying lines contributes zero.
- One qualifying line contributes one.
- Several qualifying lines still contribute one.
- A 4+, 5+, or 6 line also contributes one to 3+.
- Strong-number matches never change 3+ or 4+ status.
- Aggregate rates use evaluated draw count as the denominator.

### No-look-ahead and split tests

- Every target uses only earlier rows in each window.
- Mutating the target or a later draw cannot change its generated portfolio.
- The 70/30 split is chronological and deterministic.
- Holdout data cannot change stable-support ranks or selection parameters.
- The same input and versions produce byte-equivalent output.

### Coverage-form tests

- PIN 1 and PIN 2 each contain exactly 14 valid rows.
- The combined 28 rows are unique.
- Pairwise overlap inside the coverage group is at most two.
- Every regular number appears exactly four or five times in the combined coverage group.
- Covered triple count equals the theoretical `28 * C(6, 3)` when all hard constraints pass.

### Depth-form tests

- The pool contains exactly 14 valid unique regular numbers.
- Exhaustive enumeration contains exactly 3,003 unique valid rows.
- PIN 3 and PIN 4 each contain exactly 14 rows.
- All depth rows are unique and drawn only from the selected pool.
- No depth row duplicates a coverage row.
- Four-subset coverage and deterministic tie-breaks match fixed fixtures.

### Strong-number tests

- Every strong number 1 through 7 appears exactly twice in each form.
- Every strong number appears exactly eight times across the portfolio.
- Strong rotation does not change regular-number metrics.

### Validation and confidence tests

- Legacy and new policies use the same target set and 56-line budget.
- Gate pass and each individual rejection reason are covered by fixtures.
- The depth 3+ one-percentage-point guardrail handles boundary values exactly.
- Wilson and paired-bootstrap intervals match reference fixtures.
- Each draw enters paired counts exactly once.

### Worker, UI, and regression tests

- Worker progress, completion, cancellation, error, and stale-run behavior.
- Cache hit, invalidation, corruption, and storage failure.
- Four result cards render only after validation.
- Manual PIN actions target the correct slot and retain overwrite confirmation.
- Existing PIN scoring, prize display, row sorting, RTL number order, future-draw comparison, save/load, and two-form analysis tests continue to pass.
- Desktop and mobile Playwright verification confirms responsive rendering and no page-level overflow.
- The page stays interactive throughout a full real-workbook run.

## Acceptance Criteria

- A new analysis can produce four distinct 14-line forms as one optimized portfolio.
- PIN 1 and PIN 2 optimize binary 3+ draw win rate through broad triple coverage.
- PIN 3 and PIN 4 optimize binary 4+ draw win rate through a stable 14-number pool and exhaustive six-number candidates.
- Every validation rate counts a draw once, never total matches or qualifying rows.
- The strong number is balanced and excluded from the win definition.
- No target or future draw leaks into generation or calibration.
- The holdout gate compares equal 56-line budgets and must pass before forms are labeled improved.
- The UI displays rate differences, sample counts, confidence information, and rejection reasons.
- Existing PINs remain unchanged until the user explicitly pins a new approved form.
- The deployed app remains static, deterministic, responsive, and free of an AI runtime dependency.
