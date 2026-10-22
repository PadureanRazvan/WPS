#Requires -Version 7.0
[CmdletBinding()]
param(
    [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
    [string] $ProjectId = 'wps-sherpa-database',
    [switch] $DeviceAuth
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$codexVersion = '0.163.0'
$secretName = 'sherpa-codex-auth'
$localRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'SherpaCloud'
$runtimeRoot = Join-Path $localRoot "codex-$codexVersion"
$loginRoot = Join-Path $localRoot ('login-' + [Guid]::NewGuid().ToString('N'))
$authFile = Join-Path $loginRoot 'auth.json'
$uploaded = $false

function Invoke-Gcloud {
    param([string[]] $Arguments)
    $PSNativeCommandUseErrorActionPreference = $false
    $result = & gcloud @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "gcloud failed ($($Arguments[0])): $($result -join "`n")" }
    return ($result -join "`n")
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

function Remove-OwnedLoginDirectory {
    if (-not (Test-Path -LiteralPath $loginRoot)) { return }
    $resolved = [IO.Path]::GetFullPath($loginRoot)
    $expectedRoot = [IO.Path]::GetFullPath($localRoot).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($expectedRoot, [StringComparison]::OrdinalIgnoreCase) -or
        -not ([IO.Path]::GetFileName($resolved) -match '^login-[a-f0-9]{32}$')) {
        throw 'Refusing to remove an unexpected login directory.'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}

Get-Command gcloud, node, npm -ErrorAction Stop | Out-Null
Assert-ActiveBilling

# Verify that the provisioning step created the intended secret. Never read
# existing cloud credentials or copy the desktop's active Codex auth cache.
Invoke-Gcloud -Arguments @('secrets', 'describe', $secretName, '--project', $ProjectId, '--format=value(name)') | Out-Null

try {
    New-Item -ItemType Directory -Path $runtimeRoot, $loginRoot -Force | Out-Null
    if ($IsWindows) {
        $acl = Get-Acl -LiteralPath $loginRoot
        $acl.SetAccessRuleProtection($true, $false)
        $userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            $userSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
        )
        $acl.AddAccessRule($rule)
        Set-Acl -LiteralPath $loginRoot -AclObject $acl
    } else {
        & chmod 700 $loginRoot
        if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict cloud login directory permissions.' }
    }

    # Local installation leaves the existing desktop/global Codex untouched.
    & npm install --prefix $runtimeRoot --no-audit --no-fund --save-exact "@openai/codex@$codexVersion"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot install the pinned cloud login runtime.' }
    $entrypoint = Join-Path $runtimeRoot 'node_modules/@openai/codex/bin/codex.js'
    if (-not (Test-Path -LiteralPath $entrypoint)) { throw 'Pinned Codex entrypoint is missing.' }
    'cli_auth_credentials_store = "file"' | Set-Content -LiteralPath (Join-Path $loginRoot 'config.toml') -Encoding utf8NoBOM

    Write-Host 'Complete the browser sign-in with the ChatGPT account whose subscription will fund Sherpa.'
    Write-Host 'This creates a dedicated cloud session. No existing desktop sign-in is copied.'

    # A per-process environment prevents changing CODEX_HOME for this shell or
    # the desktop app. No credential values appear in arguments or stdout.
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = (Get-Command node).Source
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.WorkingDirectory = $loginRoot
    $startInfo.Environment['CODEX_HOME'] = $loginRoot
    $startInfo.Environment.Remove('OPENAI_API_KEY') | Out-Null
    $startInfo.Environment.Remove('CODEX_API_KEY') | Out-Null
    $startInfo.Environment.Remove('CODEX_ACCESS_TOKEN') | Out-Null
    $startInfo.ArgumentList.Add($entrypoint)
    $startInfo.ArgumentList.Add('login')
    if ($DeviceAuth) { $startInfo.ArgumentList.Add('--device-auth') }
    $process = [Diagnostics.Process]::Start($startInfo)
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw 'ChatGPT sign-in did not complete. Run this script again when ready.' }

    if (-not (Test-Path -LiteralPath $authFile)) { throw 'Codex did not save a cloud authentication file.' }
    $auth = Get-Content -LiteralPath $authFile -Raw | ConvertFrom-Json -AsHashtable
    if ($auth.auth_mode -ne 'chatgpt' -or
        [string]::IsNullOrWhiteSpace([string] $auth.tokens.access_token) -or
        [string]::IsNullOrWhiteSpace([string] $auth.tokens.refresh_token)) {
        throw 'Expected ChatGPT-managed subscription authentication; upload refused.'
    }

    # The CLI receives only a file path. Never echo or serialize these values
    # to the console, command line, repository, logs, or deployment artifact.
    Invoke-Gcloud -Arguments @('secrets', 'versions', 'add', $secretName, '--data-file', $authFile, '--project', $ProjectId, '--quiet') | Out-Null
    $uploaded = $true
    $auth = $null
    Write-Host 'Dedicated ChatGPT session stored in Google Secret Manager. Rerun scripts/deploy-sherpa-codex-cloud.ps1 to deploy.'
} finally {
    # Once handed off, this session is cloud-owned. Keeping an active second
    # local copy could race the cloud worker when refresh tokens rotate.
    Remove-OwnedLoginDirectory
    if (-not $uploaded) { Write-Host 'Cloud bootstrap did not finish; its temporary local sign-in was removed.' }
}
