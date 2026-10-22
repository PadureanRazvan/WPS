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
    $PSNativeCommandUseErrorActionPreference = $false
    $result = @(& gcloud @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $detail = $result -join "`n"
        # Authorization failures sometimes mention a resource that may not
        # exist. They must never be converted into permission to create it.
        $denied = $detail -match '\b(PERMISSION_DENIED|UNAUTHENTICATED|ACCESS_DENIED|BILLING_DISABLED|SERVICE_DISABLED)\b|\b(permission|access)[^\r\n]*denied\b|\b(not authorized|not authenticated|does not have permission|do not have permission)\b|\bHTTPError\s+(401|403)\b'
        $missing = $detail -match '\bNOT_FOUND\b|\bHTTPError\s+404\b'
        if ($Arguments.Count -ge 4 -and $Arguments[0] -eq 'run' -and $Arguments[1] -eq 'services' -and $Arguments[2] -eq 'describe') {
            # Cloud Run's describe command emits this text instead of NOT_FOUND.
            $runMissing = [regex]::Escape("ERROR: (gcloud.run.services.describe) Cannot find service [$($Arguments[3])]")
            $missing = $missing -or $detail -match "(?m)^\s*$runMissing\.?\s*$"
        }
        if ($AllowMissing -and $missing -and -not $denied) { return $null }
        throw "gcloud failed ($($Arguments[0])): $detail"
    }
    # Native stderr remains an ErrorRecord after redirection. Successful gcloud
    # commands can print diagnostics there even with --format=json; return only
    # stdout while retaining both streams above for every nonzero failure.
    $stdout = @($result | Where-Object { $_ -isnot [Management.Automation.ErrorRecord] })
    return ($stdout -join "`n")
}

function Assert-ActiveBilling {
    # Project linkage can say enabled while the linked payment account is closed.
    # These two metadata reads must precede provisioning or interactive login.
    $billing = Invoke-Gcloud -Arguments @('billing', 'projects', 'describe', $ProjectId, '--format=json') | ConvertFrom-Json -AsHashtable
    if ($billing['billingEnabled'] -ne $true) {
        throw "Billing is disabled. Enable Blaze and link an open billing account at https://console.firebase.google.com/project/$ProjectId/usage/details. No provisioning or login was started."
    }
    $accountName = [string] $billing['billingAccountName']
    if ($accountName -notmatch '^billingAccounts/[A-Za-z0-9-]+$') {
        throw 'The linked billing account could not be identified (status unknown). No provisioning or login was started.'
    }
    try {
        $account = Invoke-Gcloud -Arguments @('billing', 'accounts', 'describe', $accountName.Substring('billingAccounts/'.Length), '--format=json') | ConvertFrom-Json -AsHashtable
    } catch {
        throw "Cannot verify whether $accountName is open (status unknown). An account owner must verify access/status; no permissions were changed and no provisioning or login was started. Original error: $($_.Exception.Message)"
    }
    if ($account['open'] -eq $false) {
        throw "The linked billing account $accountName is closed (open:false), even though project billingEnabled is true. Reopen it or link an active account in Google Cloud Billing. No provisioning or login was started."
    }
    if ($account['open'] -ne $true) {
        throw "The linked billing account $accountName did not return an open status (status unknown). No provisioning or login was started."
    }
}

function Get-LatestCodexAuthVersion {
    # `versions list` takes the secret as a positional argument, not --secret.
    # Only version metadata is returned; this never accesses credential bytes.
    return Invoke-Gcloud -Arguments @('secrets', 'versions', 'list', $secretName, '--filter=state=ENABLED', '--sort-by=~createTime', '--limit=1', '--format=value(name)', '--project', $ProjectId)
}

function Invoke-FirebaseCli {
    param([string[]] $Arguments)
    # Capture the CLI exit code even when the caller enables native exceptions.
    $PSNativeCommandUseErrorActionPreference = $false
    $lines = [Collections.Generic.List[string]]::new()
    & npx --yes firebase-tools@15.23.0 @Arguments 2>&1 | ForEach-Object {
        $line = [string] $_
        $lines.Add($line)
        Write-Host $line
    }
    return @{ ExitCode = $LASTEXITCODE; Output = $lines -join "`n" }
}

function Complete-FirebaseDeployment {
    param([int] $ExitCode, [string] $Output, [string] $WorkerUrl, [bool] $ArtifactRepositoryWasAbsent = $false)
    if ($ExitCode -eq 0) { return }

    # Firebase CLI 15.23.0 prompts for artifact retention after deploying.
    # Its cleanup error can also mask failed function operations, so require
    # the exact sole error, the target's success marker, and live configuration.
    $plain = [regex]::Replace($Output, '\x1B\[[0-?]*[ -/]*[@-~]', '')
    $cleanupError = "Error: Functions successfully deployed but could not set up cleanup policy in location $Region. Pass the --force option to automatically set up a cleanup policy or run 'firebase functions:artifacts:setpolicy' to manually set up a cleanup policy."
    $errors = @($plain -split '\r?\n' | Where-Object { $_.TrimStart() -match '^Error:' })
    $target = [regex]::Escape("functions[generateSherpaChat($Region)]")
    $success = $plain -match "(?m)^\s*[^\r\n]*$target Successful (create|update) operation\.\s*$"
    if ($errors.Count -ne 1 -or $errors[0].Trim() -ne $cleanupError -or -not $success -or
        $plain -match 'Functions deploy had errors|Unable to set the invoker|Deployment canceled|Function deployment failed') {
        throw "Firebase deployment failed (exit $ExitCode). Private worker may be deployed; the original output follows:`n$Output"
    }

    try {
        $deployed = Invoke-Gcloud -Arguments @('functions', 'describe', 'generateSherpaChat', '--gen2', '--region', $Region, '--project', $ProjectId, '--format=json') | ConvertFrom-Json -AsHashtable
        $serviceConfig = $deployed['serviceConfig']
        if ($deployed['name'] -ne "projects/$ProjectId/locations/$Region/functions/generateSherpaChat" -or
            $deployed['state'] -ne 'ACTIVE' -or $deployed['environment'] -ne 'GEN_2' -or
            -not $deployed['buildConfig'] -or $deployed['buildConfig']['runtime'] -ne 'nodejs22' -or
            -not $serviceConfig -or $serviceConfig['serviceAccountEmail'] -ne $gatewayAccount -or
            $serviceConfig['timeoutSeconds'] -ne 300 -or -not $serviceConfig['environmentVariables'] -or
            $serviceConfig['environmentVariables']['SHERPA_CODEX_WORKER_URL'] -ne $WorkerUrl) {
            throw 'The deployed callable does not match the expected active Sherpa gateway configuration.'
        }

        # Inspect only repository metadata. Respect every existing policy and
        # Firebase's explicit opt-out label; never overwrite either choice.
        $repository = Invoke-Gcloud -Arguments @('artifacts', 'repositories', 'describe', 'gcf-artifacts', '--location', $Region, '--project', $ProjectId, '--format=json') | ConvertFrom-Json -AsHashtable
        if (($repository['cleanupPolicies'] -and $repository['cleanupPolicies'].Count -gt 0) -or
            ($repository['labels'] -and $repository['labels']['firebase-functions-cleanup-opted-out'] -eq 'true')) {
            Write-Host 'Callable deployment verified. Existing function artifact retention policy or opt-out preserved.'
            return
        }
        if (-not $ArtifactRepositoryWasAbsent) {
            throw 'The function artifact repository already existed or its prior state is unknown. Its images and retention are unchanged; choose an explicit retention policy before retrying.'
        }

        $cleanup = Invoke-FirebaseCli -Arguments @('functions:artifacts:setpolicy', '--project', $ProjectId, '--location', $Region, '--days', '7', '--force', '--non-interactive')
        if ($cleanup.ExitCode -ne 0) { throw "Artifact cleanup configuration failed (exit $($cleanup.ExitCode)):`n$($cleanup.Output)" }
        $verified = Invoke-Gcloud -Arguments @('artifacts', 'repositories', 'describe', 'gcf-artifacts', '--location', $Region, '--project', $ProjectId, '--format=json') | ConvertFrom-Json -AsHashtable
        $policy = if ($verified['cleanupPolicies']) { $verified['cleanupPolicies']['firebase-functions-cleanup'] } else { $null }
        if (-not $policy -or $policy['action'] -ne 'DELETE' -or -not $policy['condition'] -or
            $policy['condition']['olderThan'] -ne '604800s' -or $policy['condition']['tagState'] -ne 'ANY' -or
            $verified['cleanupPolicyDryRun'] -eq $true) {
            throw 'The seven-day function artifact cleanup policy could not be verified.'
        }
        Write-Host 'Callable deployment verified; seven-day function artifact cleanup policy configured.'
    } catch {
        throw "Firebase cleanup recovery failed: $($_.Exception.Message)`nOriginal Firebase deployment output:`n$Output"
    }
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
Assert-ActiveBilling

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
    $version = [string] (Get-LatestCodexAuthVersion)
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
    Invoke-Gcloud -Arguments @('run', 'deploy', $workerName, '--image', $image, '--region', $Region, '--project', $ProjectId, '--service-account', $workerAccount, '--no-allow-unauthenticated', '--invoker-iam-check', '--ingress=all', '--timeout=300s', '--concurrency=1', '--max=1', '--min=0', '--max-instances=1', '--min-instances=0', '--memory=1Gi', '--cpu=1', '--cpu-throttling', '--set-env-vars', $workerEnvironment, '--quiet') | Out-Null
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
    # Automatic seven-day cleanup is allowed only for a repository created by
    # this first Firebase deployment, never an existing repository's images.
    $firebaseArtifactRepository = Invoke-Gcloud -Arguments @('artifacts', 'repositories', 'describe', 'gcf-artifacts', '--location', $Region, '--project', $ProjectId, '--format=json') -AllowMissing
    $firebaseArtifactRepositoryWasAbsent = -not $firebaseArtifactRepository
    Push-Location $repoRoot
    try {
        $deployment = Invoke-FirebaseCli -Arguments @('deploy', '--only', 'functions:generateSherpaChat', '--project', $ProjectId, '--non-interactive')
        Complete-FirebaseDeployment -ExitCode $deployment.ExitCode -Output $deployment.Output -WorkerUrl $workerUrl -ArtifactRepositoryWasAbsent $firebaseArtifactRepositoryWasAbsent
    } finally { Pop-Location }

    $finalIam = Invoke-Gcloud -Arguments @('run', 'services', 'get-iam-policy', $workerName, '--region', $Region, '--project', $ProjectId, '--format=json') | ConvertFrom-Json -AsHashtable
    $invokers = @($finalIam['bindings'] | Where-Object { $_ -and $_['role'] -eq 'roles/run.invoker' } | ForEach-Object { $_['members'] })
    if ($invokers.Count -ne 1 -or $invokers[0] -ne "serviceAccount:$gatewayAccount") { throw 'Post-deployment IAM verification failed.' }
    Write-Host "Cloud worker deployed: $workerUrl"
    Write-Host 'Cloud infrastructure is deployed; live ChatGPT authentication, Luna Max output, browser tool rounds and confirmation behavior still require smoke verification.'
} finally {
    Remove-OwnedStagingDirectory $stagingRoot
}
