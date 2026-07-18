[CmdletBinding()]
param(
    [switch]$GuardOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if (-not $env:CLOUDSDK_CONFIG) {
    if (-not $env:APPDATA) {
        throw 'APPDATA introuvable ; impossible de selectionner la configuration gcloud Windows.'
    }
    $cloudSdkConfig = Join-Path $env:APPDATA 'gcloud'
    if (-not (Test-Path -LiteralPath $cloudSdkConfig -PathType Container)) {
        throw "Configuration gcloud Windows introuvable : $cloudSdkConfig"
    }
    $env:CLOUDSDK_CONFIG = $cloudSdkConfig
}

$candidates = @(
    (Join-Path $env:ProgramFiles 'Git\bin\bash.exe')
)
if (${env:ProgramFiles(x86)}) {
    $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Git\bin\bash.exe')
}

$gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
if ($gitCommand) {
    $gitRoot = Split-Path (Split-Path $gitCommand.Source -Parent) -Parent
    $candidates += (Join-Path $gitRoot 'bin\bash.exe')
}

$gitBash = $candidates |
    Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
    Select-Object -Unique -First 1
if (-not $gitBash) {
    throw 'Git Bash introuvable. Installer Git for Windows ou corriger son chemin.'
}

Write-Host "Git Bash       : $gitBash"
Write-Host "Dossier projet : $repoRoot"
Write-Host "Config gcloud  : $env:CLOUDSDK_CONFIG"

if ($GuardOnly) {
    $env:KHEOPS_GUARD_ONLY = 'true'
    Write-Host 'Mode           : verification des garde-fous uniquement (lecture seule)'
}

$previousChereInvoking = $env:CHERE_INVOKING
$env:CHERE_INVOKING = '1'
Push-Location -LiteralPath $repoRoot
try {
    & $gitBash --login -c 'exec bash scripts/gcp/deploy.sh'
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
    $env:CHERE_INVOKING = $previousChereInvoking
}
if ($exitCode -ne 0) {
    throw "Le deploiement s'est arrete avec le code $exitCode."
}
