[CmdletBinding()]
param(
    [switch]$Uninstall,
    [switch]$RunNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$taskName = "LottoAmir Automatic Results Update"
$automationRoot = Join-Path $env:LOCALAPPDATA "LottoAmirUpdater"
$repositoryPath = Join-Path $automationRoot "repo"
$venvPath = Join-Path $automationRoot ".venv"
$pythonPath = Join-Path $venvPath "Scripts\python.exe"
$installedRunner = Join-Path $automationRoot "run_scheduled_update.ps1"
$sourceRunner = Join-Path $PSScriptRoot "run_scheduled_update.ps1"
$requirementsPath = Join-Path $PSScriptRoot "requirements-lotto-update.txt"
$repositoryUrl = "https://github.com/moadi1987-eng/LottoAmir.git"

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task: $taskName"
    exit 0
}

New-Item -ItemType Directory -Path $automationRoot -Force | Out-Null
Copy-Item -LiteralPath $sourceRunner -Destination $installedRunner -Force

if (-not (Test-Path -LiteralPath (Join-Path $repositoryPath ".git"))) {
    & git clone $repositoryUrl $repositoryPath
    if ($LASTEXITCODE -ne 0) {
        throw "git clone failed with exit code $LASTEXITCODE"
    }
}

if (-not (Test-Path -LiteralPath $pythonPath)) {
    & py -3.13 -m venv $venvPath
    if ($LASTEXITCODE -ne 0) {
        throw "Python 3.13 virtual environment creation failed with exit code $LASTEXITCODE"
    }
}

& $pythonPath -m pip install --disable-pip-version-check --requirement $requirementsPath
if ($LASTEXITCODE -ne 0) {
    throw "Updater dependency installation failed with exit code $LASTEXITCODE"
}

$powerShellPath = Join-Path `
    $env:SystemRoot `
    "System32\WindowsPowerShell\v1.0\powershell.exe"
$actionArguments = @(
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy Bypass",
    "-WindowStyle Hidden",
    ('-File "{0}"' -f $installedRunner)
) -join " "
$action = New-ScheduledTaskAction `
    -Execute $powerShellPath `
    -Argument $actionArguments `
    -WorkingDirectory $automationRoot

$drawTrigger = New-ScheduledTaskTrigger `
    -Weekly `
    -WeeksInterval 1 `
    -DaysOfWeek Tuesday, Thursday, Saturday `
    -At "23:55"
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
    -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal `
    -UserId $userId `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $drawTrigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Downloads validated Pais lotto results and publishes NUMBERS.xlsx to LottoAmir." `
    -Force | Out-Null

Write-Host "Installed scheduled task: $taskName"
Write-Host "Runs Tuesday, Thursday, and Saturday at 23:55."
Write-Host "Missed runs start when the computer becomes available."
Write-Host "Logs: $(Join-Path $automationRoot 'logs')"

if ($RunNow) {
    Start-ScheduledTask -TaskName $taskName
    Write-Host "Started the first scheduled run."
}
