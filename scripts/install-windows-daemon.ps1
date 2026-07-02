$ErrorActionPreference = "Stop"

$TaskName = "PersonalOSDaemon"
$Root = "D:\VSCode\personal-os"
$StartScript = Join-Path $Root "scripts\start-personal-os-daemon.ps1"

if (-not (Test-Path -LiteralPath $StartScript)) {
  throw "Start script not found: $StartScript"
}

$existing = schtasks.exe /Query /TN $TaskName 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Output "Task $TaskName already exists. Updating it."
  schtasks.exe /Delete /TN $TaskName /F | Out-Null
}

$taskRun = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
schtasks.exe /Create /TN $TaskName /SC ONLOGON /TR $taskRun /RL LIMITED /F | Out-Null

if ($LASTEXITCODE -eq 0) {
  Write-Output "Installed Windows login task: $TaskName"
  Write-Output "Action: $taskRun"
} else {
  throw "Failed to install Windows task $TaskName"
}
