# LottoAmir Shell Navigation And Width Design

## Goal

Move analyzer navigation responsibility to the main `ALL_IN_ONE` shell and make the shell/analyzer width adapt better to the screen, including mobile.

## Approved Direction

Add a parent-level analyzer navigation rail in `Lotto_All_In_One.html`. On desktop it appears on the right side of the page when the analyzer is active. On mobile it becomes a compact bottom rail. The rail scrolls inside the analyzer iframe to existing analyzer sections. The site shell and analyzer should use the available screen width instead of being artificially capped at `1600px`.

## Scope

- Modify `Lotto_All_In_One.html`.
- Modify `lotto_analyzer.html` only for width and embedded side-nav behavior.
- Keep `Lottery_V41_Final.html` unchanged.
- Keep existing analyzer section IDs and functions unchanged.
- Keep transfer-to-form, print, Excel loading, comparison math, and form filling unchanged.

## Requirements

- Parent shell includes analyzer nav buttons for comparison, combinations, form 2, statistics, hot numbers, pairs, triplets, and quartets.
- Desktop analyzer nav sits on the right side of the main page when analyzer or comparison view is active.
- Mobile analyzer nav sits at the bottom of the main page and scrolls horizontally if needed.
- Parent nav calls analyzer iframe scrolling without changing analyzer logic.
- Analyzer internal floating side nav is hidden when embedded in the shell to avoid duplicate rails.
- `Lotto_All_In_One.html` content wrapper uses full available width.
- `lotto_analyzer.html` container uses full available width.
- Mobile must not gain horizontal page overflow from the new rail.

## Non-Goals

- No calculation changes.
- No change to form print dimensions.
- No change to GitHub Pages routing.
- No new dependencies.

## Verification

- Static RED/GREEN checks for parent shell rail, analyzer width, and embedded side-nav hiding.
- Inline JavaScript parse check for changed HTML.
- Public GitHub Pages verification after push.
