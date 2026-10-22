#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Load only helper definitions, never the deployment script's top-level work.
$source = Join-Path $PSScriptRoot 'deploy-sherpa-codex-cloud.ps1'
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref] $null, [ref] $parseErrors)
if ($parseErrors) { throw ($parseErrors -join "`n") }
foreach ($name in @('Invoke-Gcloud', 'Invoke-FirebaseCli', 'Complete-FirebaseDeployment', 'Assert-ActiveBilling', 'Get-LatestCodexAuthVersion')) {
    $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if (-not $definition) { throw "Missing helper: $name" }
    . ([scriptblock]::Create($definition.Extent.Text))
}

$ProjectId = 'wps-sherpa-database'
$secretName = 'sherpa-codex-auth'
$Region = 'europe-west8'
$gatewayAccount = "sherpa-ai-gateway@$ProjectId.iam.gserviceaccount.com"
$workerUrl = 'https://sherpa-fixture.a.run.app'
$cleanupError = "Error: Functions successfully deployed but could not set up cleanup policy in location $Region. Pass the --force option to automatically set up a cleanup policy or run 'firebase functions:artifacts:setpolicy' to manually set up a cleanup policy."
$success = "+ functions[generateSherpaChat($Region)] Successful create operation."
$cleanupOnly = "$success`n$cleanupError"
$script:expected = [Collections.Generic.Queue[hashtable]]::new()
$script:passed = 0

function Expect-Command {
    param([string] $Name, [string[]] $Arguments, [string] $Output, [int] $ExitCode = 0)
    $script:expected.Enqueue(@{ Name = $Name; Arguments = $Arguments; Output = $Output; ExitCode = $ExitCode })
}
function Invoke-MockedCommand {
    param([string] $Name, [string[]] $Arguments)
    if (-not $script:expected.Count) { throw "Unexpected $Name call: $($Arguments -join ' ')" }
    $next = $script:expected.Dequeue()
    if ($next.Name -ne $Name -or ($next.Arguments -join "`0") -ne ($Arguments -join "`0")) {
        throw "Unexpected command: $Name $($Arguments -join ' ')"
    }
    $global:LASTEXITCODE = $next.ExitCode
    return $next.Output
}
function gcloud { Invoke-MockedCommand -Name 'gcloud' -Arguments $args }
function npx { Invoke-MockedCommand -Name 'npx' -Arguments $args }

function New-FunctionMetadata {
    param([string] $State = 'ACTIVE')
    return @{
        name = "projects/$ProjectId/locations/$Region/functions/generateSherpaChat"
        state = $State; environment = 'GEN_2'; buildConfig = @{ runtime = 'nodejs22' }
        serviceConfig = @{ serviceAccountEmail = $gatewayAccount; timeoutSeconds = 300; environmentVariables = @{ SHERPA_CODEX_WORKER_URL = $workerUrl } }
    } | ConvertTo-Json -Depth 8 -Compress
}
function Expect-Function { param([string] $Metadata = (New-FunctionMetadata))
    Expect-Command 'gcloud' @('functions', 'describe', 'generateSherpaChat', '--gen2', '--region', $Region, '--project', $ProjectId, '--format=json') $Metadata
}
function Expect-Repository { param([string] $Metadata, [int] $ExitCode = 0)
    Expect-Command 'gcloud' @('artifacts', 'repositories', 'describe', 'gcf-artifacts', '--location', $Region, '--project', $ProjectId, '--format=json') $Metadata $ExitCode
}
function Expect-Cleanup { param([string] $Output = 'Configured cleanup policy.', [int] $ExitCode = 0)
    Expect-Command 'npx' @('--yes', 'firebase-tools@15.23.0', 'functions:artifacts:setpolicy', '--project', $ProjectId, '--location', $Region, '--days', '7', '--force', '--non-interactive') $Output $ExitCode
}
function Test-Case {
    param([string] $Name, [scriptblock] $Body, [string] $ExpectedError = '')
    $caught = $null
    try { & $Body } catch { $caught = $_.Exception.Message }
    if ($ExpectedError) {
        if (-not $caught -or -not $caught.Contains($ExpectedError)) { throw "$Name did not preserve expected error: $ExpectedError. Actual: $caught" }
    } elseif ($caught) { throw "$Name failed: $caught" }
    if ($script:expected.Count) { throw "$Name left $($script:expected.Count) expected commands unused." }
    $script:passed++
    Write-Host "PASS $Name"
}

$emptyRepository = '{"name":"projects/wps-sherpa-database/locations/europe-west8/repositories/gcf-artifacts"}'
$sevenDayPolicy = '{"cleanupPolicies":{"firebase-functions-cleanup":{"action":"DELETE","condition":{"olderThan":"604800s","tagState":"ANY"}}},"cleanupPolicyDryRun":false}'

$runDescribe = @('run', 'services', 'describe', 'sherpa-codex-worker', '--region', $Region, '--project', $ProjectId, '--format=json')
$runMissing = 'ERROR: (gcloud.run.services.describe) Cannot find service [sherpa-codex-worker]'
Test-Case 'exact missing Cloud Run service permits first deployment' {
    Expect-Command 'gcloud' $runDescribe $runMissing 1
    if ($null -ne (Invoke-Gcloud -Arguments $runDescribe -AllowMissing)) { throw 'Missing service was not returned as null.' }
}
Test-Case 'missing Cloud Run service still throws without AllowMissing' {
    Expect-Command 'gcloud' $runDescribe $runMissing 1
    Invoke-Gcloud -Arguments $runDescribe
} $runMissing
Test-Case 'missing-service message for another service is rejected' {
    Expect-Command 'gcloud' $runDescribe ($runMissing.Replace('sherpa-codex-worker]', 'another-service]')) 1
    Invoke-Gcloud -Arguments $runDescribe -AllowMissing
} 'another-service'
Test-Case 'missing-service text is accepted only by run services describe' {
    $otherCommand = @('run', 'services', 'get-iam-policy', 'sherpa-codex-worker')
    Expect-Command 'gcloud' $otherCommand $runMissing 1
    Invoke-Gcloud -Arguments $otherCommand -AllowMissing
} $runMissing
Test-Case 'explicit NOT_FOUND remains a missing resource' {
    Expect-Command 'gcloud' @('secrets', 'describe', $secretName) 'ERROR: (gcloud.secrets.describe) NOT_FOUND: Secret does not exist.' 1
    if ($null -ne (Invoke-Gcloud -Arguments @('secrets', 'describe', $secretName) -AllowMissing)) { throw 'NOT_FOUND was not returned as null.' }
}
Test-Case 'storage HTTPError 404 remains a missing resource' {
    Expect-Command 'gcloud' @('storage', 'buckets', 'describe', 'gs://fixture') 'ERROR: (gcloud.storage.buckets.describe) HTTPError 404: The specified bucket does not exist.' 1
    if ($null -ne (Invoke-Gcloud -Arguments @('storage', 'buckets', 'describe', 'gs://fixture') -AllowMissing)) { throw 'HTTP 404 was not returned as null.' }
}
foreach ($denial in @(
    'PERMISSION_DENIED: The resource was not found or you do not have permission.',
    'UNAUTHENTICATED: NOT_FOUND was returned before authentication failed.',
    'BILLING_DISABLED: NOT_FOUND metadata is unavailable.',
    'HTTPError 403: NOT_FOUND or access denied.',
    "$runMissing`nPermission denied on resource."
)) {
    Test-Case "permission/auth/billing failure is never treated as missing: $denial" {
        Expect-Command 'gcloud' $runDescribe $denial 1
        Invoke-Gcloud -Arguments $runDescribe -AllowMissing
    } $denial
}
Test-Case 'generic not-found wording does not hide unrelated command failure' {
    Expect-Command 'gcloud' $runDescribe 'ERROR: credentials helper not found.' 1
    Invoke-Gcloud -Arguments $runDescribe -AllowMissing
} 'credentials helper not found'

# Exercise both entrypoints' billing guard independently, without importing any
# top-level deployment/login statements or accessing the operator's credentials.
foreach ($filename in @('deploy-sherpa-codex-cloud.ps1', 'bootstrap-sherpa-codex-auth.ps1')) {
    $billingAst = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $filename), [ref] $null, [ref] $parseErrors)
    if ($parseErrors) { throw ($parseErrors -join "`n") }
    $definition = $billingAst.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Assert-ActiveBilling' }, $true)
    . ([scriptblock]::Create($definition.Extent.Text))
    Test-Case "$filename disabled project stops after one read" {
        Expect-Command 'gcloud' @('billing', 'projects', 'describe', $ProjectId, '--format=json') '{"billingEnabled":false}'
        Assert-ActiveBilling
    } 'Billing is disabled.'
    Test-Case "$filename open account passes" {
        Expect-Command 'gcloud' @('billing', 'projects', 'describe', $ProjectId, '--format=json') '{"billingEnabled":true,"billingAccountName":"billingAccounts/ABCDEF-123456-ABC123"}'
        Expect-Command 'gcloud' @('billing', 'accounts', 'describe', 'ABCDEF-123456-ABC123', '--format=json') '{"open":true}'
        Assert-ActiveBilling
    }
    Test-Case "$filename closed account stops" {
        Expect-Command 'gcloud' @('billing', 'projects', 'describe', $ProjectId, '--format=json') '{"billingEnabled":true,"billingAccountName":"billingAccounts/ABCDEF-123456-ABC123"}'
        Expect-Command 'gcloud' @('billing', 'accounts', 'describe', 'ABCDEF-123456-ABC123', '--format=json') '{"open":false}'
        Assert-ActiveBilling
    } 'is closed (open:false)'
    Test-Case "$filename permission denial is unknown" {
        Expect-Command 'gcloud' @('billing', 'projects', 'describe', $ProjectId, '--format=json') '{"billingEnabled":true,"billingAccountName":"billingAccounts/ABCDEF-123456-ABC123"}'
        Expect-Command 'gcloud' @('billing', 'accounts', 'describe', 'ABCDEF-123456-ABC123', '--format=json') 'PERMISSION_DENIED: billing.accounts.get denied' 1
        Assert-ActiveBilling
    } 'status unknown'
    Test-Case "$filename absent account status is unknown" {
        Expect-Command 'gcloud' @('billing', 'projects', 'describe', $ProjectId, '--format=json') '{"billingEnabled":true,"billingAccountName":"billingAccounts/ABCDEF-123456-ABC123"}'
        Expect-Command 'gcloud' @('billing', 'accounts', 'describe', 'ABCDEF-123456-ABC123', '--format=json') '{}'
        Assert-ActiveBilling
    } 'status unknown'
    Test-Case "$filename absent linked account is unknown" {
        Expect-Command 'gcloud' @('billing', 'projects', 'describe', $ProjectId, '--format=json') '{"billingEnabled":true}'
        Assert-ActiveBilling
    } 'status unknown'
}

Test-Case 'normal success makes no recovery calls' {
    Complete-FirebaseDeployment 0 'Deploy complete!' $workerUrl
}
Test-Case 'auth version lookup requires positional secret and metadata-only output' {
    Expect-Command 'gcloud' @('secrets', 'versions', 'list', $secretName, '--filter=state=ENABLED', '--sort-by=~createTime', '--limit=1', '--format=value(name)', '--project', $ProjectId) '1'
    if ((Get-LatestCodexAuthVersion) -ne '1') { throw 'Latest enabled version metadata was not returned.' }
}
Test-Case 'missing auth version stays empty without accessing payload' {
    Expect-Command 'gcloud' @('secrets', 'versions', 'list', $secretName, '--filter=state=ENABLED', '--sort-by=~createTime', '--limit=1', '--format=value(name)', '--project', $ProjectId) ''
    if (-not [string]::IsNullOrEmpty([string] (Get-LatestCodexAuthVersion))) { throw 'Missing auth version did not remain empty.' }
}
Test-Case 'native exit is captured when native error preference is enabled' {
    $PSNativeCommandUseErrorActionPreference = $true
    $pwshPath = (Get-Process -Id $PID).Path
    function npx {
        & $pwshPath -NoProfile -NonInteractive -Command '[Console]::Error.WriteLine("fixture stderr"); exit 1'
        $global:LASTEXITCODE = $LASTEXITCODE
    }
    $result = Invoke-FirebaseCli -Arguments @('fixture-only')
    if ($result.ExitCode -ne 1 -or -not $result.Output.Contains('fixture stderr')) {
        throw 'Native child exit and original stderr were not preserved.'
    }
    if (-not $PSNativeCommandUseErrorActionPreference) { throw 'The helper changed its caller preference.' }
}
Test-Case 'authentication failure remains unchanged' {
    Complete-FirebaseDeployment 1 'Error: Failed to authenticate, have you run firebase login?' $workerUrl
} 'Error: Failed to authenticate, have you run firebase login?'
Test-Case 'cleanup error without target success is rejected' {
    Complete-FirebaseDeployment 1 $cleanupError $workerUrl
} $cleanupError
Test-Case 'other error alongside cleanup is preserved' {
    Complete-FirebaseDeployment 1 "$cleanupOnly`nError: IAM denied." $workerUrl
} 'Error: IAM denied.'
Test-Case 'function error summary prevents recovery' {
    Complete-FirebaseDeployment 1 "$cleanupOnly`nFunctions deploy had errors with the following functions:" $workerUrl
} 'Functions deploy had errors'
Test-Case 'other region is not recovered' {
    Complete-FirebaseDeployment 1 ($cleanupOnly.Replace('europe-west8', 'us-central1')) $workerUrl
} 'us-central1'
Test-Case 'inactive function prevents policy changes' {
    Expect-Function (New-FunctionMetadata -State 'FAILED')
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl
} 'does not match the expected active Sherpa gateway configuration'
Test-Case 'missing function fields fail closed' {
    Expect-Function '{}'
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl
} 'does not match the expected active Sherpa gateway configuration'
Test-Case 'missing repository is not created' {
    Expect-Function
    Expect-Repository 'NOT_FOUND: repository does not exist' 1
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl
} 'NOT_FOUND: repository does not exist'
Test-Case 'first deployment configures seven days once' {
    Expect-Function
    Expect-Repository $emptyRepository
    Expect-Cleanup
    Expect-Repository $sevenDayPolicy
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl -ArtifactRepositoryWasAbsent $true
}
Test-Case 'existing repository without policy keeps historical images untouched' {
    Expect-Function
    Expect-Repository $emptyRepository
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl
} 'repository already existed or its prior state is unknown'
Test-Case 'explicit existing repository state cannot enable cleanup' {
    Expect-Function
    Expect-Repository $emptyRepository
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl -ArtifactRepositoryWasAbsent $false
} 'repository already existed or its prior state is unknown'
Test-Case 'existing custom policy is preserved' {
    Expect-Function
    Expect-Repository '{"cleanupPolicies":{"keep-releases":{"action":"KEEP"}}}'
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl
}
Test-Case 'existing Firebase policy is preserved' {
    Expect-Function
    Expect-Repository '{"cleanupPolicies":{"firebase-functions-cleanup":{"action":"DELETE","condition":{"olderThan":"2592000s"}}}}'
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl
}
Test-Case 'explicit cleanup opt-out is preserved' {
    Expect-Function
    Expect-Repository '{"labels":{"firebase-functions-cleanup-opted-out":"true"}}'
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl
}
Test-Case 'policy command failure is preserved' {
    Expect-Function
    Expect-Repository $emptyRepository
    Expect-Cleanup 'Error: permission denied setting cleanup.' 1
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl -ArtifactRepositoryWasAbsent $true
} 'Error: permission denied setting cleanup.'
Test-Case 'unverified policy fails closed' {
    Expect-Function
    Expect-Repository $emptyRepository
    Expect-Cleanup
    Expect-Repository '{}'
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl -ArtifactRepositoryWasAbsent $true
} 'seven-day function artifact cleanup policy could not be verified'
Test-Case 'dry-run policy is not accepted as active' {
    Expect-Function
    Expect-Repository $emptyRepository
    Expect-Cleanup
    Expect-Repository ($sevenDayPolicy.Replace('false', 'true'))
    Complete-FirebaseDeployment 1 $cleanupOnly $workerUrl -ArtifactRepositoryWasAbsent $true
} 'seven-day function artifact cleanup policy could not be verified'
Test-Case 'ANSI update success is recognized' {
    Expect-Function
    Expect-Repository '{"cleanupPolicies":{"keep-releases":{"action":"KEEP"}}}'
    $colored = "$([char]27)[32m$($success.Replace('create', 'update'))$([char]27)[0m`n$cleanupError"
    Complete-FirebaseDeployment 1 $colored $workerUrl
}
foreach ($filename in @('deploy-sherpa-codex-cloud.ps1', 'bootstrap-sherpa-codex-auth.ps1')) {
    $streamAst = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $filename), [ref] $null, [ref] $parseErrors)
    if ($parseErrors) { throw ($parseErrors -join "`n") }
    $definition = $streamAst.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-Gcloud' }, $true)
    . ([scriptblock]::Create($definition.Extent.Text))
    Test-Case "$filename returns success JSON without stderr diagnostics" {
        $pwshPath = (Get-Process -Id $PID).Path
        function gcloud {
            & $pwshPath -NoProfile -NonInteractive -Command '[Console]::Error.WriteLine("Encryption: Google-managed key"); [Console]::Error.WriteLine("Repository Size: 104.344MB"); [Console]::Out.WriteLine(''{"fixture":true}''); exit 0'
        }
        $json = Invoke-Gcloud -Arguments @('fixture-only')
        $value = $json | ConvertFrom-Json
        if ($value.fixture -ne $true -or $json.Contains('Encryption:') -or $json.Contains('Repository Size:')) {
            throw 'Successful native stderr contaminated JSON stdout.'
        }
    }
    Test-Case "$filename preserves both native streams on permission failure" {
        $pwshPath = (Get-Process -Id $PID).Path
        function gcloud {
            & $pwshPath -NoProfile -NonInteractive -Command '[Console]::Out.WriteLine("partial fixture stdout"); [Console]::Error.WriteLine("PERMISSION_DENIED: fixture denied"); exit 1'
        }
        try { Invoke-Gcloud -Arguments @('fixture-only') } catch {
            if (-not $_.Exception.Message.Contains('partial fixture stdout')) { throw 'Failure stdout was discarded.' }
            throw
        }
    } 'PERMISSION_DENIED: fixture denied'
}
Write-Host "$script:passed deployment preflight and cleanup regression cases passed; all cloud and Firebase commands were mocked."
# Expected native failures leave LASTEXITCODE nonzero. GitHub's PowerShell
# wrapper propagates it unless this successfully completed suite exits explicitly.
exit 0
