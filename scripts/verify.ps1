[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )
    Write-Host "==> $Name"
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

Push-Location (Join-Path $repoRoot 'backend')
try {
    $previousDatabaseUrl = $env:DATABASE_URL
    $env:DATABASE_URL = 'file:./test.db'
    Invoke-Step 'Prisma generate' { npx prisma generate }
    Invoke-Step 'Prisma validate' { npx prisma validate }
    Invoke-Step 'Backend tests' { npm test }
}
finally {
    $env:DATABASE_URL = $previousDatabaseUrl
    Pop-Location
}

Push-Location (Join-Path $repoRoot 'frontend')
try {
    Invoke-Step 'Frontend tests' { node --test 'tests/*.test.cjs' }
}
finally {
    Pop-Location
}

Push-Location (Join-Path $repoRoot 'telegram-bot')
try {
    Invoke-Step 'Telegram tests' { python -m pytest -q }
}
finally {
    Pop-Location
}

Write-Host 'All local verification suites passed.'
