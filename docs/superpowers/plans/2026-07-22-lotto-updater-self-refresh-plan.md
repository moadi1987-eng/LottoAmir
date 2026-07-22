# LottoAmir Updater Self-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every scheduled LottoAmir update refreshes the canonical runner from `origin/main` before execution, then repair and publish the missing official prize data for draw 3948.

**Architecture:** Add a small installed PowerShell launcher that fetches the configured repository, validates its exact origin, atomically refreshes the installed runner from `origin/main`, and executes only that refreshed runner. Keep result parsing, prize parsing, clone recovery, data allowlisting, commits, and pushes inside the existing runner.

**Tech Stack:** Windows PowerShell 5.1, Git, Windows Task Scheduler, Python 3.13 `unittest`, existing LottoAmir updater scripts, GitHub Pages.

## Global Constraints

- Never run the stale installed runner when fetch, origin validation, extraction, content validation, or atomic replacement fails.
- Fetch updater code only from `origin/main` of the exact configured repository URL.
- The launcher must not modify `NUMBERS.xlsx`, `LOTTO_PRIZES.json`, or another tracked repository file.
- Preserve the existing Tuesday/Thursday/Saturday 23:55 schedule, task name, power settings, execution limit, principal, and log directory.
- Preserve the runner's exact two-file allowlist and all existing recovery, commit, and push protections.
- Propagate the refreshed runner's exit code.
- Add no new runtime dependency.
- Populate draw 3948 only through the official Pais prize updater; never enter prize values manually.

## File Map

- Create `scripts/run_lotto_update_launcher.ps1`: stable bootstrapper that refreshes and executes the canonical runner.
- Modify `scripts/install_lotto_update_task.ps1`: install the launcher and register the scheduled action against it.
- Modify `tests/test_update_lotto_results.py`: launcher, installer, fail-closed, mutex, and real execution coverage.
- Do not modify result/prize parsers, PIN code, UI code, or generated data by hand.

---

### Task 1: Build The Fail-Closed Self-Refreshing Launcher

**Files:**
- Create: `scripts/run_lotto_update_launcher.ps1`
- Modify: `tests/test_update_lotto_results.py`

**Interfaces:**
- Consumes: `-AutomationRoot`, `-RepositoryUrl`, `-PythonExecutable`, and optional `-NoPush`.
- Produces: an atomically refreshed `%LOCALAPPDATA%\LottoAmirUpdater\run_scheduled_update.ps1`, a child runner invocation with the same arguments, daily log entries, and the child exit code.

- [ ] **Step 1: Add launcher paths and a PowerShell launcher helper to the Windows test fixture**

In `WindowsSchedulerRecoveryTests.setUp`, add the source launcher and installed runner paths:

```python
self.launcher = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "run_lotto_update_launcher.ps1"
)
self.installed_runner = self.automation_root / "run_scheduled_update.ps1"
```

Add a helper that invokes the launcher with the same fixture inputs as the runner:

```python
def run_launcher(self, no_push=True):
    command = [
        str(self.power_shell),
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(self.launcher),
        "-AutomationRoot",
        str(self.automation_root),
        "-RepositoryUrl",
        str(self.remote),
        "-PythonExecutable",
        sys.executable,
    ]
    if no_push:
        command.append("-NoPush")
    return subprocess.run(command, check=False, text=True, capture_output=True)
```

- [ ] **Step 2: Write a failing test proving a stale runner is replaced before execution**

Before the initial fixture commit, place a deterministic canonical runner in the seed repository:

```python
self.launcher_marker = self.root / "canonical-runner.txt"
canonical_runner = (
    "[CmdletBinding()]\n"
    "param([string]$AutomationRoot,[string]$RepositoryUrl,"
    "[string]$PythonExecutable,[switch]$NoPush)\n"
    f"Set-Content -LiteralPath '{self.launcher_marker}' "
    "-Value ($RepositoryUrl + '|' + $PythonExecutable + '|' + $NoPush.IsPresent)\n"
    "exit 0\n"
)
(self.seed / "scripts" / "run_scheduled_update.ps1").write_text(
    canonical_runner, encoding="utf-8"
)
```

Add the test:

```python
def test_launcher_replaces_stale_runner_before_execution(self):
    self.automation_root.mkdir(parents=True)
    self.installed_runner.write_text(
        f"Set-Content -LiteralPath '{self.root / 'stale.txt'}' -Value stale\n",
        encoding="utf-8",
    )

    launched = self.run_launcher()

    self.assertEqual(launched.returncode, 0, launched.stdout + launched.stderr)
    self.assertTrue(self.launcher_marker.exists())
    self.assertFalse((self.root / "stale.txt").exists())
    installed = self.installed_runner.read_text(encoding="utf-8-sig")
    self.assertIn("canonical-runner.txt", installed)
    self.assertIn(f"{self.remote}|{sys.executable}|True", self.launcher_marker.read_text())
```

- [ ] **Step 3: Write failing fail-closed tests for wrong origin, missing runner, and empty runner**

Add a helper that replaces the remote runner in a fresh clone and pushes it:

```python
def replace_remote_runner(self, contents=None, delete=False):
    writer = self.root / f"runner-writer-{uuid.uuid4().hex}"
    self.run_command(["git", "clone", str(self.remote), str(writer)])
    self.run_command(["git", "config", "user.name", "Runner Writer"], writer)
    self.run_command(["git", "config", "user.email", "runner@example.com"], writer)
    runner = writer / "scripts" / "run_scheduled_update.ps1"
    if delete:
        runner.unlink()
    else:
        runner.write_text(contents or "", encoding="utf-8")
    self.run_command(["git", "add", "-A"], writer)
    self.run_command(["git", "commit", "-m", "replace runner"], writer)
    self.run_command(["git", "push", "origin", "main"], writer)
```

Add focused tests:

```python
def test_launcher_rejects_clone_with_wrong_origin(self):
    launched = self.run_launcher()
    self.assertEqual(launched.returncode, 0, launched.stdout + launched.stderr)
    managed_repo = self.automation_root / "repo"
    self.run_command(["git", "remote", "set-url", "origin", str(self.root / "other.git")], managed_repo)
    self.installed_runner.write_text("throw 'stale runner executed'\n", encoding="utf-8")

    rejected = self.run_launcher()

    self.assertNotEqual(rejected.returncode, 0)
    self.assertIn("origin URL does not match", rejected.stdout)

def test_launcher_rejects_missing_remote_runner_without_executing_stale_copy(self):
    self.replace_remote_runner(delete=True)
    self.automation_root.mkdir(parents=True, exist_ok=True)
    stale_marker = self.root / "stale-missing.txt"
    self.installed_runner.write_text(
        f"Set-Content -LiteralPath '{stale_marker}' -Value stale\n", encoding="utf-8"
    )

    rejected = self.run_launcher()

    self.assertNotEqual(rejected.returncode, 0)
    self.assertFalse(stale_marker.exists())
    self.assertIn("could not extract the canonical runner", rejected.stdout)

def test_launcher_rejects_empty_remote_runner_without_executing_stale_copy(self):
    self.replace_remote_runner(contents="")
    self.automation_root.mkdir(parents=True, exist_ok=True)
    stale_marker = self.root / "stale-empty.txt"
    self.installed_runner.write_text(
        f"Set-Content -LiteralPath '{stale_marker}' -Value stale\n", encoding="utf-8"
    )

    rejected = self.run_launcher()

    self.assertNotEqual(rejected.returncode, 0)
    self.assertFalse(stale_marker.exists())
    self.assertIn("canonical runner content is invalid", rejected.stdout)
```

Import `uuid` at the top of the test module.

- [ ] **Step 4: Run the launcher tests and verify RED**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest `
  tests.test_update_lotto_results.WindowsSchedulerRecoveryTests.test_launcher_replaces_stale_runner_before_execution `
  tests.test_update_lotto_results.WindowsSchedulerRecoveryTests.test_launcher_rejects_clone_with_wrong_origin `
  tests.test_update_lotto_results.WindowsSchedulerRecoveryTests.test_launcher_rejects_missing_remote_runner_without_executing_stale_copy `
  tests.test_update_lotto_results.WindowsSchedulerRecoveryTests.test_launcher_rejects_empty_remote_runner_without_executing_stale_copy
```

Expected: failures because `run_lotto_update_launcher.ps1` does not exist.

- [ ] **Step 5: Implement launcher parameter, logging, command, and mutex helpers**

Create `scripts/run_lotto_update_launcher.ps1` with this structure:

```powershell
[CmdletBinding()]
param(
    [string]$AutomationRoot = (Join-Path $env:LOCALAPPDATA "LottoAmirUpdater"),
    [string]$RepositoryUrl = "https://github.com/moadi1987-eng/LottoAmir.git",
    [string]$PythonExecutable,
    [switch]$NoPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryPath = Join-Path $AutomationRoot "repo"
$installedRunner = Join-Path $AutomationRoot "run_scheduled_update.ps1"
$logDirectory = Join-Path $AutomationRoot "logs"
$logPath = Join-Path $logDirectory ("update-{0}.log" -f (Get-Date -Format "yyyyMMdd"))
$powerShellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not $PythonExecutable) {
    $PythonExecutable = Join-Path $AutomationRoot ".venv\Scripts\python.exe"
}

New-Item -ItemType Directory -Path $AutomationRoot -Force | Out-Null
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Write-LauncherLog {
    param([string]$Message)
    $entry = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    $entry | Add-Content -LiteralPath $logPath -Encoding UTF8
    Write-Host $entry
}

function Assert-LastExitCode {
    param([string]$Operation)
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed with exit code $LASTEXITCODE"
    }
}
```

Use a distinct launcher mutex:

```powershell
$mutex = [System.Threading.Mutex]::new($false, "Local\LottoAmirUpdaterLauncher")
$hasLock = $false
```

- [ ] **Step 6: Implement exact-origin fetch and atomic runner refresh**

Inside the launcher's guarded `try`, implement:

```powershell
$hasLock = $mutex.WaitOne(0)
if (-not $hasLock) {
    Write-LauncherLog "Another updater launcher is already running; skipping this trigger."
    exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $repositoryPath ".git"))) {
    Write-LauncherLog "Creating automation clone before runner refresh."
    & git clone $RepositoryUrl $repositoryPath
    Assert-LastExitCode "git clone"
}

$actualOrigin = (& git -C $repositoryPath remote get-url origin).Trim()
Assert-LastExitCode "git origin lookup"
if ($actualOrigin -cne $RepositoryUrl) {
    throw "Automation clone origin URL does not match the configured repository."
}

& git -C $repositoryPath fetch origin main
Assert-LastExitCode "git fetch origin main"

$runnerLines = @(
    & git -C $repositoryPath show origin/main:scripts/run_scheduled_update.ps1
)
if ($LASTEXITCODE -ne 0) {
    throw "Launcher could not extract the canonical runner from origin/main."
}
$runnerContent = $runnerLines -join [Environment]::NewLine
if (
    [string]::IsNullOrWhiteSpace($runnerContent) -or
    -not $runnerContent.Contains("[CmdletBinding()]") -or
    -not $runnerContent.Contains("param(")
) {
    throw "The canonical runner content is invalid."
}

$temporaryRunner = "{0}.{1}.tmp" -f $installedRunner, [guid]::NewGuid().ToString("N")
try {
    [System.IO.File]::WriteAllText(
        $temporaryRunner,
        $runnerContent + [Environment]::NewLine,
        [System.Text.UTF8Encoding]::new($false)
    )
    if (Test-Path -LiteralPath $installedRunner) {
        [System.IO.File]::Replace($temporaryRunner, $installedRunner, $null)
    } else {
        [System.IO.File]::Move($temporaryRunner, $installedRunner)
    }
} finally {
    if (Test-Path -LiteralPath $temporaryRunner) {
        Remove-Item -LiteralPath $temporaryRunner -Force
    }
}
Write-LauncherLog "Refreshed the scheduled runner from origin/main."
```

Do not catch a refresh error and continue with `$installedRunner`.

- [ ] **Step 7: Execute the refreshed runner and propagate its exit code**

Build the child arguments without string interpolation of untrusted shell text:

```powershell
$runnerArguments = @(
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", $installedRunner,
    "-AutomationRoot", $AutomationRoot,
    "-RepositoryUrl", $RepositoryUrl,
    "-PythonExecutable", $PythonExecutable
)
if ($NoPush) { $runnerArguments += "-NoPush" }

& $powerShellPath @runnerArguments
$runnerExitCode = $LASTEXITCODE
if ($runnerExitCode -ne 0) {
    throw "Refreshed scheduled runner failed with exit code $runnerExitCode"
}
Write-LauncherLog "Refreshed scheduled runner completed successfully."
exit 0
```

Use this exact outer error/finalization shape:

```powershell
} catch {
    Write-LauncherLog ("LAUNCHER ERROR: {0}" -f $_.Exception.Message)
    exit 1
} finally {
    if ($hasLock) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
```

- [ ] **Step 8: Add and verify mutex and child-failure tests**

Use a canonical fixture runner that increments a counter and sleeps. Start one launcher with `subprocess.Popen`, wait for its started marker, then invoke a second launcher and assert the counter remains one and the second output contains the skip message.

Add a second fixture runner containing `exit 7` and assert the launcher propagates exit code 7 with `Refreshed scheduled runner failed with exit code 7` in the log/output.

Run all launcher-focused tests. Expected: PASS with no stale marker and no leftover `*.tmp` runner files.

- [ ] **Step 9: Run the complete updater test modules**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest `
  tests.test_update_lotto_results tests.test_update_lotto_prizes
```

Expected: all existing 49 tests plus the new launcher tests pass.

- [ ] **Step 10: Commit Task 1**

```powershell
git add scripts/run_lotto_update_launcher.ps1 tests/test_update_lotto_results.py
git commit -m "feat: self-refresh scheduled lotto runner"
```

---

### Task 2: Install And Exercise The Launcher

**Files:**
- Modify: `scripts/install_lotto_update_task.ps1`
- Modify: `tests/test_update_lotto_results.py`

**Interfaces:**
- Consumes: `scripts/run_lotto_update_launcher.ps1` and `scripts/run_scheduled_update.ps1`.
- Produces: installed launcher/runner copies and a scheduled action whose `-File` target is the installed launcher.

- [ ] **Step 1: Add failing installer contract assertions**

Extend `LocalSchedulerContractTests`:

```python
launcher_path = root / "scripts" / "run_lotto_update_launcher.ps1"
launcher = launcher_path.read_text(encoding="utf-8")

self.assertIn('$installedLauncher = Join-Path $automationRoot "run_lotto_update_launcher.ps1"', installer)
self.assertIn("Copy-Item -LiteralPath $sourceLauncher -Destination $installedLauncher -Force", installer)
self.assertIn("('-File \"{0}\"' -f $installedLauncher)", installer)
self.assertNotIn("('-File \"{0}\"' -f $installedRunner)", installer)
self.assertIn("run_scheduled_update.ps1", launcher)
self.assertIn("origin/main:scripts/run_scheduled_update.ps1", launcher)
```

- [ ] **Step 2: Run the installer contract test and verify RED**

Run:

```powershell
& 'C:\Users\amirmoa\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest `
  tests.test_update_lotto_results.LocalSchedulerContractTests
```

Expected: failure because the installer still targets `$installedRunner`.

- [ ] **Step 3: Modify the installer to deploy and schedule the launcher**

Near the existing runner paths, add:

```powershell
$installedLauncher = Join-Path $automationRoot "run_lotto_update_launcher.ps1"
$sourceLauncher = Join-Path $PSScriptRoot "run_lotto_update_launcher.ps1"
```

Copy both scripts:

```powershell
Copy-Item -LiteralPath $sourceLauncher -Destination $installedLauncher -Force
Copy-Item -LiteralPath $sourceRunner -Destination $installedRunner -Force
```

Change only the scheduled action's `-File` argument:

```powershell
('-File "{0}"' -f $installedLauncher)
```

Keep all triggers, settings, principal, description, `-RunNow`, and uninstall behavior unchanged.

- [ ] **Step 4: Strengthen the installer contract without adding test-only switches**

Add one structural test that verifies all production wiring together:

```python
def test_installer_deploys_both_scripts_and_schedules_only_the_launcher(self):
    root = Path(__file__).resolve().parents[1]
    installer = (root / "scripts" / "install_lotto_update_task.ps1").read_text(
        encoding="utf-8"
    )

    self.assertIn(
        '$sourceLauncher = Join-Path $PSScriptRoot "run_lotto_update_launcher.ps1"',
        installer,
    )
    self.assertIn(
        'Copy-Item -LiteralPath $sourceLauncher -Destination $installedLauncher -Force',
        installer,
    )
    self.assertIn(
        'Copy-Item -LiteralPath $sourceRunner -Destination $installedRunner -Force',
        installer,
    )
    self.assertIn("('-File \"{0}\"' -f $installedLauncher)", installer)
    self.assertNotIn("('-File \"{0}\"' -f $installedRunner)", installer)
    self.assertNotIn("SkipTaskRegistration", installer)
    self.assertNotIn("SkipDependencyInstall", installer)
```

Task 3 performs the real Windows Task Scheduler registration and verifies the
registered action path. Do not add production switches solely to make the
installer testable.

- [ ] **Step 5: Run all updater tests and inspect PowerShell syntax**

Run both Python modules, then parse both scripts without executing them:

```powershell
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path 'scripts/run_lotto_update_launcher.ps1'), [ref]$null, [ref]$errors
) | Out-Null
if ($errors.Count) { $errors | Format-List; exit 1 }

$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path 'scripts/install_lotto_update_task.ps1'), [ref]$null, [ref]$errors
) | Out-Null
if ($errors.Count) { $errors | Format-List; exit 1 }
```

Expected: all tests pass and both parser error collections are empty.

- [ ] **Step 6: Commit Task 2**

```powershell
git add scripts/install_lotto_update_task.ps1 tests/test_update_lotto_results.py
git commit -m "feat: install self-refreshing lotto launcher"
```

---

### Task 3: Publish, Repair Draw 3948, And Verify Production

**Files:**
- Generated by updater only: `LOTTO_PRIZES.json`
- Do not hand-edit any data or source file in this task.

**Interfaces:**
- Consumes: the reviewed launcher/installer, real scheduled task, official Pais draw 3948 page, and GitHub Pages.
- Produces: refreshed Windows task installation and published prize data through draw 3948.

- [ ] **Step 1: Run the full local regression before publication**

Run all 11 non-Playwright Node scripts, both Playwright scripts, both Python updater modules, `update_lotto_prizes.py --verify-only`, JSON validation, and `git diff --check`.

Expected: all tests pass; `--verify-only` initially reports draw 3948 missing because `NUMBERS.xlsx` is one draw ahead of `LOTTO_PRIZES.json`.

- [ ] **Step 2: Review the complete feature branch**

Generate a review package from the branch base through HEAD. Require separate spec-compliance and code-quality approval, with no open Critical or Important finding.

- [ ] **Step 3: Merge to main and push launcher changes**

Fetch `origin/main`. If the only remote advance is an approved data update, integrate it without overwriting it. Fast-forward or rebase the reviewed feature branch, rerun focused updater tests, then push main.

- [ ] **Step 4: Reinstall the real scheduled task with the new launcher**

From the updated main checkout, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  scripts\install_lotto_update_task.ps1 -RunNow
```

Verify the registered action points to:

```text
%LOCALAPPDATA%\LottoAmirUpdater\run_lotto_update_launcher.ps1
```

- [ ] **Step 5: Wait by condition for the real run to finish**

Poll the current daily log until it contains one of:

```text
Refreshed scheduled runner completed successfully.
LAUNCHER ERROR:
```

Do not use a fixed sleep as proof. Also wait until the task state is no longer `Running`. On error, stop and inspect the full log before retrying.

- [ ] **Step 6: Verify local automation state and the pushed data commit**

Confirm the log contains:

```text
Refreshed the scheduled runner from origin/main.
Starting scheduled results and prizes check.
Committed newly validated results and prize data.
Pushed updated results and prize data to GitHub.
```

Verify the new commit changes only `LOTTO_PRIZES.json` (or both allowed data files if the official result source changed again). Confirm the automation clone's `origin/main`, local `main`, and remote `main` match.

- [ ] **Step 7: Verify draw 3948 data locally and live**

Run `update_lotto_prizes.py --verify-only`. Parse `LOTTO_PRIZES.json` and require:

```text
draw count = 1716
maximum draw number = 3948
draws["3948"].drawNumber = 3948
draws["3948"].sourceUrl = https://www.pais.co.il/Lotto/CurrentLotto.aspx?lotteryId=3948
draws["3948"].regular is nonempty
```

Poll the cache-busted GitHub Pages JSON until the same conditions hold.

- [ ] **Step 8: Verify the live PIN calculation is available**

Open the live `Lotto_All_In_One.html`, enter the PIN comparison section, and open draw 3948 on each available PIN card. Confirm:

- the winnings band no longer says `נתוני זכייה לא זמינים`;
- each combination displays either a prize, `₪0 · לא חולק`, or `ללא זכייה`;
- all four cards remain independent;
- desktop and mobile widths have no new overflow.

- [ ] **Step 9: Final repository verification**

Confirm `main` is clean and synchronized with `origin/main`. Report the launcher commit, generated-data commit, final test counts, draw 3948 coverage, task action path, and live site URL.
