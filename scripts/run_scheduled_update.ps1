[CmdletBinding()]
param(
    [string]$AutomationRoot = (Join-Path $env:LOCALAPPDATA "LottoAmirUpdater"),
    [string]$RepositoryUrl = "https://github.com/moadi1987-eng/LottoAmir.git",
    [string]$PythonExecutable,
    [switch]$NoPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$AllowedDataPaths = @("LOTTO_PRIZES.json", "NUMBERS.xlsx")
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

    $paths = @()
    foreach ($entry in $StatusEntries) {
        if ($entry.Length -lt 4 -or $entry[2] -ne " ") {
            throw "Could not safely parse git status entry: $entry"
        }

        $status = $entry.Substring(0, 2)
        $path = $entry.Substring(3)
        if (
            $status.Contains("R") -or
            $status.Contains("C") -or
            $path.Length -eq 0 -or
            $path.StartsWith('"')
        ) {
            throw "Could not safely parse git status entry: $entry"
        }

        $paths += $path
    }

    return @($paths | Sort-Object -Unique)
}

function Test-OnlyAllowedDataPaths {
    param([string[]]$Paths)

    if ($Paths.Count -eq 0) { return $false }
    foreach ($path in $Paths) {
        if ($path -notin $AllowedDataPaths) { return $false }
    }
    return $true
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

        $workingChanges = @(& git -C $repositoryPath status --porcelain=v1 --untracked-files=all)
        Assert-LastExitCode "git status"
        if ($workingChanges.Count -gt 0) {
            $workingPaths = @(Get-ChangedPaths $workingChanges)
            if (Test-OnlyAllowedDataPaths $workingPaths) {
                Archive-AutomationClone "Recovering an interrupted validated data update."
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
                & git -C $repositoryPath diff --name-only --no-renames origin/main...main
            )
            Assert-LastExitCode "local commit path check"
            $localCommitPaths = @($localCommitPaths | Sort-Object -Unique)
            if (Test-OnlyAllowedDataPaths $localCommitPaths) {
                Archive-AutomationClone "Recovering a validated data commit after origin/main advanced."
                continue
            }
            throw "Automation clone diverged with changes outside the allowed data files."
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

    Write-UpdateLog "Starting scheduled results and prizes check."

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

        & $PythonExecutable scripts/update_lotto_prizes.py
        Assert-LastExitCode "official prize update"

        $changedEntries = @(& git status --porcelain=v1 --untracked-files=all)
        Assert-LastExitCode "git status after data update"
        $changedPaths = @(Get-ChangedPaths $changedEntries)

        if ($changedPaths.Count -gt 0) {
            if (-not (Test-OnlyAllowedDataPaths $changedPaths)) {
                throw "Updater changed files outside the allowed data files; refusing to commit."
            }

            & git config user.name "LottoAmir Updater"
            Assert-LastExitCode "git user-name configuration"
            & git config user.email "moadi1987-eng@users.noreply.github.com"
            Assert-LastExitCode "git user-email configuration"
            & git add -- $AllowedDataPaths
            Assert-LastExitCode "git add allowed data"
            & git commit -m "data: update lotto results and prizes"
            Assert-LastExitCode "git commit"
            Write-UpdateLog "Committed newly validated results and prize data."
        }

        $aheadCount = & git rev-list --count origin/main..HEAD
        Assert-LastExitCode "git ahead-count check"
        if ([int]$aheadCount -gt 0) {
            if ($NoPush) {
                Write-UpdateLog "NoPush was requested; leaving the commit in the isolated clone."
            } else {
                & git push origin main
                Assert-LastExitCode "git push origin main"
                Write-UpdateLog "Pushed updated results and prize data to GitHub."
            }
        } elseif ($changedPaths.Count -eq 0) {
            Write-UpdateLog "No new results or prize data was found; the repository is already current."
        }
    } finally {
        Pop-Location
    }

    Write-UpdateLog "Scheduled results and prizes check completed successfully."
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
