# Start Antigravity isolated from the user's own data, with CDP enabled, for checking the translation.
#   powershell -ExecutionPolicy Bypass -File tools\launch-sandbox.ps1 [-Port 9333] [-Extra "--inspect=9339"]
# HOME/USERPROFILE/APPDATA/LOCALAPPDATA and --user-data-dir point into tmp\sandbox, so settings,
# logs, conversations and caches of the real installation are not touched. The language server
# still finds the signed-in account through Windows Credential Manager. Prints the PID; stop it
# with: taskkill /PID <pid> /T /F
param([int]$Port = 9333, [string[]]$Extra = @(), [string]$Root = "")
if (-not $Root) { $Root = Join-Path $PSScriptRoot "..\tmp\sandbox" }
$exe = Join-Path $env:LOCALAPPDATA "Programs\antigravity\Antigravity.exe"
$home2 = Join-Path $Root "home"
$ud = Join-Path $Root "userdata"
New-Item -ItemType Directory -Force -Path (Join-Path $home2 "appdata\roaming"), (Join-Path $home2 "appdata\local") | Out-Null
$env:USERPROFILE = $home2
$env:HOME = $home2
$env:APPDATA = Join-Path $home2 "appdata\roaming"
$env:LOCALAPPDATA = Join-Path $home2 "appdata\local"
$p = Start-Process -FilePath $exe -ArgumentList (@("--user-data-dir=$ud", "--remote-debugging-port=$Port") + $Extra) -PassThru
"PID=$($p.Id)"
