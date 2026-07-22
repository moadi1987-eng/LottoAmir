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

$mutex = [System.Threading.Mutex]::new($false, "Local\LottoAmirUpdaterLauncher")
$hasLock = $false

try {
    $hasLock = $mutex.WaitOne(0)
    if (-not $hasLock) {
        Write-LauncherLog "Another updater launcher is already running; skipping this trigger."
        exit 0
    }

    if (-not (Test-Path -LiteralPath (Join-Path $repositoryPath ".git"))) {
        if (Test-Path -LiteralPath $repositoryPath) {
            throw "Automation repository path is not a Git clone."
        }
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
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseInput(
        $runnerContent,
        [ref]$tokens,
        [ref]$parseErrors
    ) | Out-Null
    if ($parseErrors.Count -gt 0) {
        throw "The canonical runner PowerShell syntax is invalid."
    }

    $temporaryRunner = "{0}.{1}.tmp" -f $installedRunner, [guid]::NewGuid().ToString("N")
    $temporaryBackup = "{0}.{1}.bak" -f $installedRunner, [guid]::NewGuid().ToString("N")
    try {
        [System.IO.File]::WriteAllText(
            $temporaryRunner,
            $runnerContent + [Environment]::NewLine,
            [System.Text.UTF8Encoding]::new($false)
        )
        if (Test-Path -LiteralPath $installedRunner) {
            [System.IO.File]::Replace($temporaryRunner, $installedRunner, $temporaryBackup)
        } else {
            [System.IO.File]::Move($temporaryRunner, $installedRunner)
        }
    } finally {
        if (Test-Path -LiteralPath $temporaryRunner) {
            Remove-Item -LiteralPath $temporaryRunner -Force
        }
        if (Test-Path -LiteralPath $temporaryBackup) {
            Remove-Item -LiteralPath $temporaryBackup -Force
        }
    }
    Write-LauncherLog "Refreshed the scheduled runner from origin/main."

    $runnerArguments = @(
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-File", $installedRunner,
        "-AutomationRoot", $AutomationRoot,
        "-RepositoryUrl", $RepositoryUrl,
        "-PythonExecutable", $PythonExecutable
    )
    if ($NoPush) {
        $runnerArguments += "-NoPush"
    }

    & $powerShellPath @runnerArguments
    $runnerExitCode = $LASTEXITCODE
    if ($runnerExitCode -ne 0) {
        Write-LauncherLog "Refreshed scheduled runner failed with exit code $runnerExitCode"
        exit $runnerExitCode
    }
    Write-LauncherLog "Refreshed scheduled runner completed successfully."
    exit 0
} catch {
    Write-LauncherLog ("LAUNCHER ERROR: {0}" -f $_.Exception.Message)
    exit 1
} finally {
    if ($hasLock) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
