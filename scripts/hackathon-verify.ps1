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
