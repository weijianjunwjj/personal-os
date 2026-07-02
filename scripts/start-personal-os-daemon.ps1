$ErrorActionPreference = "Stop"

$Root = "D:\VSCode\personal-os"
$LogDir = Join-Path $Root "logs"
$LogFile = Join-Path $LogDir "daemon.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location -LiteralPath $Root

"[$(Get-Date -Format o)] Starting Personal OS daemon from Windows task." | Add-Content -LiteralPath $LogFile -Encoding UTF8

& pnpm.cmd daemon:start *>> $LogFile
