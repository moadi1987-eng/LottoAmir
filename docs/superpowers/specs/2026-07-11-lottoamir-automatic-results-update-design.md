# LottoAmir Automatic Results Update Design

## Goal
Keep `NUMBERS.xlsx` synchronized with the official Pais lottery-results CSV without requiring a computer or browser to remain open.

## Source
The updater downloads the CSV exposed by the official Pais lottery archive:

- Archive page: `https://www.pais.co.il/lotto/archive.aspx`
- CSV endpoint: `https://www.pais.co.il/Lotto/lotto_resultsDownload.aspx`

The request includes a browser-like user agent and the archive page as its referrer. The response is decoded as Windows-1255, with UTF-8 support retained as a fallback for a future source-format change.

## Dataset Boundary
The Pais CSV contains several historical game eras with different draw-number sequences and number ranges. `NUMBERS.xlsx` intentionally contains the current 1-through-37 era only.

The updater derives the lower boundary from the oldest populated draw already stored in `NUMBERS.xlsx`. It then consumes the contiguous CSV prefix from the newest official draw down to that existing oldest draw. For the current workbook, that boundary is draw 2233.

This prevents old 1-through-49 results from entering the analyzer while allowing every future draw in the current era to be added automatically.

## Validation
No workbook is written unless all checks pass:

- The first CSV data row is a valid draw.
- Draw numbers form an uninterrupted descending sequence down to the workbook's existing oldest draw.
- Every selected row has a `dd/mm/yyyy` date.
- Every selected row has six unique regular numbers from 1 through 37.
- Historical strong numbers may be 1 through 8 because draw 2233 uses 8.
- The newest draw uses a strong number from 1 through 7.
- The downloaded range is not shorter than the existing populated range.
- The downloaded newest draw is not older than the workbook's newest draw.
- Draw numbers are unique.
- Every overlapping official row exactly matches the existing workbook history.

Any download, decoding, parsing, validation, or write failure exits unsuccessfully and leaves the existing workbook untouched.

Historical rows are never changed automatically, even when replacement values look valid. A source correction therefore fails visibly and requires a reviewed manual change instead of silently rewriting prior results.

## Workbook Output
The updater writes exactly nine columns with no header:

1. Draw number
2. Date as `dd/mm/yyyy` text
3. Regular number 1
4. Regular number 2
5. Regular number 3
6. Regular number 4
7. Regular number 5
8. Regular number 6
9. Strong number

The existing worksheet name is preserved. The replacement is generated in a temporary file and atomically moved over `NUMBERS.xlsx` only after it can be reopened and verified.

If the normalized downloaded data is identical to the workbook, the updater reports no change and does not rewrite the file.

## Automation
A GitHub Actions workflow runs every six hours and can also be started manually. It:

1. Checks out `main`.
2. Sets up Python and installs the pinned workbook dependency.
3. Runs the updater unit tests.
4. Runs the updater against the official CSV.
5. Commits and pushes `NUMBERS.xlsx` only when the file changed.
6. Ensures the latest `main` commit has a successful GitHub Pages build, requesting and polling a build when necessary.

The workflow receives `contents: write` and `pages: write` permissions. A concurrency group prevents two updater runs from writing simultaneously. A failed run does not commit anything.

The workflow always checks out and pushes `main`, including manual runs. Commits pushed with a workflow `GITHUB_TOKEN` do not trigger another workflow or a Pages build, so the updater calls the Pages build endpoint when the latest commit is not already deployed and polls until that exact commit is built. This check also retries a previously failed deployment when the workbook has no new change. `lotto_analyzer.html` fetches `NUMBERS.xlsx` with `cache: 'no-store'`, so a refreshed site reads the new draw after that deployment.

## PIN Behavior
PIN records remain browser-local snapshots. Updating `NUMBERS.xlsx` does not regenerate or alter pinned combinations. Once the site reloads the new workbook, future-comparison logic sees draws whose draw number is greater than the PIN anchor.

## Files

- `scripts/update_lotto_results.py`: download, parse, validate, compare, and atomically write the workbook.
- `tests/test_update_lotto_results.py`: pure parsing and validation tests plus workbook integration tests.
- `.github/requirements-lotto-update.txt`: pinned Python dependency used by the workflow.
- `.github/workflows/update-lotto-results.yml`: schedule, manual trigger, tests, update, commit, and push.

## Out Of Scope

- Scraping archive-page HTML.
- Changing lottery-analysis or combination-generation logic.
- Modifying PIN snapshots.
- Importing historical game eras that used number ranges above 37.
