# LottoAmir Responsive App Shell Design

## Goal

Make `Lotto_All_In_One.html` feel like a screen-fitted app instead of a long page, while preserving the existing form, analyzer, comparison, print, and iframe communication behavior.

## Approved Direction

The shell should adapt to the browser window it opens in. The user should switch between work areas with top navigation buttons: forms, analysis, comparison, and print. Only the selected work area is shown at a time, and the active iframe fills the available screen height below the header.

## Scope

- Modify `Lotto_All_In_One.html`.
- Keep `Lottery_V41_Final.html` and `lotto_analyzer.html` behavior unchanged in this step.
- Keep both iframes loaded so transfer-to-form and analyzer workflows continue to work.
- Add a comparison navigation button that switches to the analyzer and scrolls to the comparison area when available.
- Adapt shell height using the current viewport height, including mobile visual viewport changes.

## Requirements

- The header remains fixed at the top of the app view.
- Navigation includes: forms, analysis, comparison, print.
- Forms are the default active view.
- Selecting analysis shows the analyzer iframe.
- Selecting comparison shows the analyzer iframe and attempts to focus the analyzer comparison section.
- Transfer-to-form actions switch back to the forms view.
- The active iframe fills the remaining viewport height without relying on hard-coded 1000px or 1200px shell heights.
- On phones, buttons remain short and thumb-friendly with no horizontal overflow.

## Non-Goals

- No calculation changes.
- No analyzer UI rewrite.
- No form filler rewrite.
- No change to GitHub Pages routing.
- No new dependencies.

## Verification

- Static RED/GREEN test for new shell hooks and functions.
- Inline JavaScript parse check.
- GitHub Pages public HTML verification after push.
