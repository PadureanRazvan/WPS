#Requires -Version 7.0
[CmdletBinding()]
param(
    [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
    [string] $ProjectId = 'wps-sherpa-database',
    [ValidatePattern('^[a-z]+-[a-z]+[0-9]$')]
    [string] $Region = 'europe-west8',
    [switch] $ProvisionOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workerName = 'sherpa-codex-worker'
$secretName = 'sherpa-codex-auth'
$artifactRepo = 'sherpa-ai'
$gatewayAccount = "sherpa-ai-gateway@$ProjectId.iam.gserviceaccount.com"
$workerAccount = "sherpa-codex-worker@$ProjectId.iam.gserviceaccount.com"
$builderAccount = "sherpa-codex-builder@$ProjectId.iam.gserviceaccount.com"
$stagingRoot = $null

function Invoke-Gcloud {
    param([string[]] $Arguments, [switch] $AllowMissing)
    $result = & gcloud @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        if ($AllowMissing -and (($result -join "`n") -match 'NOT_FOUND|not found|does not exist')) { return $null }
        throw "gcloud failed ($($Arguments[0])): $($result -join "`n")"
    }
    return ($result -join "`n")
}

function Ensure-ServiceAccount {
    param([string] $Name, [string] $DisplayName)
    $account = "$Name@$ProjectId.iam.gserviceaccount.com"
    $exists = Invoke-Gcloud -Arguments @('iam', 'service-accounts', 'describe', $account, '--project', $ProjectId, '--format=json') -AllowMissing
    if (-not $exists) {
        Invoke-Gcloud -Arguments @('iam', 'service-accounts', 'create', $Name, '--display-name', $DisplayName, '--project', $ProjectId, '--quiet') | Out-Null
    }
}

function Add-ProjectRole {
    param([string] $Account, [string] $Role)
    Invoke-Gcloud -Arguments @('projects', 'add-iam-policy-binding', $ProjectId, '--member', "serviceAccount:$Account", '--role', $Role, '--condition=None', '--quiet') | Out-Null
}

function Remove-OwnedStagingDirectory {
    param([string] $Path)
    if (-not $Path) { return }
    $resolved = [IO.Path]::GetFullPath($Path)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
        -not ([IO.Path]::GetFileName($resolved) -match '^sherpa-codex-deploy-[a-f0-9]{32}$')) {
        throw 'Refusing to remove an unexpected staging directory.'
    }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}

Get-Command gcloud, node, npm, npx -ErrorAction Stop | Out-Null

# This is the first cloud operation. No APIs, IAM, secrets, builds or services
# are changed until the owner has enabled billing in the Firebase console.
$billing = Invoke-Gcloud -Arguments @('billing', 'projects', 'describe', $ProjectId, '--format=json') | ConvertFrom-Json
if (-not $billing.billingEnabled) {
    throw "Billing is disabled. Enable Blaze and link a billing account at https://console.firebase.google.com/project/$ProjectId/usage/details, then rerun. Nothing was changed."
}

$project = Invoke-Gcloud -Arguments @('projects', 'describe', $ProjectId, '--format=json') | ConvertFrom-Json
$sourceBucket = "$ProjectId-sherpa-build-$($project.projectNumber)"

try {
    Invoke-Gcloud -Arguments @('services', 'enable', 'run.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'secretmanager.googleapis.com', 'cloudfunctions.googleapis.com', 'firestore.googleapis.com', 'iam.googleapis.com', 'iamcredentials.googleapis.com', '--project', $ProjectId, '--quiet') | Out-Null
    Ensure-ServiceAccount 'sherpa-ai-gateway' 'Sherpa authenticated AI gateway'
    Ensure-ServiceAccount 'sherpa-codex-worker' 'Sherpa private Codex runtime'
    Ensure-ServiceAccount 'sherpa-codex-builder' 'Sherpa container build only'

    # Firestore IAM does not provide collection-scoped Admin SDK permissions.
    # Both runtime identities therefore have datastore access; code accesses
    # only the rate-limit / lease collections, never workforce documents.
    Add-ProjectRole $gatewayAccount 'roles/datastore.user'
    Add-ProjectRole $workerAccount 'roles/datastore.user'
    Add-ProjectRole $builderAccount 'roles/logging.logWriter'

    $secret = Invoke-Gcloud -Arguments @('secrets', 'describe', $secretName, '--project', $ProjectId, '--format=json') -AllowMissing
    if (-not $secret) {
        Invoke-Gcloud -Arguments @('secrets', 'create', $secretName, '--replication-policy=user-managed', '--locations', $Region, '--project', $ProjectId, '--quiet') | Out-Null
    }
    foreach ($role in @('roles/secretmanager.secretAccessor', 'roles/secretmanager.secretVersionAdder')) {
        Invoke-Gcloud -Arguments @('secrets', 'add-iam-policy-binding', $secretName, '--member', "serviceAccount:$workerAccount", '--role', $role, '--project', $ProjectId, '--quiet') | Out-Null
    }

    $repository = Invoke-Gcloud -Arguments @('artifacts', 'repositories', 'describe', $artifactRepo, '--location', $Region, '--project', $ProjectId, '--format=json') -AllowMissing
    if (-not $repository) {
        Invoke-Gcloud -Arguments @('artifacts', 'repositories', 'create', $artifactRepo, '--repository-format=docker', '--location', $Region, '--project', $ProjectId, '--quiet') | Out-Null
    }
    Invoke-Gcloud -Arguments @('artifacts', 'repositories', 'add-iam-policy-binding', $artifactRepo, '--location', $Region, '--member', "serviceAccount:$builderAccount", '--role=roles/artifactregistry.writer', '--project', $ProjectId, '--quiet') | Out-Null

    $bucket = Invoke-Gcloud -Arguments @('storage', 'buckets', 'describe', "gs://$sourceBucket", '--project', $ProjectId, '--format=json') -AllowMissing
    if (-not $bucket) {
        Invoke-Gcloud -Arguments @('storage', 'buckets', 'create', "gs://$sourceBucket", '--location', $Region, '--uniform-bucket-level-access', '--public-access-prevention', '--project', $ProjectId, '--quiet') | Out-Null
    }
    Invoke-Gcloud -Arguments @('storage', 'buckets', 'add-iam-policy-binding', "gs://$sourceBucket", '--member', "serviceAccount:$builderAccount", '--role=roles/storage.objectViewer', '--project', $ProjectId, '--quiet') | Out-Null

    if ($ProvisionOnly) {
        Write-Host 'Private infrastructure provisioned. Next run scripts/bootstrap-sherpa-codex-auth.ps1, then rerun this deployment script without -ProvisionOnly.'
        return
    }

    # Read secret metadata only. No credential bytes enter this deploy process.
    $version = [string] (Invoke-Gcloud -Arguments @('secrets', 'versions', 'list', '--secret', $secretName, '--filter=state=ENABLED', '--sort-by=~createTime', '--limit=1', '--format=value(name)', '--project', $ProjectId))
    if (-not $version.Trim()) {
        throw 'ChatGPT cloud login is missing. Run scripts/bootstrap-sherpa-codex-auth.ps1, then rerun deployment.'
    }

    Push-Location $repoRoot
    try {
        & npm --prefix cloud/codex-worker run check
        if ($LASTEXITCODE -ne 0) { throw 'Worker checks failed; no container was built.' }
        & npm --prefix functions run check
        if ($LASTEXITCODE -ne 0) { throw 'Firebase checks failed; no container was built.' }
    } finally { Pop-Location }

    # An allowlisted clean context prevents accidental uploads of this public
    # repository's environment files, credentials, logs, or local dependencies.
    $stagingRoot = Join-Path ([IO.Path]::GetTempPath()) ('sherpa-codex-deploy-' + [Guid]::NewGuid().ToString('N'))
    $stagedWorker = Join-Path $stagingRoot 'cloud/codex-worker'
    New-Item -ItemType Directory -Path $stagedWorker, (Join-Path $stagingRoot 'functions') -Force | Out-Null
    foreach ($name in @('package.json', 'package-lock.json', 'Dockerfile')) {
        Copy-Item -LiteralPath (Join-Path $repoRoot "cloud/codex-worker/$name") -Destination (Join-Path $stagedWorker $name)
    }
    Copy-Item -LiteralPath (Join-Path $repoRoot 'cloud/codex-worker/src') -Destination (Join-Path $stagedWorker 'src') -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot 'functions/sherpa-ai-policy.js') -Destination (Join-Path $stagingRoot 'functions/sherpa-ai-policy.js')
    $forbidden = Get-ChildItem -LiteralPath $stagingRoot -File -Recurse | Where-Object {
        $_.Name -match '^(auth\.json|\.env(?:\..*)?|\.secret.*|.*\.(pem|key))$' -or $_.Extension -notin @('.js', '.json', '')
    }
    if ($forbidden) { throw 'Unexpected files in build context; refusing upload.' }

    $tag = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $image = "$Region-docker.pkg.dev/$ProjectId/$artifactRepo/$workerName`:$tag"
    $buildConfig = @{
        steps = @(@{ name = 'gcr.io/cloud-builders/docker'; args = @('build', '-f', 'cloud/codex-worker/Dockerfile', '-t', $image, '.') })
        images = @($image)
        options = @{ logging = 'CLOUD_LOGGING_ONLY' }
        timeout = '1200s'
    }
    $buildConfigPath = Join-Path $stagingRoot 'cloudbuild.json'
    $buildConfig | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $buildConfigPath -Encoding utf8NoBOM
    Invoke-Gcloud -Arguments @('builds', 'submit', $stagingRoot, '--config', $buildConfigPath, '--gcs-source-staging-dir', "gs://$sourceBucket/sources", '--service-account', "projects/$ProjectId/serviceAccounts/$builderAccount", '--region', $Region, '--project', $ProjectId, '--quiet') | Out-Null

    $existingService = Invoke-Gcloud -Arguments @('run', 'services', 'describe', $workerName, '--region', $Region, '--project', $ProjectId, '--format=json') -AllowMissing
    $initialAudience = if ($existingService) { ($existingService | ConvertFrom-Json).status.url } else { 'https://sherpa-initialization.invalid' }
    $workerEnvironment = "SHERPA_CODEX_AUTH_SECRET=projects/$ProjectId/secrets/$secretName,SHERPA_CALLER_SERVICE_ACCOUNT=$gatewayAccount,SHERPA_WORKER_AUDIENCE=$initialAudience,GOOGLE_CLOUD_PROJECT=$ProjectId"
    Invoke-Gcloud -Arguments @('run', 'deploy', $workerName, '--image', $image, '--region', $Region, '--project', $ProjectId, '--service-account', $workerAccount, '--no-allow-unauthenticated', '--invoker-iam-check', '--ingress=all', '--timeout=300s', '--concurrency=1', '--max-instances=1', '--min-instances=0', '--memory=1Gi', '--cpu=1', '--cpu-throttling', '--set-env-vars', $workerEnvironment, '--quiet') | Out-Null
    $service = Invoke-Gcloud -Arguments @('run', 'services', 'describe', $workerName, '--region', $Region, '--project', $ProjectId, '--format=json') | ConvertFrom-Json
    $workerUrl = [string] $service.status.url
    if ($workerUrl -notmatch '^https://[a-z0-9.-]+\.run\.app$') { throw 'Cloud Run returned an unexpected service URL.' }
    if ($initialAudience -ne $workerUrl) {
        Invoke-Gcloud -Arguments @('run', 'services', 'update', $workerName, '--region', $Region, '--project', $ProjectId, '--update-env-vars', "SHERPA_WORKER_AUDIENCE=$workerUrl", '--quiet') | Out-Null
    }

    # Preserve unrelated service IAM roles and the etag, but replace invokers.
    # Project-level administrators retain their own inherited IAM permissions.
    $iam = Invoke-Gcloud -Arguments @('run', 'services', 'get-iam-policy', $workerName, '--region', $Region, '--project', $ProjectId, '--format=json') | ConvertFrom-Json -AsHashtable
    $iam['bindings'] = @($iam['bindings'] | Where-Object { $_ -and $_['role'] -ne 'roles/run.invoker' }) + @(@{ role = 'roles/run.invoker'; members = @("serviceAccount:$gatewayAccount") })
    $iamFile = Join-Path $stagingRoot 'worker-iam.json'
    $iam | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $iamFile -Encoding utf8NoBOM
    Invoke-Gcloud -Arguments @('run', 'services', 'set-iam-policy', $workerName, $iamFile, '--region', $Region, '--project', $ProjectId, '--quiet') | Out-Null

    # Non-secret deployment parameters only; existing unrelated dotenv values
    # are preserved. The repository already ignores functions/.env.*.
    $envPath = Join-Path $repoRoot "functions/.env.$ProjectId"
    $envLines = if (Test-Path -LiteralPath $envPath) { @(Get-Content -LiteralPath $envPath) } else { @() }
    $envLines = @($envLines | Where-Object { $_ -notmatch '^SHERPA_(CODEX_WORKER_URL|GATEWAY_SERVICE_ACCOUNT)=' })
    $envLines += "SHERPA_CODEX_WORKER_URL=$workerUrl", "SHERPA_GATEWAY_SERVICE_ACCOUNT=$gatewayAccount"
    $envLines | Set-Content -LiteralPath $envPath -Encoding utf8NoBOM
    Push-Location $repoRoot
    try {
        & npx --yes firebase-tools@15.23.0 deploy --only functions:generateSherpaChat --project $ProjectId --non-interactive
        if ($LASTEXITCODE -ne 0) { throw 'Firebase deployment failed. Private worker may be deployed; fix the reported deploy error and rerun.' }
    } finally { Pop-Location }

    $finalIam = Invoke-Gcloud -Arguments @('run', 'services', 'get-iam-policy', $workerName, '--region', $Region, '--project', $ProjectId, '--format=json') | ConvertFrom-Json -AsHashtable
    $invokers = @($finalIam['bindings'] | Where-Object { $_ -and $_['role'] -eq 'roles/run.invoker' } | ForEach-Object { $_['members'] })
    if ($invokers.Count -ne 1 -or $invokers[0] -ne "serviceAccount:$gatewayAccount") { throw 'Post-deployment IAM verification failed.' }
    Write-Host "Cloud worker deployed: $workerUrl"
    Write-Host 'Cloud infrastructure is deployed; live ChatGPT authentication, Luna Max output, browser tool rounds and confirmation behavior still require smoke verification.'
} finally {
    Remove-OwnedStagingDirectory $stagingRoot
}
