# LottoAmir Mobile Display Design

## Goal

Improve the first-screen experience and mobile usability of LottoAmir without changing lottery logic, analysis logic, saved data behavior, printing behavior, or GitHub Pages routing.

## Approved Direction

The first display-improvement stage focuses on `Lotto_All_In_One.html` and the embedded analyzer view. The site should feel cleaner on desktop and easier to use on phones, while keeping all existing buttons, forms, generated combinations, analysis results, and iframe communication intact.

## Scope

- Improve `Lotto_All_In_One.html` layout and navigation responsiveness.
- Improve mobile layout in `lotto_analyzer.html` for upload controls, comparison controls, tables, cards, and buttons.
- Keep `Lottery_V41_Final.html` behavior unchanged in this stage.
- Keep `index.html` opening the site directly to `Lotto_All_In_One.html`.
- Do not change data parsing, number generation, comparison math, saved combinations, or transfer-to-form behavior.

## Display Requirements

- On desktop, the page keeps the current two work areas: form filling first, analysis second.
- On phones, the sticky top navigation should remain compact and usable with thumb-friendly buttons.
- The main page should avoid horizontal overflow on common phone widths.
- Embedded sections should have tighter spacing, readable headings, and stable iframe sizing.
- Analyzer upload actions should stack or wrap cleanly on narrow screens.
- Analysis tables should be readable on mobile by allowing horizontal scroll rather than squeezing columns until text overlaps.
- Combination cards should keep stable dimensions and readable number badges on mobile.
- Comparison controls should remain easy to operate after the previous live-update feature.

## Visual Style

- Keep the existing dark professional theme.
- Use the existing design tokens where possible.
- Avoid large visual redesigns, new dependencies, or decorative effects.
- Prefer small improvements: spacing, button sizing, wrapping, sticky navigation behavior, table containment, and mobile-specific widths.

## Files

- Modify `Lotto_All_In_One.html`.
- Modify `lotto_analyzer.html`.
- Do not modify `Lottery_V41_Final.html` unless testing reveals a mobile overflow issue caused by the parent page.

## Verification

- Run static checks that confirm the new responsive classes or CSS rules exist.
- Parse inline JavaScript to confirm no syntax break.
- Check desktop and mobile viewports locally if possible.
- Verify the public GitHub Pages URL still opens `Lotto_All_In_One.html`.
- Verify the public analyzer page still contains the existing `NUMBERS.xlsx` loader and live comparison update code.

## Out Of Scope

- Weekly automatic update from Pais.
- Any change to lottery calculations or recommended combinations.
- Any rewrite of the app into a framework.
- Any change to repository hosting or GitHub Pages settings.
