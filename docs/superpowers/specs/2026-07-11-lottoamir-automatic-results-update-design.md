# LottoAmir Automatic Results Update Design

## Goal
Keep `NUMBERS.xlsx` synchronized with the official Pais lottery-results CSV whenever the owner's Windows computer is available, without requiring a browser or a manual file upload.

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

## Network Constraint
Two live GitHub-hosted Ubuntu runs resolved the official Pais server correctly but timed out before establishing TCP/TLS to both published Pais IP addresses. A separate probe confirmed that DNS, HTTP clients, headers, and CSV parsing were not the failure point: the hosted runner could not connect to the Pais network at all.

The updater therefore must not run on GitHub-hosted infrastructure. The failed scheduled workflow and temporary diagnostic workflow are removed so the repository does not generate repeated false failures.

## Automation
A Windows Scheduled Task named `LottoAmir Automatic Results Update` runs every six hours and at user logon. `StartWhenAvailable` allows a missed periodic trigger to run after the computer wakes.

The task runs a hidden PowerShell command that:

1. Acquires a machine-local mutex to prevent overlapping runs.
2. Uses an isolated clone in `%LOCALAPPDATA%\LottoAmirUpdater\repo`, separate from the user's working copy.
3. Recovers an interrupted sole `NUMBERS.xlsx` change by preserving the old clone and creating a clean replacement.
4. Detects a pending data commit that diverged after `origin/main` advanced, verifies its local side changed only `NUMBERS.xlsx`, preserves it, and regenerates from a clean clone.
5. Refuses automatic recovery when any unexpected path changed.
6. Switches to `main` and pulls with `--ff-only`.
7. Runs the tested Python updater through a dedicated virtual environment.
8. Verifies that only `NUMBERS.xlsx` changed.
9. Commits and pushes only when a new validated draw exists.
10. Writes dated logs under `%LOCALAPPDATA%\LottoAmirUpdater\logs`.

Recovery clones use timestamped `repo-recovery-*` directories. They are retained instead of deleted so an interrupted or unpushed workbook is never silently lost.

The push uses the owner's existing Git credentials, so the normal GitHub Pages deployment is triggered. `lotto_analyzer.html` fetches `NUMBERS.xlsx` with `cache: 'no-store'`, and a refreshed site reads the new draw after deployment.

The computer must be running and the user must be logged on for the interactive scheduled task to execute. Fully independent 24/7 execution would require a self-hosted runner or server with network access to Israel.

## PIN Behavior
PIN records remain browser-local snapshots. Updating `NUMBERS.xlsx` does not regenerate or alter pinned combinations. Once the site reloads the new workbook, future-comparison logic sees draws whose draw number is greater than the PIN anchor.

## Files

- `scripts/update_lotto_results.py`: download, parse, validate, compare, and atomically write the workbook.
- `scripts/run_scheduled_update.ps1`: isolated-clone update, commit, push, locking, and logging.
- `scripts/install_lotto_update_task.ps1`: virtual-environment and Windows Scheduled Task setup.
- `scripts/requirements-lotto-update.txt`: pinned Python dependency.
- `tests/test_update_lotto_results.py`: pure parsing and validation tests plus workbook integration tests.

## Out Of Scope

- Scraping archive-page HTML.
- Changing lottery-analysis or combination-generation logic.
- Modifying PIN snapshots.
- Importing historical game eras that used number ranges above 37.
- Providing 24/7 updates while the Windows computer is powered off.
