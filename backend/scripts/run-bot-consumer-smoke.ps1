param(
  [string]$BackendUrl = "https://travel-assistant-api-chi.vercel.app",
  [string]$FrontendOrigin = "https://travel-assistant-summer-module.vercel.app",
  [string]$PythonPath = "python"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$botRoot = Join-Path $repoRoot "telegram-bot"

if (-not $env:TRAVEL_API_SERVICE_TOKEN) { throw "TRAVEL_API_SERVICE_TOKEN is required" }
if (-not $env:DEMO_ORGANIZER_PASSWORD) { throw "DEMO_ORGANIZER_PASSWORD is required" }

$previousPythonPath = $env:PYTHONPATH
$previousFrontendOrigin = $env:TRAVEL_FRONTEND_ORIGIN
try {
  $env:TRAVEL_BACKEND_URL = $BackendUrl
  $env:TRAVEL_FRONTEND_ORIGIN = $FrontendOrigin
  $env:PYTHONPATH = if ($previousPythonPath) { "$botRoot;$previousPythonPath" } else { $botRoot }
  & $PythonPath (Join-Path $PSScriptRoot "bot_consumer_smoke.py")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  $env:PYTHONPATH = $previousPythonPath
  if ($previousFrontendOrigin) { $env:TRAVEL_FRONTEND_ORIGIN = $previousFrontendOrigin }
  else { Remove-Item Env:TRAVEL_FRONTEND_ORIGIN -ErrorAction SilentlyContinue }
  Remove-Item Env:TRAVEL_BACKEND_URL -ErrorAction SilentlyContinue
}
