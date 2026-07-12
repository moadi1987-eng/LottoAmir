# LottoAmir Backtest + Logic Extraction Design

## Goal
Extract combination and frequency analysis logic from the inline analyzer script into a shared, testable JavaScript module, then add walk-forward historical backtesting with strategy ranking in the analyzer UI.

## Current Baseline
- All Form 1 / Form 2 generators, pair/triplet/quartet analysis, and helpers live inside `lotto_analyzer.html`.
- Node tests load the HTML via `vm` stubs (`tests/verify-form2-diversity.js`).
- One-draw comparison already scores regular and strong hits for saved combinations against a single draw row.
- There is no multi-draw walk-forward evaluation or strategy ranking.

## Approaches Considered

### 1. Backtest only inside the HTML file
Add ranking UI and inline walk-forward loops without extraction.

Advantages: smallest diff. Disadvantages: hard to unit-test; grows an already large HTML file.

### 2. Extract module first, then backtest on shared API — selected
Create `js/lotto-combos.js` with pure sync APIs for analysis, generation, hit scoring, and backtest aggregation. Wire the analyzer to load the script. Add Node tests that `require` the module. Build walk-forward backtest and ranking UI on top.

Advantages: testable, reusable, matches Form 2 diversity test direction, enables honest ranking. Disadvantages: larger first change; must keep browser global + Node export.

### 3. Full app rewrite (bundler / framework)
Out of scope for a static GitHub Pages hub.

## Selected Design

### Module: `js/lotto-combos.js`
Expose a browser global `LottoCombos` and `module.exports` for Node.

Must include:
- Frequency split into hot / medium / cold (and strong tiers)
- Sync `analyzePairs`, `analyzeTriplets`, `analyzeQuartets`
- Form 1 `generateCombinations` and all strategy helpers
- Form 2 `generateCombinationsForm2`, diversification helpers, strong rotation
- `createCombo`, `countHits(combo, draw)`, `rankStrategies(aggregates)`
- `runWalkForwardBacktest(draws, options)`

Determinism: same workbook slice must produce identical combinations (no randomness). Existing `pickRandom` remains top-N deterministic.

### Walk-forward backtest
For each target draw index `i` in the newest `evalCount` evaluable draws (default 50; UI options 20 / 50 / 100):

1. `history = draws.slice(i + 1)` (older only; no future leakage)
2. Skip if history is shorter than a minimum lookback (default: 30 rows)
3. Build stats and generate 14 combinations for the selected form (`main` or `form2`)
4. Score each strategy with `countHits` against draw `i`
5. Aggregate per `comboNum` / strategy: average regular hits, count of 3+, count of 4+, strong-hit rate, sample size

### Analyzer UI
- New card: form source, eval window, Run button, ranked results table
- Disclaimer: historical ranking only; does not guarantee wins
- Rename strategy label `חיזוי AI` to `ציון משוקלל`
- Optional in-session badge on live combo rows when a backtest result exists (no persistence in v1)

### HTML wiring
- `<script src="js/lotto-combos.js"></script>` before the main inline script
- Remove duplicated generator/analysis bodies from the inline script; call `LottoCombos.*`
- Keep DOM, PIN, transfer, workbook loading, and one-draw compare in HTML
- Async UI yielding wrappers may remain thin in HTML if needed

### Tests
- `tests/fixtures/sample-draws.json` — synthetic draws
- `tests/test-lotto-combos.js` — 14+14 validity, Form 2 diversity rules, hit scoring, walk-forward no-leakage sanity
- Adapt or slim `verify-form2-diversity.js` to use the module API

## Constraints
- Exactly 6 distinct regulars (1–37) and strong (1–7) per combo
- Form 2 diversity rules unchanged
- No ML / external AI APIs
- No Form 1 diversification redesign
- No claim of improved win probability
- GitHub Pages must load `js/lotto-combos.js` over HTTPS

## Success Criteria
- Analyzer behavior for live combinations remains deterministic and Form 2 diversity still passes
- Node tests pass without a browser
- Backtest ranks strategies with avg hits / 3+ / 4+ / strong % for both forms
- Pages deployment serves the new script without 404
