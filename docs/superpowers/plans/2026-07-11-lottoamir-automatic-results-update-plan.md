# LottoAmir Automatic Results Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically refresh `NUMBERS.xlsx` from the official Pais CSV and safely publish new draws through GitHub Pages.

**Architecture:** A tested Python command downloads and validates the official CSV, limits it to the workbook's existing current-game era, and atomically replaces the workbook only when normalized data changed. Because live probes proved that GitHub-hosted runners cannot establish a connection to the Pais network, a Windows Scheduled Task runs the command from an isolated local clone and pushes only an actual workbook change.

**Tech Stack:** Python 3.13, standard library (`argparse`, `csv`, `datetime`, `urllib`, `tempfile`), `openpyxl`, `unittest`, Windows PowerShell, Task Scheduler, Git, GitHub Pages.

## Global Constraints

- Use the official CSV endpoint `https://www.pais.co.il/Lotto/lotto_resultsDownload.aspx`.
- Preserve the existing oldest draw as the current-game-era boundary.
- Accept only contiguous descending draw numbers down to that boundary.
- Require six unique regular numbers from 1 through 37.
- Allow strong numbers 1 through 8 across history and require 1 through 7 for the newest draw.
- Keep exactly nine columns, no header, and preserve the worksheet name.
- Never replace `NUMBERS.xlsx` before complete validation and reopen verification.
- Do not modify the workbook when normalized content is unchanged.
- Block automatic changes to every draw already present in the workbook.
- Always update `main` from an isolated clean clone and push through the owner's Git credentials.
- Never schedule the download on GitHub-hosted runners because Pais blocks their network before TLS.
- Do not alter analyzer, PIN, or combination behavior.

---

### Task 1: Specify parsing and validation behavior with failing tests

**Files:**
- Create: `tests/test_update_lotto_results.py`
- Create later: `scripts/update_lotto_results.py`

**Interfaces:**
- Consumes: CP1255 or UTF-8 CSV bytes and `DrawRecord` values
- Produces: assertions for `decode_csv`, `parse_csv`, `select_current_era`, and `validate_records`

- [ ] **Step 1: Write parsing tests**

Create CP1255 sample bytes with a Hebrew header and rows 3944 through 3942. Assert that `parse_csv` returns typed records and dates normalized to `dd/mm/yyyy`.

- [ ] **Step 2: Write range-safety tests**

Assert that `select_current_era(records, oldest_draw=3942)` returns the three-row contiguous prefix. Assert that a missing draw before the boundary raises `UpdateError`.

- [ ] **Step 3: Write number-validation tests**

Assert rejection of duplicate regular numbers, regular numbers outside 1 through 37, a historical strong number outside 1 through 8, and a newest strong number outside 1 through 7.

- [ ] **Step 4: Verify RED**

Run:

```powershell
python -m unittest tests/test_update_lotto_results.py -v
```

Expected: import failure because `scripts.update_lotto_results` does not exist.

---

### Task 2: Implement source parsing and validation

**Files:**
- Create: `scripts/__init__.py`
- Create: `scripts/update_lotto_results.py`
- Test: `tests/test_update_lotto_results.py`

**Interfaces:**
- Produces: `DrawRecord`, `UpdateError`, `decode_csv(bytes)`, `parse_csv(bytes)`, `select_current_era(records, oldest_draw)`, and `validate_records(records, existing_newest, existing_count)`

- [ ] **Step 1: Implement typed records and decoding**

Use an immutable `DrawRecord` dataclass with `draw_number`, `draw_date`, `regular_numbers`, and `strong_number`. Try `utf-8-sig`, then `cp1255`, then `iso-8859-8`; reject bytes that cannot be decoded.

- [ ] **Step 2: Implement CSV parsing**

Ignore the nonnumeric header row, require at least nine columns for data rows, parse the first nine columns, and reject malformed numeric or date values with the source row number in the error.

- [ ] **Step 3: Implement current-era selection**

Start with the first parsed record and require every following draw to decrement by one until `oldest_draw` is reached. Reject a gap, duplicate, increase, or missing boundary.

- [ ] **Step 4: Implement complete validation**

Check row count, newest draw monotonicity, unique draw numbers, dates, six unique regular numbers in range, historical strong range, and newest strong range.

- [ ] **Step 5: Verify GREEN for parsing and validation**

Run the Task 1 command and expect all parsing and validation tests to pass.

---

### Task 3: Specify and implement atomic workbook updates

**Files:**
- Modify: `tests/test_update_lotto_results.py`
- Modify: `scripts/update_lotto_results.py`

**Interfaces:**
- Produces: `read_workbook(path)`, `write_workbook_atomic(path, records, sheet_name)`, and `update_from_bytes(path, csv_bytes)`

- [ ] **Step 1: Write failing workbook tests**

Build a temporary workbook with sheet `111`, draws 3943 through 3942, and an extra blank formatted row. Assert that an update adds 3944, preserves sheet `111`, writes nine columns and `dd/mm/yyyy` text, removes trailing populated content, and can be reopened. Assert that a second identical update returns `False` without rewriting the file.

- [ ] **Step 2: Verify workbook tests fail**

Run the full test module. Expected: failure because workbook functions are not implemented.

- [ ] **Step 3: Implement workbook reads and normalized comparison**

Read populated rows only. Convert Excel date/datetime cells to `dd/mm/yyyy` for comparison. Return the sheet name, records, newest draw, oldest draw, and populated row count.

- [ ] **Step 4: Implement atomic writing**

Create a workbook in the target directory, preserve the sheet name, append nine typed values per record, save to a temporary `.xlsx`, reopen and verify every record, then call `os.replace`.

- [ ] **Step 5: Implement the update command**

Support default network download plus `--csv-file` and `--workbook` options. Include user agent, referrer, and timeout. Exit zero for changed or unchanged valid data and nonzero for all validation/download/write errors.

- [ ] **Step 6: Verify GREEN for all tests**

Run the full test module and expect all tests to pass with no warnings.

---

### Task 4: Add local Windows automation

**Files:**
- Create: `scripts/requirements-lotto-update.txt`
- Create: `scripts/run_scheduled_update.ps1`
- Create: `scripts/install_lotto_update_task.ps1`
- Test: `tests/test_update_lotto_results.py`

**Interfaces:**
- Consumes: official CSV, isolated local clone, existing Git credentials
- Produces: a user-authenticated commit to `main` only when `NUMBERS.xlsx` changed

- [ ] **Step 1: Pin the workbook dependency**

Add `openpyxl==3.1.5` to `scripts/requirements-lotto-update.txt`.

- [ ] **Step 2: Add the isolated scheduled runner**

Use `%LOCALAPPDATA%\LottoAmirUpdater\repo`, a named mutex, `git pull --ff-only origin main`, the Python updater, an only-`NUMBERS.xlsx` change guard, conditional commit/push, and dated local logs. Preserve and replace the isolated clone when a sole dirty workbook indicates interruption, or when a workbook-only pending commit diverges after the remote advances. Refuse recovery for every unexpected changed path.

- [ ] **Step 3: Add the Scheduled Task installer**

Create a Python 3.13 virtual environment, install the pinned dependency, copy the stable runner into the automation directory, and register an interactive hidden Windows PowerShell task for Tuesday, Thursday, and Saturday at 23:55. Resolve Windows PowerShell from `%SystemRoot%` so installation works from either `powershell.exe` or `pwsh`. Enable `StartWhenAvailable` and prevent overlapping instances.

- [ ] **Step 4: Remove blocked hosted workflows and validate locally**

Remove both the failed GitHub-hosted updater and temporary network diagnostic workflow. Run the scheduler contract tests, parse both PowerShell files, install the task, and execute one real no-change update from the isolated clone.

---

### Task 5: Verify against official data and publish

**Files:**
- Modify through updater: `NUMBERS.xlsx`
- Verify: all files from Tasks 1 through 4

**Interfaces:**
- Consumes: live official CSV containing draw 3944
- Produces: tested repository changes and an active Windows Scheduled Task

- [ ] **Step 1: Run all existing and new tests**

Run the Python updater tests and both existing Node verification scripts. Expect zero failures.

- [ ] **Step 2: Run the updater against the downloaded official CSV**

Verify that the workbook starts at draw 3944, ends at draw 2233, contains 1712 populated rows, uses nine columns, and reopens successfully.

- [ ] **Step 3: Review the complete diff**

Confirm no analyzer, PIN, generated-combination, or unrelated files changed.

- [ ] **Step 4: Commit and push**

Commit the feature, tests, scheduler, dependency pin, documentation, and refreshed workbook. Push `main` to `origin`.

- [ ] **Step 5: Inspect the installed task and first local run**

Confirm Task Scheduler reports the task as ready, exposes one weekly trigger for Tuesday, Thursday, and Saturday at 23:55, the first local run succeeds, and an unchanged workbook creates no extra commit.

- [ ] **Step 6: Verify the published site**

After Pages deployment, request `NUMBERS.xlsx` from the live GitHub Pages URL and verify that its newest draw is 3944.
