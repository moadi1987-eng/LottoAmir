# Task 2 Report: Installer Integration

## Changes

- The installer now copies both `run_lotto_update_launcher.ps1` and
  `run_scheduled_update.ps1` to `%LOCALAPPDATA%\LottoAmirUpdater`.
- The registered Windows Task Scheduler action now invokes the installed
  launcher rather than the installed runner.
- Existing task triggers, settings, principal, uninstall flow, and `-RunNow`
  behavior are unchanged.

## TDD Evidence

- RED: `LocalSchedulerContractTests` failed with 2 assertions because the
  installer lacked launcher paths and scheduled `$installedRunner`.
- GREEN: `LocalSchedulerContractTests` passed: `Ran 4 tests ... OK`.
- Regression: `python -m unittest discover -s tests -p 'test_*.py'` passed:
  `Ran 57 tests in 90.135s ... OK`.
- PowerShell parser validation passed for both
  `scripts/run_lotto_update_launcher.ps1` and
  `scripts/install_lotto_update_task.ps1`.
- `git diff --check` passed.
