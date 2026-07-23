[CmdletBinding()]
param(
    [string]$GitleaksPath = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $GitleaksPath) {
    $command = Get-Command gitleaks -ErrorAction SilentlyContinue
    if ($command) {
        $GitleaksPath = $command.Source
    }
}

if (-not $GitleaksPath) {
    $bundled = 'C:\Projects\tools\gitleaks-8.30.1\gitleaks.exe'
    if (Test-Path -LiteralPath $bundled) {
        $GitleaksPath = $bundled
    }
}

if (-not $GitleaksPath -or -not (Test-Path -LiteralPath $GitleaksPath)) {
    throw 'Gitleaks not found. Install v8.30.1+ or pass -GitleaksPath.'
}

Write-Host '==> Gitleaks working tree scan (redacted)'
& $GitleaksPath dir --config (Join-Path $repoRoot '.gitleaks.toml') `
    --redact=100 --no-banner --no-color $repoRoot
if ($LASTEXITCODE -ne 0) {
    throw 'Gitleaks working tree scan failed.'
}

Write-Host '==> Gitleaks Git history scan (redacted)'
& $GitleaksPath git --config (Join-Path $repoRoot '.gitleaks.toml') `
    --redact=100 --no-banner --no-color $repoRoot
if ($LASTEXITCODE -ne 0) {
    throw 'Gitleaks Git history scan failed.'
}

Write-Host 'No unallowlisted secrets detected.'

