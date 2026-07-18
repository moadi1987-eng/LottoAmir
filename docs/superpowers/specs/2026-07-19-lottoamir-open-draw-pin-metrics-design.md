# LottoAmir Open Draw PIN Metrics Design

## Goal

Make the four summary metrics inside every future PIN comparison describe the future draw that is currently open in that PIN card, instead of aggregating every future draw after the PIN anchor.

The change applies independently to all four PIN slots:

- Main baseline
- Main improved
- Form 2 baseline
- Form 2 improved

## Current Behavior

Each populated PIN card finds all draws after its own anchor and scores its 14 saved combinations against every future draw. The summary currently aggregates all scored draws:

- `הגרלות חדשות` shows the total future-draw count.
- `סך פגיעות רגילות` sums regular hits across every future draw.
- `פגיעות חזק` sums strong-number hits across every future draw.
- `התוצאה הטובה ביותר` selects the best combination result across every future draw.

The first future-draw `<details>` panel is open by default, but opening or closing panels does not affect these summary values. This makes the visible summary look related to the open panel even though it represents a different, wider period.

## Approved Interaction

Each PIN card behaves as an independent accordion:

1. The newest future draw is open by default.
2. Opening another draw closes the previously open draw in that same PIN card.
3. The summary metrics update immediately to the newly opened draw.
4. Closing the only open draw leaves no selected draw and changes the summary to an empty state.
5. Opening or closing a draw in one PIN card never changes another PIN card.

Only the draw panels inside the same `.pinned-future-source` participate in the accordion. Baseline and improved PIN cards remain independent even when they belong to the same source form.

## Summary Metrics

For an open draw, the four boxes show:

1. `הגרלה פתוחה`
   - Draw number as the primary value, for example `#3947`.
   - Draw date as secondary text when available.
2. `סך פגיעות רגילות`
   - `score.totalRegular` for the open draw only.
   - Percentage: total regular hits divided by `combination count * 6`, multiplied by 100.
3. `פגיעות חזק`
   - `score.totalStrong` for the open draw only.
4. `התוצאה הטובה ביותר`
   - The open draw's best regular hit count, such as `4/6`.
   - Append `+ חזק` when that same best result also matches the strong number.

When no draw is open, all numeric result boxes show `—`. The first box also shows the secondary message `פתח הגרלה להצגת נתונים`.

The metadata line above the summary continues to show the total number of future draws found after the PIN anchor. The total remains visible but is no longer presented as a selected-draw metric.

## Rendering And State

The existing future-row filtering and `scorePinnedFormAgainstDraw` calculation remain unchanged. `renderPinnedFutureSource` continues to calculate every future draw once so each details table can be rendered.

Each rendered future-draw panel carries normalized data attributes required by the summary updater:

- Draw number and display date
- Total regular hits
- Total strong hits
- Best regular hit count
- Whether the best result includes a strong hit
- Number of saved combinations used for the percentage denominator

The summary boxes expose stable `data-pin-stat` hooks. A single PIN-future toggle handler:

1. Locates the containing `.pinned-future-source`.
2. When a panel opens, closes open sibling panels in that card.
3. Updates only that card's summary from the opened panel's normalized attributes.
4. When a panel closes, uses another open sibling if one exists; otherwise renders the empty state.

The newest panel is rendered with `open` and its score initializes the summary. No open-draw selection is persisted across page refreshes or data reloads; the newest future draw becomes active again after rerendering.

## Accessibility And Responsive Behavior

- Keep native `<details>` and `<summary>` keyboard behavior.
- Mark the metric area with `aria-live="polite"` so a screen reader can announce score changes.
- Do not move or resize the existing PIN comparison groups.
- Preserve the two-column desktop and one-column mobile PIN layout.
- Metric labels and draw identifiers must wrap without horizontal page overflow.

## Error Handling

- A PIN with no future draws keeps the existing waiting message and renders no accordion.
- Missing draw number displays a row identifier, matching the existing fallback.
- Missing date omits the secondary date instead of displaying invalid text.
- Missing or malformed score attributes produce `—` rather than `NaN`.
- Rerendering after a workbook load replaces all old panel state and reinitializes the newest draw safely.

## Compatibility

This feature does not change:

- PIN storage or migration
- Saved combinations
- Draw-anchor filtering
- Lottery scoring rules
- Baseline or improved generation
- Sending a PIN to the form
- The automatic `NUMBERS.xlsx` updater
- The total future-draw count shown in PIN metadata

## Testing

Add focused static and Playwright coverage that verifies:

- The summary has stable open-draw metric hooks.
- The newest future draw is open by default.
- Initial metrics match only the newest draw, not the aggregate of all future draws.
- Opening a second draw closes the first and changes all four metrics to the second draw's values.
- Closing the selected draw with no replacement shows the empty state.
- Switching a draw in one PIN card leaves another PIN card's open panel and metrics unchanged.
- Re-rendering resets each populated card to its newest draw.
- Desktop and mobile layouts have no overlap or horizontal overflow.
- Existing analyzer, PIN, Backtest, Form 2, and updater tests still pass.

## Out Of Scope

- Aggregating multiple simultaneously open draws
- Persisting the selected draw across refreshes
- Changing how a draw is scored
- Combining metrics across different PIN cards
- Changing the number or structure of PIN slots
- Resuming the separate remote-results-update-button design
