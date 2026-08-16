[CmdletBinding()]

param(

    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    
    [switch]$SkipOptional
    
)



$ErrorActionPreference = 'Stop'

$script:Failed = $false

$RepoRoot = (Resolve-Path $RepoRoot).Path



function Invoke-Required {

    param(
    
        [Parameter(Mandatory = $true)][string]$Name,
        
        [Parameter(Mandatory = $true)][scriptblock]$Action
        
    )
    


    try {
    
        & $Action
        
        if ($LASTEXITCODE -ne 0) {
        
            throw "exit code $LASTEXITCODE"
            
        }
        
        Write-Host "PASS $Name"
        
    }
    
    catch {
    
        Write-Error "FAIL $Name: $($_.Exception.Message)"
        
        $script:Failed = $true
        
    }
    
}



function Invoke-FrontendSuite {

    Push-Location (Join-Path $RepoRoot 'frontend')
    
    try { node --test 'tests/*.test.cjs' }
    
    finally { Pop-Location }
    
}



function Invoke-BackendSuite {

    $previousDatabaseUrl = $env:DATABASE_URL
    
    $env:DATABASE_URL = if ($previousDatabaseUrl) { $previousDatabaseUrl } else { 'file:./test.db' }
    
    Push-Location (Join-Path $RepoRoot 'backend')
    
    try {
    
        if (Test-Path 'node_modules/.bin/prisma') {
        
            npx prisma generate
            
            if ($LASTEXITCODE -ne 0) { throw "Prisma generate exit code $LASTEXITCODE" }
            
            npx prisma validate
            
            if ($LASTEXITCODE -ne 0) { throw "Prisma validate exit code $LASTEXITCODE" }
            
        }
        
        npm test
        
    }
    
    finally {
    
        $env:DATABASE_URL = $previousDatabaseUrl
        
        Pop-Location
        
    }
    
}



function Invoke-CanonicalTripRegressions {

    Push-Location (Join-Path $RepoRoot 'frontend')
    
    try { node --test tests/no-demo-trip-fallback.test.cjs }
    
    finally { Pop-Location }
    
}



function Invoke-AccessSecurityRegressions {

    Push-Location (Join-Path $RepoRoot 'backend')
    
    try { node --test test/trip-access.test.js }
    
    finally { Pop-Location }
    
}



function Invoke-JavaScriptSyntaxChecks {

    Get-ChildItem -Path $RepoRoot -Recurse -File -Include *.js,*.cjs |
    
        Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' } |
        
        ForEach-Object {
        
            node --check $_.FullName | Out-Null
            
            if ($LASTEXITCODE -ne 0) { throw "syntax check failed: $($_.FullName)" }
            
        }
        
}



function Invoke-DiffCheck {

    git -C $RepoRoot diff --check
    
}



function Invoke-ConflictMarkerScan {

    git -C $RepoRoot grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- .
    
    if ($LASTEXITCODE -eq 1) { return }
    
    if ($LASTEXITCODE -ne 0) { throw "git grep exit code $LASTEXITCODE" }
    
    throw 'unresolved conflict marker found'
    
}



Invoke-Required 'frontend suite' { Invoke-FrontendSuite }

Invoke-Required 'backend suite' { Invoke-BackendSuite }

Invoke-Required 'canonical Trip/demo-isolation regressions' { Invoke-CanonicalTripRegressions }

Invoke-Required 'access/security regression checks' { Invoke-AccessSecurityRegressions }

Invoke-Required 'JavaScript syntax checks' { Invoke-JavaScriptSyntaxChecks }

Invoke-Required 'git diff --check' { Invoke-DiffCheck }

Invoke-Required 'conflict marker scan' { Invoke-ConflictMarkerScan }



if ($SkipOptional) {

    Write-Host 'SKIP optional visual sanity (explicitly skipped)'
    
}

elseif ($env:HACKATHON_VISUAL_CHECK) {

    try {
    
        Push-Location $RepoRoot
        
        try { Invoke-Expression $env:HACKATHON_VISUAL_CHECK }
        
        finally { Pop-Location }
        
        if ($LASTEXITCODE -ne 0) { throw "exit code $LASTEXITCODE" }
        
        Write-Host 'PASS optional visual sanity'
        
    }
    
    catch {
    
        Write-Error "FAIL optional visual sanity: $($_.Exception.Message)"
        
        $script:Failed = $true
        
    }
    
}

else {

    Write-Host 'SKIP optional visual sanity (HACKATHON_VISUAL_CHECK is not configured)'
    
}



if ($script:Failed) {

    exit 1
    
}



Write-Host 'PASS hackathon verification'




































































