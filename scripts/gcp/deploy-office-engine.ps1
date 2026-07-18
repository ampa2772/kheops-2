[CmdletBinding()]
param(
    [switch]$GuardOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$expectedAccount = 'adja060672@gmail.com'
$project = 'kheops-2'
$projectNumber = '16107185088'
$region = 'europe-west1'
$service = 'kheops-2-office'
$appHost = "kheops-2-backend-$projectNumber.$region.run.app"
$officeUrl = "https://$service-$projectNumber.$region.run.app"
$baseImage = 'mirror.gcr.io/collabora/code@sha256:df33af88c59e26b7335ea98d91e65f1edf13f33369ce6115941b8d59d3409cb5'
$repository = "$region-docker.pkg.dev/$project/cloud-run-source-deploy"
$imageTag = Get-Date -Format 'yyyyMMdd-HHmmss'
$image = "$repository/kheops-2-office-theme-sync:$imageTag"
$buildContext = Join-Path $PSScriptRoot 'office-engine'

if (-not $env:CLOUDSDK_CONFIG) {
    if (-not $env:APPDATA) {
        throw 'APPDATA introuvable ; impossible de sélectionner la configuration gcloud Windows.'
    }
    $env:CLOUDSDK_CONFIG = Join-Path $env:APPDATA 'gcloud'
}

$gcloud = (Get-Command gcloud.cmd -ErrorAction Stop).Source
$strictErrorAction = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$activeAccount = (& $gcloud auth list --filter=status:ACTIVE --format='value(account)' --quiet 2>$null | Select-Object -First 1).Trim()
$activeProject = (& $gcloud config get-value project --quiet 2>$null).Trim()
$ErrorActionPreference = $strictErrorAction
if ($activeAccount -ne $expectedAccount) {
    throw "Compte Google Cloud incorrect : $activeAccount (attendu : $expectedAccount)."
}
if ($activeProject -ne $project) {
    throw "Projet Google Cloud incorrect : $activeProject (attendu : $project)."
}

Write-Host "Compte       : $activeAccount"
Write-Host "Projet       : $activeProject ($projectNumber)"
Write-Host "Service      : $service ($region)"
Write-Host "Image de base : $baseImage"
Write-Host "Image corrigée : $image"

if ($GuardOnly) {
    Write-Host 'Garde-fous validés. Aucun déploiement effectué.'
    exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $buildContext 'Dockerfile') -PathType Leaf)) {
    throw "Contexte de construction du moteur introuvable : $buildContext"
}

& $gcloud builds submit $buildContext `
    --project $project `
    --region $region `
    --tag $image `
    --quiet

if ($LASTEXITCODE -ne 0) {
    throw "La construction du moteur bureautique corrigé s'est arrêtée avec le code $LASTEXITCODE."
}

# Ce mot de passe protège uniquement la console d'administration Collabora.
# Il est renouvelé à chaque déploiement et n'est ni utilisé ni exposé par Kheops.
$adminPassword = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$domainRegex = [regex]::Escape($appHost)
$extraParams = '--o:ssl.enable=false --o:ssl.termination=true --o:security.seccomp=false --o:security.capabilities=false --o:net.proto=IPv4 --o:user_interface.mode=tabbed --o:user_interface.use_integration_theme=true --o:welcome.enable=false --o:logging.level=warning'
$envVars = "^|^domain=$domainRegex|aliasgroup1=https://${appHost}:443|username=kheops-admin|password=$adminPassword|dictionaries=fr_FR en_GB en_US|extra_params=$extraParams"

& $gcloud run deploy $service `
    --project $project `
    --region $region `
    --platform managed `
    --image $image `
    --allow-unauthenticated `
    --cpu 2 `
    --memory 4Gi `
    --timeout 3600 `
    --concurrency 10 `
    --min-instances 0 `
    --max-instances 1 `
    --execution-environment gen2 `
    --session-affinity `
    --set-env-vars $envVars

if ($LASTEXITCODE -ne 0) {
    throw "Le déploiement du moteur bureautique s'est arrêté avec le code $LASTEXITCODE."
}

$response = Invoke-WebRequest -UseBasicParsing -Uri "$officeUrl/hosting/discovery" -TimeoutSec 90
if ($response.StatusCode -ne 200 -or $response.Content -notmatch '<wopi-discovery>') {
    throw "Le contrôle Collabora a échoué sur $officeUrl/hosting/discovery."
}

Write-Host "Moteur bureautique disponible : $officeUrl"
