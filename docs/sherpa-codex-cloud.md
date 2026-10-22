# Sherpa subscription-backed cloud AI

Sherpa can run its AI without the owner's PC: the browser calls Firebase, which invokes a private Cloud Run worker. The worker runs pinned Codex CLI `0.163.0` as `gpt-6-luna` with reasoning effort `max`, using a dedicated ChatGPT-managed login. OpenAI API billing is not used by this path; the account's Codex allowance and Google Cloud hosting charges still apply.

```text
GitHub Pages browser
  -> generateSherpaChat: Firebase identity, allowlist, payload and rate limits
  -> private Cloud Run sherpa-codex-worker: Google service identity validation
  -> serialized Codex CLI run: dedicated ChatGPT-managed authentication
  -> existing browser workforce queries or answer / action proposal
```

## Scope and current evidence

- Source preparation and local fixture tests do not prove a deployed service or a working subscription session. Record actual deployment and smoke results below before describing AI as live.
- On 2026-10-22, project billing initially reported disabled. After Blaze setup it reported `billingEnabled: true`, but the linked **Firebase Payment** account reported `open: false`; paid-service APIs still rejected requests with `BILLING_DISABLED`. Project linkage alone does not establish an active payment account.
- OpenAI documents ChatGPT-managed authentication for trusted private automation, including ephemeral runners. It does not document a Firebase-specific connector or explicitly endorse serving unrelated users from one personal Pro account. Keep this a private, authenticated Sherpa workflow; broader shared-service entitlement remains unconfirmed.
- WPS source is public. No ChatGPT auth, refresh state, service-account keys, secret material, or account-auth workflow belongs in that repository or its public CI. The cloud build uses an allowlisted code-only staging folder; direct and CI Docker builds use a root `.dockerignore` that allows only worker manifests/source and the shared AI policy.
- This implementation uses the CLI rather than exposing experimental app-server/WebSocket transport.

## What Razvan must provide

1. In [Firebase usage and billing](https://console.firebase.google.com/project/wps-sherpa-database/usage/details), use Blaze with an **open, active** Google Cloud billing account. Reopen the currently closed account or link an active account through Google Cloud Billing. The assistant does not need card details. The deployment identity needs permission to deploy resources and manage the required service identities/IAM.
2. Complete one interactive ChatGPT sign-in from the bootstrap script below. Use the account whose subscription should fund Sherpa. A dedicated session is created; the desktop app's current session is not copied.

After bootstrap and deployment, the local PC can be offline. A revoked/expired refresh session may still require a new interactive sign-in. No promise of permanent unattended authentication is made.

## Local checks

Run from the repository root with PowerShell 7, Node.js 22, Google Cloud CLI and npm available:

```powershell
npm --prefix cloud/codex-worker ci
npm --prefix cloud/codex-worker run check
npm --prefix functions ci
npm --prefix functions run check
node --test --test-concurrency=2 tests/*.test.mjs
node scripts/refresh-release-assets.mjs --check
pwsh -NoProfile -File scripts/test-sherpa-firebase-deploy.ps1
git diff --check
```

Review the worker's real CLI flags and isolated configuration. Fixture tests alone cannot establish Linux container sandbox compatibility, absence of built-in agent tools in a live model session, account access to Luna Max, or correct behavior across credential refresh.

## Deployment

These scripts make real Google Cloud changes when run. They stop before any mutation if billing is disabled. They never activate billing or select a payment account.

```powershell
# 1. Provision dedicated accounts, private secret and build resources.
pwsh -File scripts/deploy-sherpa-codex-cloud.ps1 -ProvisionOnly

# 2. Complete a NEW ChatGPT login and seed the cloud-only auth secret.
pwsh -File scripts/bootstrap-sherpa-codex-auth.ps1

# Device-code alternative if browser callback login is unavailable:
# pwsh -File scripts/bootstrap-sherpa-codex-auth.ps1 -DeviceAuth

# 3. Build in Cloud Build, deploy private Cloud Run, then Firebase callable.
pwsh -File scripts/deploy-sherpa-codex-cloud.ps1
```

The deployer must also be signed into Firebase CLI with access to this project. If Firebase deployment reports an authentication or IAM error, resolve that exact error and rerun; never place a credential into source. Firebase's own function-build identity also needs its documented build permissions; organization restrictions can require an administrator to grant them. The custom worker builder receives only source-bucket read, Artifact Registry write, and logging permissions.

The deployment script writes only non-secret `SHERPA_CODEX_WORKER_URL` and `SHERPA_GATEWAY_SERVICE_ACCOUNT` into ignored `functions/.env.wps-sherpa-database`, preserving unrelated variables. It deploys only `generateSherpaChat`, never Firestore rules or workforce data. Release the browser timeout change using the normal reviewed GitHub Pages deployment flow; model/tool/action-response shape remains compatible with the existing chat loop.

Both entrypoints read project billing and the linked account's `open` status before provisioning or login. A closed account stops immediately. Missing status or a denied lookup is reported as **unknown**, with the original error; the scripts do not grant billing permissions or change payment accounts. The Firebase CLI must also have project access; `firebase login:list` alone does not prove that access, so verify with `firebase projects:list --non-interactive` using the pinned CLI.

Firebase CLI 15.23.0 can report a cleanup-policy error after a successful first function deployment. Recovery accepts only that exact error, the target function's success marker, and a live active function matching the expected runtime, identity, timeout and worker URL. Existing cleanup policies and explicit opt-outs remain unchanged. The script adds a verified seven-day policy only when `gcf-artifacts` was confirmed absent before this deployment and is now present without a policy. An existing repository with no policy is left unchanged for an explicit retention decision. Other failures retain their original output; the deployment command never uses broad `--force`.

Cloud Run is deployed with 300-second request timeout, concurrency 1, maximum instances 1, minimum instances 0, 1 CPU and 1 GiB memory. Limits contain ordinary hosting use; they are not hard spend caps, and maximum instance limits can temporarily be exceeded. The distributed lease, rather than instance count alone, prevents parallel use of one refresh-token stream. The initial private revision has a nonmatching placeholder audience until the real service URL is known; the gateway is deployed only after the correct audience and invoker policy are applied.

## Identities and stored state

| Identity / resource | Purpose and permissions |
| --- | --- |
| `sherpa-ai-gateway@wps-sherpa-database.iam.gserviceaccount.com` | Callable runtime; Firestore rate limits and invocation of the private worker. No ChatGPT secret access. |
| `sherpa-codex-worker@wps-sherpa-database.iam.gserviceaccount.com` | Worker runtime; read/add versions on only `sherpa-codex-auth`; Firestore distributed lease. |
| `sherpa-codex-builder@wps-sherpa-database.iam.gserviceaccount.com` | Build-only identity; source-bucket read, repository writer and log writer. No ChatGPT secret access. |
| `sherpa-codex-auth` | Dedicated ChatGPT auth bundle in Secret Manager, replicated in `europe-west8`. Never included in an image or environment variable. |
| `_server_ai_runtime/codex-account` | Lease owner, expiry and heartbeat metadata. No authentication tokens or conversations. Browser access denied by default Firestore rules. |
| `_server_ai_rate_limits/{uid}` | Existing per-user request counts; browser access denied. |

Firestore Admin SDK IAM is database-wide, not collection-scoped. The gateway and worker therefore have `roles/datastore.user`; application code confines their database operations to server metadata. This limitation is explicit rather than claiming collection-level IAM isolation.

The worker acquires the distributed lease before reading the current secret version. It creates a writable temporary Codex home, lets Codex refresh its own session, writes refreshed credentials back to Secret Manager before releasing the lease, and deletes the temporary directory. A static environment variable or read-only secret mount would lose refreshed state on replacement and is deliberately not used. Do not let another PC/job reuse this dedicated auth bundle.

Never log auth content, input conversations, model prompts, workforce tool results or raw upstream errors. Only bounded reason codes and correlation metadata should reach logs. Review old Secret Manager versions periodically; the worker's least-privilege identity cannot destroy or disable versions.

## Smoke and failure recovery

Before declaring the backend live:

1. Confirm unauthenticated worker requests fail, and tokens for another caller/audience fail.
2. Run a synthetic greeting through an authenticated Firebase callable and confirm actual Luna Max inference. Check that no API key fallback was used.
3. Exercise a workforce query through the browser's existing read-only tool loop, then a proposal without clicking **Apply changes**. Confirm no automatic Firestore write.
4. Confirm two normal simultaneous requests remain serialized. Lost-lease and forced-termination recovery are covered by offline fixtures; do not deliberately interrupt production refresh or quarantine the live account for a smoke test.
5. Confirm refreshed auth persists to Secret Manager and a replacement instance uses the latest version. Do not force token expiry or expose token values to test this.
6. Verify the browser's callable URL, deployed gateway configuration, Cloud Run request correlation and response. The complete request path must be Firebase -> Cloud Run, with no localhost dependency; physically powering off the PC is not required to establish that path.

If refresh is revoked or expires, pause access to the AI callable, ensure no run still holds the lease, then rerun the bootstrap script to create a fresh dedicated cloud session. Do not re-upload an old local seed. If persistence fails, fail the request and repair secret access before resuming.

A crashed worker can leave an `authInUse` / quarantined lease because its refreshed token state may not have reached Secret Manager. Forced CLI termination on timeout, cancellation, tool-policy violation, or abnormal signal exit also requires quarantine: termination can happen after remote token rotation but before the local auth file is written. The worker persists any observed refreshed auth, then returns `AI_AUTH_RECOVERY_REQUIRED` and prevents reuse even when the remaining auth file looks valid or unchanged. A cancelled request or deployment `SIGTERM` can therefore require a fresh dedicated login.

Uploading a new login alone does not clear that condition. Recovery requires an operator to stop gateway traffic, stop or drain every old worker revision and confirm no in-flight run can still refresh or write the auth bundle, then create a fresh dedicated login. Only after those checks may the operator remove the single `_server_ai_runtime/codex-account` lease document and resume the service. Never delete the whole collection or any workforce data. This recovery is not automated by the bootstrap or deployment script.

For rollback, restore the last known-good gateway revision/configuration, or disable the callable when no prior working AI backend exists. Keep the worker private. Do not restore old credential versions after refresh rotation. Planner/Auth/Firestore can continue independently of AI; do not modify user collections as part of rollback.

## Deployment record

Status on 2026-10-22: **partially provisioned; AI not deployed**. The three dedicated service accounts exist, and API-enablement/IAM steps completed before Secret Manager rejected the provisioning run with `BILLING_DISABLED`. The linked billing account is closed (`open: false`) despite the project's `billingEnabled: true`. No dedicated ChatGPT auth upload, worker build/deployment or callable deployment completed. Firebase CLI project access was verified for the deployment account. Resume only after an open billing account is linked; do not treat repeated billing-propagation retries as a repair for a closed account.

Frontend release **2026.10.22.2 — Luna Relay**, build **B318A322**, is prepared, and Linux/container CI passed for release commit `1aeabb1`. Production inference, the dedicated cloud session, refresh persistence and browser AI smoke remain unverified. Record the image digest, Cloud Run revision, function revision and actual smoke results after execution; neither source preparation nor CI proves working production chat.

Local validation recorded on 2026-10-22: **48 worker tests on Node.js 22, 584 frontend tests and 25 Firebase backend tests passed**. The local browser security smoke also passed. Both PowerShell scripts parse; **32 deployment preflight/cleanup regression cases** use mocked cloud/Firebase commands and one harmless local child process. They cover disabled/open/closed/unknown billing, native-command error settings, exact cleanup-only recovery, existing retention preservation and original-error retention. Earlier provision-only and full deployment fixtures passed, including fresh/empty service IAM, source staging that excludes `auth.json` and `.env`, exact private-worker invoker and preservation of unrelated dotenv settings. These are local validation results, separate from the partial provisioning record above.

The `Sherpa cloud checks` GitHub Actions workflow runs only for `codex/*` pushes and PR heads. It uses Node.js 22 on Linux, checks worker/Firebase/browser suites and release assets, builds the actual production image, checks its non-root identity and system certificates, then mounts the offline worker tests read-only and runs them inside the image with external networking disabled. The pinned real Codex fixture uses only its local mock Responses server. No ChatGPT login, API key, Google credentials, deployment permission or live model call belongs in this workflow. Action versions are pinned to official v7 commit SHAs verified on 2026-10-22.

The real-CLI mock capture verifies that Luna Max advertises zero host tools. A pinned minimal `src/model-catalog.json` prevents model metadata from re-enabling tool capabilities; the runner also isolates host instructions and configuration. [Linux/container CI passed for implementation commit `eff82bd`](https://github.com/PadureanRazvan/WPS/actions/runs/39837825799): all suites, the production image build, non-root/certificate checks and offline worker tests inside the image with external networking disabled. Neither offline CLI capture nor container success proves subscription entitlement, a successful live refresh, or working production chat.

## Official references

- [OpenAI: managed ChatGPT auth in trusted automation](https://learn.chatgpt.com/docs/auth/ci-cd-auth)
- [OpenAI: non-interactive Codex](https://learn.chatgpt.com/docs/non-interactive-mode)
- [OpenAI: GPT-6 Luna and reasoning effort](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Firebase: deployment requires Blaze](https://firebase.google.com/docs/functions/get-started)
- [Firebase: function runtime configuration](https://firebase.google.com/docs/functions/manage-functions)
- [Google: Cloud Run container contract and ephemeral filesystem](https://docs.cloud.google.com/run/docs/container-contract)
- [Google: Cloud Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Google: maximum instances and temporary excess](https://docs.cloud.google.com/run/docs/configuring/max-instances)
- [Google: Cloud Build user-managed service accounts](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)
