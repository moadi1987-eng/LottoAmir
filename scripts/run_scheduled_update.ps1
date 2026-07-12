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
if (-not $PythonExecutable) {
    $PythonExecutable = Join-Path $AutomationRoot ".venv\Scripts\python.exe"
}
$logDirectory = Join-Path $AutomationRoot "logs"
$logPath = Join-Path $logDirectory ("update-{0}.log" -f (Get-Date -Format "yyyyMMdd"))

New-Item -ItemType Directory -Path $AutomationRoot -Force | Out-Null
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Write-UpdateLog {
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

function Get-ChangedPaths {
    param([string[]]$StatusEntries)

    return @(
        $StatusEntries |
            Where-Object { $_.Length -ge 4 } |
            ForEach-Object { $_.Substring(3).Trim() } |
            Sort-Object -Unique
    )
}

function New-AutomationClone {
    Write-UpdateLog "Creating isolated automation clone."
    & git clone $RepositoryUrl $repositoryPath
    Assert-LastExitCode "git clone"
}

function Archive-AutomationClone {
    param([string]$Reason)

    $rootFullPath = [System.IO.Path]::GetFullPath($AutomationRoot).TrimEnd("\", "/")
    $repositoryFullPath = [System.IO.Path]::GetFullPath($repositoryPath)
    $requiredPrefix = $rootFullPath + [System.IO.Path]::DirectorySeparatorChar
    if (-not $repositoryFullPath.StartsWith(
        $requiredPrefix,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Automation repository path is outside the automation root."
    }

    $backupName = "repo-recovery-{0}-{1}" -f `
        (Get-Date -Format "yyyyMMdd-HHmmss"), `
        ([guid]::NewGuid().ToString("N").Substring(0, 8))
    $backupPath = Join-Path $AutomationRoot $backupName
    Write-UpdateLog "$Reason Preserving the old clone at $backupPath."
    Move-Item -LiteralPath $repositoryPath -Destination $backupPath
    New-AutomationClone
}

function Prepare-AutomationClone {
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        if (-not (Test-Path -LiteralPath (Join-Path $repositoryPath ".git"))) {
            New-AutomationClone
        }

        $workingChanges = @(& git -C $repositoryPath status --porcelain --untracked-files=all)
        Assert-LastExitCode "git status"
        if ($workingChanges.Count -gt 0) {
            $workingPaths = @(Get-ChangedPaths $workingChanges)
            if ($workingPaths.Count -eq 1 -and $workingPaths[0] -eq "NUMBERS.xlsx") {
                Archive-AutomationClone "Recovering an interrupted NUMBERS.xlsx update."
                continue
            }
            throw "Automation clone has unexpected local changes; refusing recovery."
        }

        & git -C $repositoryPath switch main
        Assert-LastExitCode "git switch main"
        & git -C $repositoryPath fetch origin main
        Assert-LastExitCode "git fetch origin main"

        $divergence = (& git -C $repositoryPath rev-list --left-right --count main...origin/main).Trim()
        Assert-LastExitCode "git divergence check"
        $counts = @($divergence -split "\s+")
        if ($counts.Count -ne 2) {
            throw "Could not parse git divergence result: $divergence"
        }

        $localAhead = [int]$counts[0]
        $remoteAhead = [int]$counts[1]
        if ($localAhead -gt 0 -and $remoteAhead -gt 0) {
            $localCommitPaths = @(
                & git -C $repositoryPath diff --name-only origin/main...main
            )
            Assert-LastExitCode "local commit path check"
            $localCommitPaths = @($localCommitPaths | Sort-Object -Unique)
            if (
                $localCommitPaths.Count -eq 1 -and
                $localCommitPaths[0] -eq "NUMBERS.xlsx"
            ) {
                Archive-AutomationClone "Recovering a validated data commit after origin/main advanced."
                continue
            }
            throw "Automation clone diverged with changes outside NUMBERS.xlsx."
        }

        return
    }

    throw "Automation clone recovery exceeded the safe retry limit."
}

$mutex = [System.Threading.Mutex]::new($false, "Local\LottoAmirUpdater")
$hasLock = $false

try {
    $hasLock = $mutex.WaitOne(0)
    if (-not $hasLock) {
        Write-UpdateLog "Another update is already running; skipping this trigger."
        exit 0
    }

    Write-UpdateLog "Starting scheduled results check."

    Prepare-AutomationClone
    if (-not (Test-Path -LiteralPath $PythonExecutable)) {
        throw "Automation Python environment is missing. Run install_lotto_update_task.ps1 again."
    }

    Push-Location $repositoryPath
    try {
        & git switch main
        Assert-LastExitCode "git switch main"
        & git pull --ff-only origin main
        Assert-LastExitCode "git pull --ff-only origin main"

        & $PythonExecutable scripts/update_lotto_results.py
        Assert-LastExitCode "official results update"

        & git diff --quiet -- NUMBERS.xlsx
        $workbookDiffExit = $LASTEXITCODE
        if ($workbookDiffExit -notin @(0, 1)) {
            throw "git diff failed with exit code $workbookDiffExit"
        }

        if ($workbookDiffExit -eq 1) {
            $changedEntries = @(& git status --porcelain --untracked-files=all)
            Assert-LastExitCode "git status after update"
            $changedPaths = @(Get-ChangedPaths $changedEntries)
            if ($changedPaths.Count -ne 1 -or $changedPaths[0] -ne "NUMBERS.xlsx") {
                throw "Updater changed files other than NUMBERS.xlsx; refusing to commit."
            }

            & git config user.name "LottoAmir Updater"
            Assert-LastExitCode "git user-name configuration"
            & git config user.email "moadi1987-eng@users.noreply.github.com"
            Assert-LastExitCode "git user-email configuration"
            & git add NUMBERS.xlsx
            Assert-LastExitCode "git add NUMBERS.xlsx"
            & git commit -m "data: update lotto results"
            Assert-LastExitCode "git commit"
            Write-UpdateLog "Committed a newly validated draw."
        }

        $aheadCount = & git rev-list --count origin/main..HEAD
        Assert-LastExitCode "git ahead-count check"
        if ([int]$aheadCount -gt 0) {
            if ($NoPush) {
                Write-UpdateLog "NoPush was requested; leaving the commit in the isolated clone."
            } else {
                & git push origin main
                Assert-LastExitCode "git push origin main"
                Write-UpdateLog "Pushed the updated workbook to GitHub."
            }
        } elseif ($workbookDiffExit -eq 0) {
            Write-UpdateLog "No new draw was found; the repository is already current."
        }
    } finally {
        Pop-Location
    }

    Write-UpdateLog "Scheduled results check completed successfully."
    exit 0
} catch {
    Write-UpdateLog ("ERROR: {0}" -f $_.Exception.Message)
    exit 1
} finally {
    if ($hasLock) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
