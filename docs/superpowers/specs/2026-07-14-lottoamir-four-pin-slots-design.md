# LottoAmir Four Independent PIN Slots Design

## Goal
Expand the existing fixed-form PIN feature from two source-level PINs to four independent slots:

| Combination source | Baseline slot | Improved slot |
| --- | --- | --- |
| Main form (`main`) | Main baseline PIN | Main improved PIN |
| Second form (`form2`) | Second baseline PIN | Second improved PIN |

Each slot stores one immutable snapshot of the exact combinations generated at PIN time. Replacing or clearing one slot must never change any of the other three slots.

This feature preserves the existing meaning of baseline and improved forms. It does not force the two sets to differ: if the generation and validated Backtest policy produce identical combinations, the two PIN snapshots may legitimately contain the same rows.

## User Experience

### PIN actions
Each combination area displays two explicit actions next to its mode selector:

- `PIN בסיס`
- `PIN משופר`

The action determines what is saved, independently of the currently selected display mode:

- `PIN בסיס` always snapshots `getFormSet(source, 'baseline')`.
- `PIN משופר` always snapshots `getFormSet(source, 'improved')`.

The baseline action is available after a successful analysis has produced the source's baseline combinations. The improved action is disabled until the active dataset has a compatible Backtest result whose policy for that source is validated and whose optimized form exists.

Loading a new workbook does not delete any saved PIN. It resets current improved-form eligibility until a validated Backtest result is calculated or restored from a compatible cache. A previously saved improved PIN remains available for transfer and future comparison during that time.

### Pinned status
Below each combination area, show two compact status rows in a consistent order:

1. Baseline
2. Improved

An empty row says that the slot has not been pinned. A populated row shows:

- Mode label
- PIN date and time
- Anchor draw number/date
- Combination count
- Send to form
- Future comparison
- Replace this PIN
- Clear this PIN

All actions target the exact `(source, mode)` slot. Replacement confirmation is shown only when that same slot already contains a PIN. For example, pinning `main/improved` never asks to replace `main/baseline`.

The existing baseline/improved display selector remains independent. Switching the visible set does not create, replace, clear, or mutate a PIN.

### Future comparison layout
The existing future-comparison section remains at the bottom of the results page and is grouped by source:

- Main form: baseline and improved
- Second form: baseline and improved

On desktop, the two modes appear side by side inside each source group. On narrow screens, they stack vertically in baseline-then-improved order. Controls may wrap, but the page must not require horizontal scrolling.

Each populated slot displays its own PIN date, anchor, future-draw count, summary, and per-draw results. Empty slots display a short `לא קובע` state. Because slots can be pinned at different times, each one uses its own future period; the anchor and draw count remain visible so side-by-side results are not mistaken for an equal-period comparison.

## Storage Model
Use a new browser storage key:

`lottoPinnedFormsV2`

Keep the existing key, `lottoPinnedFormsV1`, as a read-only migration source and backup.

The V2 document is nested by source and mode:

```json
{
  "version": 2,
  "main": {
    "baseline": null,
    "improved": null
  },
  "form2": {
    "baseline": null,
    "improved": null
  }
}
```

A populated slot has this shape:

```json
{
  "source": "main",
  "mode": "improved",
  "label": "טופס ראשון - משופר",
  "pinnedAt": "2026-07-14T12:00:00.000Z",
  "anchorDrawNumber": 3811,
  "anchorDrawDate": "14/07/2026",
  "combinations": []
}
```

Only the known sources (`main`, `form2`) and modes (`baseline`, `improved`) are loaded. Combination rows are cloned when they enter or leave PIN state so later rendering or analysis changes cannot mutate a saved snapshot.

## V1 Migration
Migration runs only when the V2 key is absent:

1. Create an empty V2 document.
2. Read and parse `lottoPinnedFormsV1` when present.
3. Move the old `main` PIN into `main.baseline`.
4. Move the old `form2` PIN into `form2.baseline`.
5. Add or normalize `source`, `mode: 'baseline'`, and the baseline label.
6. Persist the resulting V2 document.
7. Leave the V1 key untouched.

An existing V2 document, including one whose slots are all empty, is never re-populated from V1. This prevents a deliberately cleared legacy PIN from reappearing on the next page load.

V2 normalization is slot-specific. A malformed slot is ignored without discarding other valid slots. A completely unparseable V2 document produces an empty in-memory V2 state and a non-crashing warning; it is not silently replaced from V1.

## Eligibility And Data Selection
Introduce one explicit eligibility check for PIN actions:

`canPinForm(source, mode)`

Common requirements for both modes:

- A workbook is loaded.
- Analysis has completed.
- The requested form set exists and contains combinations.

Additional requirements for improved mode:

- `currentBacktestResult.policies[source].validated === true`
- `optimizedForms[source]` exists and contains combinations.

The PIN operation accepts both identifiers:

`pinForm(source, mode)`

It selects rows with `getFormSet(source, mode)`, not with the currently displayed combination globals. This is the key guarantee that clicking `PIN בסיס` while viewing the improved set still saves baseline rows, and vice versa.

## Operations And Rendering
PIN helpers are mode-aware:

- `createEmptyPinnedForms()`
- `normalizePinnedSlot(pin, source, mode)`
- `migratePinnedFormsV1(parsed)`
- `loadPinnedForms()`
- `savePinnedForms(nextState)`
- `canPinForm(source, mode)`
- `getPinnedForm(source, mode)`
- `pinForm(source, mode)`
- `clearPinnedForm(source, mode)`
- `sendPinnedFormToForm(source, mode)`
- `renderPinnedFormStatus(source)`
- `renderPinnedFutureComparisons()`

Saving uses a candidate next state. The browser storage write must succeed before the global `pinnedForms` state is replaced and success is reported. If persistence fails, the previous four-slot state remains intact.

After a successful save or clear, both the local status area and the future-comparison section rerender immediately.

## Future Comparison Logic
The scoring and future-draw rules remain unchanged from the existing PIN feature:

- Prefer `drawNumber > anchorDrawNumber`.
- Fall back to a parsed draw date when draw numbers are unavailable.
- Count regular-number hits and strong-number hits with the current scoring rules.
- Show best result, totals, hit distribution, and per-draw results newest first.

The renderer traverses the four slots in stable order:

1. `main.baseline`
2. `main.improved`
3. `form2.baseline`
4. `form2.improved`

Every populated slot is filtered and scored independently using its own anchor. No shared anchor is inferred between baseline and improved slots.

## Data Flow
1. Analysis creates `baselineForms.main` and `baselineForms.form2`.
2. A validated Backtest may create `optimizedForms.main` and `optimizedForms.form2` and enables the corresponding improved PIN action.
3. The user clicks a mode-specific PIN action.
4. The requested form set is cloned into a candidate V2 state with the current draw anchor and timestamp.
5. The candidate state is persisted and then rendered.
6. Later workbook updates supply newer draws.
7. The future-comparison renderer evaluates each saved slot against draws after that slot's anchor.

## Error Handling
- No completed analysis: explain that analysis must run before pinning.
- Missing baseline rows: explain that the requested baseline form is unavailable.
- Improved PIN without a validated policy: keep the button disabled and guard the function with a clear message.
- Storage write failure: retain the previous state and report that the PIN was not saved.
- Invalid stored slot: ignore only that slot and continue rendering valid slots.
- No future draws: keep the PIN visible and explain that it is waiting for draws after its anchor.
- Missing comparable draw number/date: retain the existing clear comparison error instead of treating historical draws as future draws.

## Compatibility
The change is confined to `lotto_analyzer.html` and its focused verification tests. It must preserve:

- Existing analysis and combination generation
- Baseline/improved display switching
- Backtest calculation and cache hydration
- Current-row and saved-analysis comparisons
- Transfer of individual and complete forms
- Default and uploaded Excel loading
- Existing future-draw scoring rules
- `Lotto_All_In_One.html` embedding and responsive shell behavior

## Testing
Update the PIN verification test first, then implement until it passes. Coverage must include:

- The V2 storage key and four-slot schema exist.
- V1 `main` and `form2` PINs migrate only to their baseline slots.
- The V1 key is not deleted or overwritten.
- All four slots can be saved independently.
- Replacing or clearing one slot leaves the other three unchanged.
- Baseline and improved buttons select their requested mode regardless of the active display mode.
- Improved PIN is disabled and guarded without a validated source policy.
- Improved PIN becomes available when that source has a validated policy and optimized rows.
- Previously saved improved PINs remain usable after current Backtest state resets.
- Malformed slot data does not remove valid neighboring slots.
- Future comparisons render all four slots grouped by source and use each slot's own anchor.
- Inline JavaScript still parses successfully.
- Existing analyzer, strategy, Form 2, Backtest, optimized-form, worker, and updater checks continue to pass.

Browser verification must cover desktop and mobile widths. It should confirm that the two PIN actions, two status rows, and grouped future comparisons remain readable, wrap cleanly, and do not overlap or create horizontal overflow.

## Out Of Scope
- Multiple historical PINs inside one slot
- Cloud or GitHub synchronization of browser PIN data
- Cross-browser or cross-device PIN sharing
- Changes to lottery generation, optimization, or Backtest policy selection
- Changes to the automatic `NUMBERS.xlsx` update schedule
- A direct statistical claim that improved combinations will win more often
