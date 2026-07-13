# LottoAmir Honest Backtest and Optimized Combinations Design

## Status

Approved in conversation on 2026-07-13. The approved visual direction is a dedicated Backtest workspace, reachable from the existing application navigation, rather than an inline section beneath the two forms.

## Goal

Upgrade both 14-line LottoAmir forms with a reproducible, leak-free historical evaluation and use that evidence to build two complementary optimized forms:

- Form 1 is performance-first while retaining meaningful form-level spread.
- Form 2 is diversity-first while admitting only historically evaluated strategy candidates.

The feature must preserve the current PIN snapshots, future comparisons, draw comparison, save/load, and transfer-to-form behavior. It is statistical analysis, not a claim that past lottery patterns predict or guarantee future results.

## Existing Behavior and Problem

`lotto_analyzer.html` currently contains two deterministic 14-line generators:

- `generateCombinations(...)` creates the first form from 14 strategy recipes.
- `generateCombinationsForm2(...)` creates the second form from 14 strategy recipes, then enforces 14 unique regular-number combinations, at least 30 covered regular numbers, maximum regular-number exposure of 7, maximum pairwise overlap of 4, and complete strong-number rotation.

The existing row comparison is useful for comparing the currently displayed form with a selected draw. It is not an honest historical backtest because the displayed form may have been generated from a dataset that includes the selected draw and newer draws. This can leak the answer into the analysis.

Pinned future comparison is different: it evaluates an immutable snapshot only against draws after its anchor. That behavior is already valid and remains unchanged.

## Scope

### Included

- Leak-free walk-forward evaluation across all eligible current-era rows in `NUMBERS.xlsx`.
- Independent evaluation of 100, 200, and 500-draw training windows.
- Chronological 70/30 calibration and holdout split.
- Aggregate strategy, window, form, stability, and diversity metrics.
- Current candidate generation from all 28 strategies across all three windows.
- Optimized Form 1 and Form 2 selection with deterministic constraints.
- Dedicated responsive Backtest workspace with progress, cancellation, results, and baseline comparison.
- Dataset/version-based browser cache.
- A baseline/improved selector for both forms.
- Safe fallback to the current generators.

### Excluded

- Any guarantee or claim of improved lottery odds.
- Training on the draw being scored or any later draw.
- A cloud service, account sync, or server-side database.
- Replacing the official-results updater.
- Multiple historical PIN snapshots per form.
- Prize-payout or ticket-cost optimization.
- An opaque machine-learning model.

## Data Ordering and Eligibility

The normalized workbook rows are currently newest-first. The backtest core must create a chronological oldest-first view before constructing any training slice.

The evaluated windows are exactly:

```text
100, 200, 500 prior draws
```

A target draw is eligible only when at least 500 valid earlier draws exist. This keeps the set of target draws identical for all three windows and makes window comparisons fair. The first 500 chronological rows are warm-up data and are not scored. Every later valid row is scored. With the current 1,712-row workbook this yields 1,212 eligible targets; the displayed count is always calculated from the loaded data rather than hard-coded.

For chronological target index `t` and window `w`, the only legal training slice is:

```text
rows[t - w : t]
```

The target at `rows[t]` and every later row are excluded. Missing or malformed rows are removed before chronological indexing, so all displayed counts refer to valid normalized draws.

## Architecture

The implementation remains a static GitHub Pages application and adds no build step.

### `lotto-strategy-core.js`

A browser/worker-compatible script exposes a single `LottoStrategyCore` namespace. It contains pure, DOM-free, deterministic functions for:

- computing frequencies, hot/medium/cold groups, pairs, triplets, and quartets;
- producing the 14 raw Form 1 candidates;
- producing the 14 raw Form 2 candidates before form-level diversification;
- generating candidates for a requested training window;
- scoring a line and a complete form against a draw;
- aggregating strategy and form metrics;
- selecting optimized forms and reporting diversity metrics;
- creating a stable dataset fingerprint.

The existing browser analysis adapters call this shared core. The worker imports the same file. There must not be a second copied implementation of the strategies.

### `lotto-backtest-worker.js`

The worker receives normalized rows, algorithm version, and `[100, 200, 500]`. It performs walk-forward evaluation off the UI thread and emits:

- `progress`: completed target count, total target count, percentage, and current phase;
- `complete`: compact aggregate results, rankings, split metadata, and fingerprint;
- `error`: a stable error code and user-safe message.

Cancellation terminates the active worker and creates a fresh worker for the next run. Loading another workbook also cancels an active run.

### `lotto_analyzer.html`

The analyzer remains responsible for workbook loading, DOM rendering, PINs, comparisons, and transfer messages. It adds:

- the dedicated Backtest workspace;
- worker lifecycle and progress handling;
- cache read/write and validation;
- baseline/improved mode state;
- rendering of optimized forms using the existing combination object shape.

No existing PIN payload fields are removed or renamed.

### `Lotto_All_In_One.html`

The application shell adds Backtest navigation. Selecting it shows the analyzer iframe and asks the child to switch to the dedicated Backtest workspace. Existing Analysis and Comparison navigation returns the child to its normal analysis workspace before scrolling to the requested section.

## Candidate Identity and Pool

A historical candidate identity consists of:

```text
source form + strategy number + training-window size
```

Examples are `main:10:200` and `form2:5:500`. Strategy labels are presentation metadata; stable source and strategy IDs drive aggregation.

For every eligible target draw, the worker generates 28 raw candidates for each window and scores them against that target. Aggregation therefore compares the same identity across time, even though its six generated numbers change as its training data changes.

For the current draw recommendation, the core generates:

```text
28 strategies x 3 windows = up to 84 raw candidates
```

Candidates with the same sorted six regular numbers are deduplicated. The retained candidate stores every contributing identity and uses the best calibration rank as its primary provenance.

## Calibration, Holdout, and Stability

Eligible target draws are split chronologically:

- oldest 70%: calibration;
- newest 30%: untouched holdout.

The calibration count is `floor(eligible count * 0.70)` and the holdout receives the remainder. The production dataset is far above the minimum; a test fixture must contain at least two eligible targets so both partitions are non-empty.

Only calibration aggregates rank strategy-window identities and determine form-selection order. The holdout is evaluated after that order and all selection constraints are fixed. No weight, window, threshold, or constraint may be retuned against the same holdout in the same algorithm version.

Calibration is also divided into three chronological buckets. Stability is the lowest bucket score divided by the average bucket score, capped to the range 0 through 1. Stability is zero when the average bucket score is zero. An identity that performs in only one short period is therefore ranked below an otherwise similar identity with steadier results.

## Scoring

The score is an evaluation index, not a payout estimate. For a line with `h` matching regular numbers:

```text
regular points for h = [0, 1, 3, 10, 35, 120, 400]
```

Strategy-identity ranking uses regular points only because optimized forms assign a new balanced strong-number rotation after candidate selection. This prevents an obsolete source strong number from influencing regular-number strategy rank.

When a complete form is evaluated, each row starts with its regular points. If that row also matches the strong number, its row points are multiplied by `1.10`.

For a complete 14-line form on one draw:

```text
draw score = highest line points + 0.05 * sum(other 13 line points)
```

This gives priority to the best line while retaining a smaller reward for useful coverage across the whole form.

For a strategy identity:

```text
identity score = 0.80 * average calibration regular points
               + 0.20 * average calibration regular points * stability
```

For a complete form policy, the same 80/20 formula uses its per-draw form score. Raw metrics are always displayed beside the index:

- average regular matches;
- 2+, 3+, 4+, 5+, and 6 hit rates;
- best regular hit count;
- strong match on the best regular line;
- regular-number coverage;
- maximum number exposure;
- maximum pairwise overlap;
- chronological bucket results.

Sparse 5- and 6-hit outcomes are reported but never used alone to rank a strategy.

## Optimized Form Selection

Selection is deterministic. Ties resolve by higher stability, higher 3+ rate, lower exposure in the partially built form, lower overlap, lower strategy ID, smaller window, and finally the sorted-number key.

### Form 1: Performance-First

Candidates from all 28 strategies and all three windows are considered in calibration rank order. The selector builds 14 rows with these rules:

- exactly 14 unique six-number combinations;
- six distinct regular numbers from 1 through 37 per row;
- coverage of at least 28 regular numbers;
- maximum pairwise overlap of 5;
- maximum exposure of 8 appearances for any regular number.

If the ranked raw pool cannot satisfy the rules, a deterministic diversification pass may replace up to two numbers in a selected row, preferring high-ranked, low-exposure numbers. Every listed Form 1 rule is hard for optimized mode. If diversification still cannot satisfy all of them, optimized Form 1 is unavailable and baseline Form 1 is used.

### Form 2: Diversity-First

The selector starts from the same historically ranked pool but prioritizes new coverage and low overlap after applying a minimum calibration threshold equal to the median identity score. If deduplication leaves fewer than 14 candidates above that threshold, candidates are added in rank order until at least 14 unique rows are available. It preserves the existing strict rules:

- exactly 14 unique six-number combinations;
- at least 30 covered regular numbers;
- maximum pairwise overlap of 4;
- maximum exposure of 7 appearances for any regular number.

The existing deterministic Form 2 diversification behavior is retained and generalized to the ranked candidate pool. A diversified row keeps at least three numbers from its source candidate.

### Cross-Form Diversity

Form 2 is selected after Form 1. No Form 2 row may exactly duplicate a Form 1 row. When otherwise tied, Form 2 prefers the candidate with lower average overlap against Form 1 and more numbers not yet represented by Form 1.

### Strong Numbers

Both optimized forms use complete balanced rotation: every strong number from 1 through 7 appears exactly twice. The rotation order is the strong-number frequency ranking from the 500-draw training window, with smaller number as the tie-breaker, repeated once. Historical evaluation uses the 500 draws before its target; the current recommendation uses the latest 500 valid draws. This keeps complete coverage while making results reproducible.

## Baseline and Validation Gate

The current generators are retained as the baseline. For each historical target, baseline receives every valid earlier draw as an expanding window, reproducing the site's current default behavior when the row selector is empty. The target and all later draws remain excluded. Optimized candidates alone use the fixed 100, 200, and 500-draw windows. For the current recommendation, baseline continues to use the user's current selected dataset without changing its meaning.

The optimized mode receives `validated` status only when all of the following are true on the untouched holdout:

- every structural constraint passes;
- the worker completed every eligible target and returned the matching dataset fingerprint;
- optimized combined form score is at least the corresponding baseline score;
- optimized 3+ draw rate is no more than one percentage point below baseline;
- optimized maximum pairwise overlap is no worse than its form limit;

No-look-ahead and deterministic-repeat checks are release requirements enforced by automated tests. They are not metrics that can be tuned against the holdout.

When validated, optimized mode becomes the default display for that browser and dataset fingerprint. When the gate fails, baseline remains the default and the Backtest workspace labels the optimized result as experimental. The user may inspect the comparison, but an unvalidated result does not silently replace the current form.

## Dedicated Backtest Workspace

The approved layout is a dedicated workspace, not a long panel under the forms.

### Header and Controls

- Loaded dataset identity and latest draw.
- Eligible draw count and chronological calibration/holdout counts.
- Selected windows shown as fixed active segments: 100, 200, and 500.
- Run or rerun button.
- Cancel button while active.
- Progress bar, completed target count, and phase label.
- Cache state and last completion time.

The full backtest never starts automatically. A valid cache renders immediately. A missing or stale cache shows a single clear run action while normal baseline analysis remains usable.

### Result Tabs

`Summary` shows baseline versus optimized metrics for both forms and whether each validation gate passed.

`Strategies` ranks the 84 strategy-window identities and shows source, strategy, window, calibration score, holdout score, stability, and hit-rate metrics.

`Baseline vs Improved` shows the metric differences and the 14 currently selected strategy/window provenances for each optimized form.

### Form Mode Controls

Each form receives a compact segmented selector:

```text
Improved | Baseline
```

Improved is enabled only when compatible results exist for the loaded fingerprint. Switching modes updates the existing form cards, comparison source, transfer payload, and any subsequent PIN snapshot. It never modifies an already pinned form.

### Responsive Behavior

Desktop keeps the existing right-side analyzer rail and adds Backtest as a destination. Mobile presents the same destination in the compact navigation and uses a single-column workspace. Summary metrics wrap to two columns and then one column; tables use labeled stacked rows rather than forcing unreadably narrow columns. Controls retain stable dimensions and never overlap.

## Cache

The cache key includes:

- algorithm version;
- a stable hash of every normalized draw number, date, six regular numbers, and strong number;
- window list;
- selection-constraint version.

The cache stores compact aggregates, rankings, validation results, and optimized form provenance. It does not store thousands of per-draw generated forms. Any workbook row change, new draw, algorithm change, or constraint change invalidates the cache.

If `localStorage` is unavailable or full, the successful result remains in memory for the current page session and the UI explains that it will need to be recalculated after reload.

## Failure Handling

- No loaded data: keep baseline forms and direct the user to load/analyze the workbook.
- Fewer than 501 valid rows: keep baseline forms and show the exact requirement and available count.
- Worker creation or runtime failure: terminate it, keep baseline state, and show a retry action.
- Cancellation: retain the previous valid cache, if any, and make no partial result active.
- New workbook during a run: cancel the run and invalidate incompatible in-memory output.
- Invalid cache: ignore and replace it only after a fully successful run.
- Selection failure: report which form constraint failed and use the corresponding baseline form.

No failure path changes an existing PIN, clears saved analysis, or sends a partial form to the ticket UI.

## Testing

### Core Tests

- Training slices exclude the target and every later draw.
- Mutating a target or future row cannot change the candidates generated for that target.
- Reversing workbook input to chronological order is correct and deterministic.
- All three windows evaluate the same target set.
- The 70/30 split is chronological and deterministic.
- Known line/form fixtures produce the specified scores.
- Dataset fingerprint changes when any draw field changes.
- Candidate identities aggregate correctly across targets.
- Repeated generation produces byte-equivalent combination results.

### Selection Tests

- Form 1 has 14 valid unique rows, coverage at least 28, exposure at most 8, and overlap at most 5.
- Form 2 has 14 valid unique rows, coverage at least 30, exposure at most 7, and overlap at most 4.
- Both forms rotate strong numbers 1 through 7 exactly twice.
- Form 2 contains no exact regular-number duplicate from Form 1.
- Deterministic diversification preserves source provenance and at least three source numbers.
- Constraint failure returns baseline without partial optimized state.

### Integration and Regression Tests

- Worker progress, completion, error, cancellation, and stale-run messages.
- Cache hit, miss, invalidation, corruption, and storage failure.
- Dedicated workspace navigation from desktop and mobile shell controls.
- Baseline/improved switching updates comparison and transfer payloads.
- PIN stores the exact active form and remains immutable after mode changes.
- Existing pinned-future and Form 2 diversity tests continue to pass.
- Every inline and external browser script parses successfully.

### Visual and Performance Verification

- Playwright screenshots at 1440x900 and 390x844 confirm no overlap, clipping, or unreadable controls.
- The analyzer remains responsive while the worker runs.
- Progress changes during a full real-workbook run.
- A full current-workbook run completes without browser memory errors on desktop and a representative mobile viewport.

## Acceptance Criteria

- Every scored target uses only earlier draws.
- All eligible current-era history is evaluated for windows 100, 200, and 500.
- Calibration cannot use holdout rows, and the holdout cannot tune the same algorithm version.
- Backtest output is deterministic for the same dataset and algorithm version.
- Both optimized forms meet their structural constraints or baseline is used.
- Improved mode is default only after the documented holdout gate passes.
- Existing PIN, future comparison, current comparison, save/load, and transfer flows remain functional.
- The dedicated Backtest workspace is usable on desktop and phone.
- The public UI states that historical analysis does not guarantee future lottery results.
