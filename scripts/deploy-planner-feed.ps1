#Requires -Version 7.0
param(
    [string] $ProjectId = 'wps-sherpa-database',
    [string] $Region = 'europe-west8',
    [string] $FirebaseAccount = '',
    [switch] $RotateToken
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$serviceAccountId = 'sherpa-planner-feed'
$serviceAccountEmail = "$serviceAccountId@$ProjectId.iam.gserviceaccount.com"
$secretName = 'SHERPA_PLANNER_FEED_TOKEN'

function Invoke-Gcloud {
    param([string[]] $Arguments, [switch] $AllowMissing, [string] $SecretValue = $null)
    $PSNativeCommandUseErrorActionPreference = $false
    $secretFile = $null
    try {
        $cmdArgs = @($Arguments)
        if (-not [string]::IsNullOrEmpty($SecretValue)) {
            $secretFile = [IO.Path]::GetTempFileName()
            [IO.File]::WriteAllText($secretFile, $SecretValue, [Text.UTF8Encoding]::new($false))
            $cmdArgs += "--data-file=$secretFile"
        }
        $result = @(& gcloud @cmdArgs 2>&1)
        if ($LASTEXITCODE -ne 0) {
            $detail = $result -join "`n"
            $denied = $detail -match '\b(PERMISSION_DENIED|UNAUTHENTICATED|ACCESS_DENIED|BILLING_DISABLED|SERVICE_DISABLED)\b|\b(permission|access)[^\r\n]*denied\b|\bHTTPError\s+(401|403)\b'
            $missing = $detail -match '\bNOT_FOUND\b|\bHTTPError\s+404\b|does not exist|Cannot find'
            if ($AllowMissing -and $missing -and -not $denied) {
                return $null
            }
            throw "gcloud $($Arguments -join ' ') failed (exit $LASTEXITCODE):`n$detail"
        }
        $stdout = @($result | Where-Object { $_ -isnot [Management.Automation.ErrorRecord] })
        return ($stdout -join "`n").Trim()
    } finally {
        if ($secretFile) {
            Remove-Item -LiteralPath $secretFile -Force -ErrorAction SilentlyContinue
        }
    }
}

function New-FeedToken {
    $bytes = [byte[]]::new(32)
    [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $base64Url = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    return "spf_$base64Url"
}

Write-Host "1. Ensuring read-only service account $serviceAccountEmail ..."
$existingSa = Invoke-Gcloud -Arguments @(
    'iam', 'service-accounts', 'describe', $serviceAccountEmail,
    '--project', $ProjectId, '--format=value(email)'
) -AllowMissing
if (-not $existingSa) {
    Invoke-Gcloud -Arguments @(
        'iam', 'service-accounts', 'create', $serviceAccountId,
        '--project', $ProjectId,
        '--display-name', 'Sherpa Monthly Planner Excel feed (read-only)'
    ) | Out-Null
    Write-Host 'Waiting for new service account IAM propagation...'
    Start-Sleep -Seconds 8
}

Invoke-Gcloud -Arguments @(
    'projects', 'add-iam-policy-binding', $ProjectId,
    '--member', "serviceAccount:$serviceAccountEmail",
    '--role', 'roles/datastore.viewer',
    '--condition=None', '--quiet'
) | Out-Null

Write-Host "2. Ensuring Secret Manager secret $secretName ..."
$existingSecret = Invoke-Gcloud -Arguments @(
    'secrets', 'describe', $secretName,
    '--project', $ProjectId, '--format=value(name)'
) -AllowMissing

$generatedToken = $null
if (-not $existingSecret) {
    Invoke-Gcloud -Arguments @(
        'secrets', 'create', $secretName,
        '--project', $ProjectId,
        '--replication-policy=automatic'
    ) | Out-Null
    $generatedToken = New-FeedToken
    Invoke-Gcloud -Arguments @(
        'secrets', 'versions', 'add', $secretName,
        '--project', $ProjectId
    ) -SecretValue $generatedToken | Out-Null
    Write-Host 'Created new feed token in Secret Manager.'
} elseif ($RotateToken) {
    $generatedToken = New-FeedToken
    Invoke-Gcloud -Arguments @(
        'secrets', 'versions', 'add', $secretName,
        '--project', $ProjectId
    ) -SecretValue $generatedToken | Out-Null
    Write-Host 'Added rotated feed token version in Secret Manager.'
} else {
    Write-Host 'Existing feed token secret preserved (pass -RotateToken to generate a new key).'
}

Invoke-Gcloud -Arguments @(
    'secrets', 'add-iam-policy-binding', $secretName,
    '--project', $ProjectId,
    '--member', "serviceAccount:$serviceAccountEmail",
    '--role', 'roles/secretmanager.secretAccessor',
    '--quiet'
) | Out-Null

Write-Host '3. Deploying ONLY functions:plannerFeed (leaving generateSherpaChat untouched) ...'
$firebaseAccountToUse = $FirebaseAccount
if (-not $firebaseAccountToUse) {
    $firebaseAccountToUse = Invoke-Gcloud -Arguments @('auth', 'list', '--filter=status:ACTIVE', '--format=value(account)')
}
$firebaseArgs = @('--yes', 'firebase-tools@15.23.0', 'deploy', '--only', 'functions:plannerFeed', '--project', $ProjectId, '--non-interactive')
if ($firebaseAccountToUse) {
    $firebaseArgs += @('--account', $firebaseAccountToUse)
}

# Populate non-secret Firebase defineString parameters in the deploy folder so
# --non-interactive succeeds without changing generateSherpaChat's live config.
$existingGateway = Invoke-Gcloud -Arguments @(
    'functions', 'describe', 'generateSherpaChat',
    '--gen2', '--region', $Region, '--project', $ProjectId, '--format=json'
) -AllowMissing
$workerUrl = ''
$gatewaySa = "sherpa-ai-gateway@$ProjectId.iam.gserviceaccount.com"
if ($existingGateway) {
    $gwObj = $existingGateway | ConvertFrom-Json
    if ($gwObj.serviceConfig.environmentVariables.SHERPA_CODEX_WORKER_URL) {
        $workerUrl = [string] $gwObj.serviceConfig.environmentVariables.SHERPA_CODEX_WORKER_URL
    }
    if ($gwObj.serviceConfig.serviceAccountEmail) {
        $gatewaySa = [string] $gwObj.serviceConfig.serviceAccountEmail
    }
}

$envLines = @(
    "SHERPA_CODEX_WORKER_URL=$workerUrl",
    "SHERPA_GATEWAY_SERVICE_ACCOUNT=$gatewaySa",
    "SHERPA_PLANNER_FEED_SERVICE_ACCOUNT=$serviceAccountEmail"
)

# firebase-tools spawns .cmd shims via cmd.exe on Windows, which breaks if the
# repository path contains '&' (e.g. "Dev & Projects"). Stage into a clean temp
# folder when needed so deployment works from any local path.
$deployDir = $repoRoot
$stagingRoot = $null
$stagedNodeModules = $null
$tempEnvFile = $null
if ($repoRoot -match '[&^%!]') {
    $stagingRoot = Join-Path ([IO.Path]::GetTempPath()) ("sherpa-planner-feed-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    $stagedFunctions = Join-Path $stagingRoot 'functions'
    New-Item -ItemType Directory -Path $stagedFunctions -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot 'firebase.json') -Destination $stagingRoot
    Copy-Item -LiteralPath (Join-Path $repoRoot '.firebaserc') -Destination $stagingRoot
    Copy-Item -LiteralPath (Join-Path $repoRoot 'firestore.rules') -Destination $stagingRoot
    Get-ChildItem -LiteralPath (Join-Path $repoRoot 'functions') -Force | Where-Object { $_.Name -ne 'node_modules' } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stagedFunctions $_.Name) -Recurse
    }
    $realNodeModules = Join-Path $repoRoot 'functions\node_modules'
    if (Test-Path -LiteralPath $realNodeModules) {
        $stagedNodeModules = Join-Path $stagedFunctions 'node_modules'
        New-Item -ItemType Junction -Path $stagedNodeModules -Target $realNodeModules | Out-Null
    }
    [IO.File]::WriteAllText((Join-Path $stagedFunctions ".env.$ProjectId"), ($envLines -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
    $deployDir = $stagingRoot
} else {
    $envPath = Join-Path $repoRoot "functions\.env.$ProjectId"
    if (-not (Test-Path -LiteralPath $envPath)) {
        $tempEnvFile = $envPath
        [IO.File]::WriteAllText($envPath, ($envLines -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
    }
}

Push-Location $deployDir
try {
    & npx @firebaseArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Firebase deploy failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
    if ($tempEnvFile -and (Test-Path -LiteralPath $tempEnvFile)) {
        Remove-Item -LiteralPath $tempEnvFile -Force
    }
    if ($stagedNodeModules -and (Test-Path -LiteralPath $stagedNodeModules)) {
        [IO.Directory]::Delete($stagedNodeModules)
    }
    if ($stagingRoot -and (Test-Path -LiteralPath $stagingRoot)) {
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force
    }
}

Write-Host '4. Verifying deployed Gen 2 function metadata ...'
$metaJson = Invoke-Gcloud -Arguments @(
    'functions', 'describe', 'plannerFeed',
    '--gen2', '--region', $Region, '--project', $ProjectId, '--format=json'
)
$meta = $metaJson | ConvertFrom-Json
if ($meta.state -ne 'ACTIVE' -or $meta.serviceConfig.serviceAccountEmail -ne $serviceAccountEmail) {
    throw 'Deployed plannerFeed metadata did not match expected ACTIVE read-only configuration.'
}

$feedUrl = $meta.serviceConfig.uri
Write-Host ""
Write-Host "plannerFeed is ACTIVE."
Write-Host "Feed URL (current month CSV): ${feedUrl}?month=current"
if ($generatedToken) {
    Write-Host "Header X-Sherpa-Feed-Key:      $generatedToken"
    Write-Host "Save this key in a secure password manager; it is not written to Git or disk."
}
