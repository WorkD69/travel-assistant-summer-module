param(
  [string]$BackendUrl = "https://travel-assistant-api-chi.vercel.app",
  [string]$PythonPath = "python"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$botRoot = Join-Path $repoRoot "telegram-bot"

if (-not $env:TRAVEL_API_SERVICE_TOKEN) { throw "TRAVEL_API_SERVICE_TOKEN is required" }
if (-not $env:DEMO_ORGANIZER_PASSWORD) { throw "DEMO_ORGANIZER_PASSWORD is required" }

$previousPythonPath = $env:PYTHONPATH
try {
  $env:TRAVEL_BACKEND_URL = $BackendUrl
  $env:PYTHONPATH = if ($previousPythonPath) { "$botRoot;$previousPythonPath" } else { $botRoot }
  & $PythonPath (Join-Path $PSScriptRoot "bot_consumer_smoke.py")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  $env:PYTHONPATH = $previousPythonPath
  Remove-Item Env:TRAVEL_BACKEND_URL -ErrorAction SilentlyContinue
}
