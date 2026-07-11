# LottoAmir Default Numbers File Design

## Goal

Publish `NUMBERS.xlsx` with the LottoAmir site and let the result analyzer load it directly from GitHub Pages.

## Behavior

- `NUMBERS.xlsx` is tracked in Git and served from the site root.
- `lotto_analyzer.html` keeps the existing manual upload flow.
- `lotto_analyzer.html` adds a button for loading the built-in `NUMBERS.xlsx` file.
- After the built-in file is loaded, the existing "נתח עכשיו" button should analyze that data.
- The file format remains the current 9-column workbook: draw number, date, six regular numbers, and strong number.

## Out Of Scope

- Weekly automatic update from Pais is a separate follow-up step.
- The analyzer will not rewrite the workbook format in this step.
- No backend server is added.

## Verification

- Confirm `.gitignore` allows `NUMBERS.xlsx`.
- Confirm `lotto_analyzer.html` references `NUMBERS.xlsx`.
- Confirm public GitHub Pages serves `NUMBERS.xlsx` with HTTP `200`.
- Confirm public `lotto_analyzer.html` contains the built-in file loading code.
