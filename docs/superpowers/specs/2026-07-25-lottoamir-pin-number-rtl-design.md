# LottoAmir PIN Number RTL Design

## Goal

Display the regular numbers in every PIN result row from right to left, with the smallest number at the right edge and the largest number at the left edge.

## Scope

- The change applies only to the `מספרים` column inside future-draw tables in the four PIN cards.
- The source combination array remains in ascending numeric order.
- PIN scoring, winnings, row sorting, storage, anchors, and regular-Lotto behavior remain unchanged.
- Other analyzer tables and the drawn-number badges above each PIN table remain unchanged.

## Rendering

- Wrap the rendered number tokens in a dedicated `pinned-number-list` element.
- Render each regular number as its own token and keep the current green hit highlight.
- Render separators as explicit presentational elements between tokens.
- Use an inline flex row whose direction is RTL so the first source token occupies the rightmost visual position.
- Keep the DOM number order ascending so assistive technology reads the combination consistently with its logical value.

## Responsive Behavior

- The number list remains on one line inside the existing horizontally scrollable PIN table.
- The wrapper must not add page-level horizontal overflow.
- Desktop PIN cards remain side by side and mobile PIN cards remain stacked.

## Testing

- A real-browser test reads the first and last number token in a PIN row and verifies that the first token's horizontal position is to the right of the last token.
- The position check runs in both the desktop and mobile PIN verification flows.
- The test also verifies that token text remains in ascending DOM order and that hit highlighting stays attached to the correct numbers.
- Existing PIN row sorting tests continue to verify that sorting by `#` and `פגיעות` preserves the complete logical row.
- Existing desktop, mobile, prize-column visibility, and horizontal-overflow checks continue to pass.

## Acceptance Criteria

- For a combination such as `1, 5, 12, 20, 21, 22`, `1` is visually rightmost and `22` is visually leftmost.
- The number sequence in the DOM remains `1, 5, 12, 20, 21, 22`.
- Winning-number highlights and separators remain correct after row sorting.
- No value used by scoring or winnings calculation is reversed or rewritten.
