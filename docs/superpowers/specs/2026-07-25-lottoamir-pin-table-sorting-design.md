# LottoAmir PIN Table Sorting Design

## Goal

Allow the user to sort the combination rows inside each expanded PIN draw table by clicking either the `#` column header or the `פגיעות` column header.

## Scope

- The feature applies to all four PIN cards.
- Sorting is local to the specific expanded draw table whose header was clicked.
- The feature changes presentation order only.
- Prize calculation, hit calculation, PIN storage, PIN anchors, form generation, and regular-Lotto behavior remain unchanged.

## Interaction

### Combination Number

- The `#` header is interactive.
- The first click sorts combination numbers from high to low.
- Each later click on the same header reverses the direction.

### Hits

- The `פגיעות` header is interactive.
- The first click sorts hit counts from high to low.
- Each later click on the same header reverses the direction.
- When two rows have the same regular hit count, a row with a strong-number hit appears first in descending order and last in ascending order.
- Remaining ties use the combination number in the active direction so the result is deterministic.

### Active Sort Indicator

- The active header shows `▲` for low-to-high ordering and `▼` for high-to-low ordering.
- The inactive sortable header does not show an arrow.
- Sortable headers remain keyboard accessible and expose their current sort state to assistive technology.

## Default Behavior

- A newly rendered PIN draw table keeps the existing order: hits from high to low.
- The `פגיעות` header initially shows the descending indicator.
- Sorting one table does not reorder another draw table or another PIN card.
- Re-rendering the PIN comparison section restores the default order.

## Implementation Boundaries

- Keep scoring results and aggregate PIN metrics unchanged.
- Pair each rendered result with its matching prize line before applying presentation sorting so the displayed prize always stays attached to the correct combination.
- Use one delegated click handler for the PIN comparison area rather than adding an independent listener to every header.
- Store the active sort key and direction on the individual draw table element; no new `localStorage` key is required.

## Testing

- A focused browser test verifies the default descending hit order and indicator.
- Clicking `#` once produces descending combination-number order; clicking it again produces ascending order.
- Clicking `פגיעות` changes the active indicator and sorts by hits with the strong-number tie-break rule.
- Sorting one draw table leaves the neighboring PIN cards and other draw tables unchanged.
- A keyboard activation test verifies that the sortable headers can be used without a pointer.
- Existing PIN prize, open-draw isolation, desktop layout, mobile stacking, and horizontal-overflow checks continue to pass.

## Acceptance Criteria

- Both `#` and `פגיעות` visibly behave as sortable headers in every rendered PIN draw table.
- Every activation reverses the selected column's direction.
- The active arrow always matches the displayed row order.
- Combination, match, strong-number, and prize cells remain on the same logical row after sorting.
- No winnings or PIN data is recalculated or rewritten by sorting.
