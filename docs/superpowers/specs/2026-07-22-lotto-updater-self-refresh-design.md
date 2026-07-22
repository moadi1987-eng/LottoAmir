# LottoAmir Updater Self-Refresh Design

## Problem

The scheduled task executes a copied runner at
`%LOCALAPPDATA%\LottoAmirUpdater\run_scheduled_update.ps1`. Repository updates
do not refresh that installed copy. On 21 July 2026, the stale runner added
draw 3948 to `NUMBERS.xlsx` but never invoked `update_lotto_prizes.py`, so every
PIN card comparing against draw 3948 displayed unavailable winnings even
though the official Pais prize page already existed.

## Goal

Make every scheduled run load the current updater implementation from the
configured GitHub repository before changing data. Repair the current gap by
publishing the official regular-Lotto prize table for draw 3948.

## Architecture

Install a small, stable PowerShell launcher at
`%LOCALAPPDATA%\LottoAmirUpdater\run_lotto_update_launcher.ps1`. The Windows
scheduled task executes this launcher instead of the copied runner directly.

For each trigger, the launcher:

1. Acquires a launcher-specific mutex so a manual trigger cannot race the
   scheduled trigger.
2. Ensures the automation clone exists. Initial clone creation uses the fixed
   configured LottoAmir repository URL.
3. Verifies that the clone's `origin` URL exactly matches the configured
   repository URL.
4. Fetches `origin/main` without modifying the clone worktree.
5. Extracts `scripts/run_scheduled_update.ps1` from `origin/main` into a
   temporary file under the automation root.
6. Rejects missing, empty, or non-PowerShell runner content.
7. Atomically replaces the installed runner with the fetched version.
8. Executes that installed runner with the same automation root, repository
   URL, Python executable, and optional `NoPush` setting.
9. Returns the runner's exit code and writes launcher failures to the existing
   daily updater log.

The launcher never falls back to the stale installed runner. A fetch,
validation, extraction, or replacement failure stops the run before either
data file can be changed.

## Installer

`install_lotto_update_task.ps1` will copy both the launcher and the current
runner into the automation root. It will register the scheduled task against
the launcher. Existing task name, Tuesday/Thursday/Saturday 23:55 triggers,
power settings, execution limit, user principal, and log location remain
unchanged.

Running the installer again upgrades the existing task in place. `-RunNow`
starts the refreshed task after registration.

## Data Safety

- The launcher obtains code only from `origin/main` of the exact configured
  LottoAmir repository.
- The existing runner remains responsible for clone recovery, official Pais
  parsing, atomic data writes, the exact two-file allowlist, commits, and
  pushes.
- The launcher modifies no tracked data file.
- If the refreshed runner exits nonzero, the launcher propagates that failure.
- Draw 3948 is added only by the reviewed prize updater from the official Pais
  page; no prize value is entered manually.

## Testing

Add deterministic Windows integration coverage that proves:

- the installer registers the launcher rather than the runner;
- a deliberately stale installed runner is replaced from `origin/main` before
  execution;
- the refreshed runner updates both allowed data files in the fixture flow;
- a failed fetch, wrong origin URL, missing runner, or empty runner fails
  closed and does not execute stale code;
- launcher and runner mutex behavior prevents overlapping runs;
- exit codes and log messages propagate correctly;
- existing scheduler recovery and exact outgoing-path allowlist tests still
  pass.

After implementation, run all Python updater tests, validate the PowerShell
scripts, reinstall the real scheduled task with `-RunNow`, and inspect its log.
Then verify that GitHub contains draw 3948 in both `NUMBERS.xlsx` and
`LOTTO_PRIZES.json`, that the live JSON has 1,716 draws with maximum draw 3948,
and that PIN winnings for draw 3948 are no longer unavailable.

## Out Of Scope

- Changing the lottery result or prize parsers.
- Changing PIN storage, scoring, combinations, or UI layout.
- Changing the update schedule.
- Running stale code as a fallback when GitHub is unavailable.
