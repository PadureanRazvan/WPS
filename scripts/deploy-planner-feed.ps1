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
    param([string[]] $Arguments, [switch] $AllowMissing, [string] $StdinText = $null)
    $stdoutFile = [IO.Path]::GetTempFileName()
    $stderrFile = [IO.Path]::GetTempFileName()
    try {
        if ($null -ne $StdinText) {
            $stdinFile = [IO.Path]::GetTempFileName()
            try {
                [IO.File]::WriteAllText($stdinFile, $StdinText, [Text.UTF8Encoding]::new($false))
                $proc = Start-Process -FilePath 'gcloud' -ArgumentList $Arguments `
                    -RedirectStandardInput $stdinFile -RedirectStandardOutput $stdoutFile `
                    -RedirectStandardError $stderrFile -NoNewWindow -PassThru -Wait
            } finally {
                Remove-Item -LiteralPath $stdinFile -Force -ErrorAction SilentlyContinue
            }
        } else {
            $proc = Start-Process -FilePath 'gcloud' -ArgumentList $Arguments `
                -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile `
                -NoNewWindow -PassThru -Wait
        }
        $stdout = [IO.File]::ReadAllText($stdoutFile)
        $stderr = [IO.File]::ReadAllText($stderrFile)
        if ($proc.ExitCode -ne 0) {
            if ($AllowMissing -and $stderr -match 'NOT_FOUND|does not exist|Cannot find') {
                return $null
            }
            throw "gcloud $($Arguments -join ' ') failed (exit $($proc.ExitCode)):`n$stderr`n$stdout"
        }
        return $stdout.Trim()
    } finally {
        Remove-Item -LiteralPath $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue
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
        '--project', $ProjectId, '--data-file=-'
    ) -StdinText $generatedToken | Out-Null
    Write-Host 'Created new feed token in Secret Manager.'
} elseif ($RotateToken) {
    $generatedToken = New-FeedToken
    Invoke-Gcloud -Arguments @(
        'secrets', 'versions', 'add', $secretName,
        '--project', $ProjectId, '--data-file=-'
    ) -StdinText $generatedToken | Out-Null
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
Push-Location $repoRoot
try {
    & npx @firebaseArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Firebase deploy failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
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
Write-Host "Feed URL (current month CSV): $feedUrl?month=current"
if ($generatedToken) {
    Write-Host "Header X-Sherpa-Feed-Key:      $generatedToken"
    Write-Host "Save this key in a secure password manager; it is not written to Git or disk."
}
