# LottoAmir PIN Fixed Forms Design

## Goal
Add a PIN option in `lotto_analyzer.html` that freezes the generated combinations for future tracking. The first stage supports exactly one pinned form for each combination source:

- Main form: `14 קומבינציות מומלצות`
- Second form: `14 קומבינציות (1 עד 14)`

When a user pins a form, the site saves the exact combinations generated that day. Later, after `NUMBERS.xlsx` is updated with new Pais draws, the site compares the pinned combinations against every draw that happened after the pin anchor.

## User Experience
Each combination area gets a PIN action:

- `📌 קבע טופס ראשון`
- `📌 קבע טופס שני`

After a form is pinned, the same area shows a compact pinned-status strip:

- Source label: first form or second form
- Pin date and time in Hebrew locale
- Anchor draw, when available: latest draw number/date in the workbook at pin time
- Combination count
- Actions: compare future draws, send to form, replace PIN, clear PIN

At the bottom of the results page, add a card:

`📌 השוואות עתידיות לטפסים מקובעים`

The card shows both pinned forms when they exist. For each pinned form it shows:

- Pin date
- Anchor draw/date
- Count of future draws found in the currently loaded workbook
- Summary totals across future draws
- A per-draw comparison table/list, newest draw first

If there are no future draws yet, the card says that the form is pinned and waiting for new draws after the anchor.

## Data Model
Pinned forms are saved in browser `localStorage`, separate from the existing saved-analysis JSON flow and separate from temporary form state.

Storage key:

`lottoPinnedFormsV1`

Shape:

```json
{
  "version": 1,
  "main": {
    "source": "main",
    "label": "טופס ראשון",
    "pinnedAt": "2026-07-11T12:00:00.000Z",
    "anchorDrawNumber": 3810,
    "anchorDrawDate": "11/07/2026",
    "combinations": []
  },
  "form2": {
    "source": "form2",
    "label": "טופס שני",
    "pinnedAt": "2026-07-11T12:00:00.000Z",
    "anchorDrawNumber": 3810,
    "anchorDrawDate": "11/07/2026",
    "combinations": []
  }
}
```

Only `main` and `form2` are supported in this stage. Pinning the same source again replaces the previous pin after user confirmation.

## Anchor Logic
At PIN time, the feature stores the latest draw known to the workbook:

- Prefer `currentData[0].drawNumber` for `anchorDrawNumber`
- Also store `currentData[0].date` for display and fallback filtering
- If draw number is missing, use date parsing as fallback

Future draws are detected from the currently loaded workbook:

- If both draw numbers exist: `draw.drawNumber > pin.anchorDrawNumber`
- Otherwise, if both dates can be parsed: `draw.date > pin.anchorDrawDate`
- If neither comparison is possible, show a clear message that future comparison needs draw number or date columns

This avoids comparing the pinned form against historical rows that already existed when the PIN was created.

## Comparison Logic
The future comparison reuses the same hit rules as the existing comparison:

- Regular hit count: how many of the 6 numbers are in the draw
- Strong hit: whether the strong number matches

For each future draw, compute:

- Best combination result
- Total regular hits across all 14 combinations
- Total strong hits across all 14 combinations
- Distribution of 0-6 regular hits

The UI should highlight higher results consistently with the existing comparison cards:

- 4+ regular hits: strong success color
- 3 regular hits: success tint
- 2 regular hits: warning tint
- Strong hit: purple/strong marker

## Integration Points
`lotto_analyzer.html` owns the feature.

New functions:

- `loadPinnedForms()`
- `savePinnedForms()`
- `pinCurrentForm(source)`
- `clearPinnedForm(source)`
- `getCombosForSource(source)`
- `getLatestDrawAnchor()`
- `getFutureRowsForPin(pin)`
- `scorePinnedFormAgainstDraw(pin, drawRow)`
- `renderPinnedFormStatus()`
- `renderPinnedFutureComparisons()`

Existing behavior must remain unchanged:

- Current comparison by row
- Saved JSON comparison upload
- Sending one combination to the form
- Sending all 14 combinations to the form
- Excel loading and default `NUMBERS.xlsx`
- Analyzer calculations
- `ALL_IN_ONE` iframe behavior

## Error Handling
If the user clicks PIN before running analysis, show:

`הרץ ניתוח קודם כדי לקבע את הקומבינציות.`

If the source has no combinations, show:

`אין קומבינציות לקיבוע בטופס הזה.`

If `localStorage` fails, show a non-crashing alert/status explaining that the browser could not save the PIN.

If no future draws exist yet, keep the pinned form visible and show:

`אין עדיין הגרלות חדשות אחרי הקיבוע. עדכן את NUMBERS.xlsx וטען מחדש.`

## Testing
Static checks:

- `lotto_analyzer.html` contains the new storage key `lottoPinnedFormsV1`
- Both PIN buttons exist
- Both pinned-status containers exist
- Future comparison card exists near the end of the results
- Required functions exist

Runtime syntax:

- Parse inline scripts from `lotto_analyzer.html` with Node `new Function(...)`

Behavior checks by source inspection:

- Pinning `main` uses `currentCombinations`
- Pinning `form2` uses `currentCombinationsForm2`
- Future filtering prefers draw number comparison
- Same-source replacement requires `confirm(...)`
- Existing transfer functions and comparison functions are not renamed

## Out Of Scope
This stage does not add a full history of multiple pinned forms per source.
This stage does not sync pinned forms between browsers or devices.
This stage does not change how `NUMBERS.xlsx` is updated.
This stage does not change lottery prediction or generation logic.
