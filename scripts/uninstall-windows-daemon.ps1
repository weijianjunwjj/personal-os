$ErrorActionPreference = "Stop"

$TaskName = "PersonalOSDaemon"

schtasks.exe /Query /TN $TaskName 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Output "Task $TaskName is not installed."
  exit 0
}

schtasks.exe /Delete /TN $TaskName /F | Out-Null

if ($LASTEXITCODE -eq 0) {
  Write-Output "Uninstalled Windows login task: $TaskName"
} else {
  throw "Failed to uninstall Windows task $TaskName"
}
