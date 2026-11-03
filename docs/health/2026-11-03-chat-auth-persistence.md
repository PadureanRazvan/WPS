# Sherpa AI chat: false authentication persistence failure

## Current status

**Resolved on 4 November 2026 in Bucharest (3 November UTC).** The repaired worker and frontend are deployed, a fresh dedicated cloud login is stored, the quarantined runtime lease was conditionally removed, and gateway access is restored. An authenticated browser test displayed **“Chatul funcționează.”** with matching HTTP 200 responses from the gateway and worker. Rahela's 3D figure remains disabled; its files are preserved.

Diagnosis on 3 November was read-only: no credentials, lease state, IAM, billing, service configuration or workforce records were changed during that phase, and credential payloads were not read. The separate production recovery below was explicitly approved by the user.

## Evidence and cause

The browser's Gemini message is outdated. Production `generateSherpaChat` is an active generation-2 Node.js 22 callable using the private `sherpa-codex-worker`; this path uses the dedicated ChatGPT-managed Codex session.

The worker is configured with `projects/wps-sherpa-database/secrets/sherpa-codex-auth`. Its persistence check compared the returned new-version name with that exact project-ID prefix. Secret Manager returns the canonical project number, `projects/897978989234/secrets/sherpa-codex-auth/versions/2`. The valid response fails that comparison, throwing `AI_AUTH_PERSIST_FAILED` and quarantining the account even though the credentials were saved.

The live metadata establishes this sequence (UTC; add two hours for Bucharest):

| Time | Observed evidence |
| --- | --- |
| 2026-11-02 11:32:15.513498 | Secret Manager audit entry: successful `AddSecretVersion` by the worker service account; resource is version 2 using the numeric project identity; status has no error. |
| 2026-11-02 11:32:16.054360 | Version 2 creation metadata; state remains `ENABLED`. |
| 2026-11-02 11:32:16.247912 | `_server_ai_runtime/codex-account` updated with `recoveryRequired: true`, `failureReason: AI_AUTH_PERSIST_FAILED`, `expiresAt: 0`. |
| 2026-11-02 11:32:16.289539 | Gateway logs `AI_AUTH_PERSIST_FAILED`; the worker returned HTTP 503. |
| 2026-11-03 07:56:03.116998 and 08:20:59.940763 | Subsequent gateway requests log `AI_AUTH_RECOVERY_REQUIRED`; the existing quarantine prevents another inference. |

The worker has both Secret Accessor and Secret Version Adder roles on the dedicated secret. Both cloud services are ready. The worker and gateway revisions are unchanged from their original deployment. This failure predates the 3 November companion UI release.

## Released repair

`auth-state.js` now derives the canonical secret identity from the authenticated `accessSecretVersion` response, then validates the saved receipt against that identity. Both receipts must identify a concrete numeric version of the dedicated secret. Other projects/secrets, aliases, missing identities and extra path segments are rejected. Credential cleanup, lease ownership, quarantine and protection against interrupted refresh remain intact.

The browser maps account invalid/persistence/recovery errors to an administrator-recovery message in English, Romanian and Italian. The generic service-configuration message no longer mentions Gemini.

The original bug was reproduced with a fixture requesting a project ID while returning its canonical project number. That regression failed with `AI_AUTH_PERSIST_FAILED` before the repair and passes afterward. The earlier fixture omitted the accessed version name and returned the requested project ID on save, hiding the production mismatch.

Validation: **51 worker tests, 609 frontend tests and 25 backend tests passed** locally. The worker suite includes the pinned real CLI against an offline provider, with no live model requests. Local Node.js was 24.14.1; [Linux/container CI passed on Node.js 22](https://github.com/PadureanRazvan/WPS/actions/runs/41729074308), including 50 deployment-preflight cases, production-image construction, non-root/certificate checks and the offline suite inside the image. The backend dependency audit still reports one high and two moderate findings in unchanged dependencies; it is not a passing audit. Diagnosis logs are under ignored `output/chat-diagnosis-20261103/`.

## Production recovery completed

The user approved deployment and recovery on 4 November local time and completed the dedicated ChatGPT browser login. Recovery followed the [cloud runbook](../sherpa-codex-cloud.md#smoke-and-failure-recovery):

| UTC time / receipt | Completed action or evidence |
| --- | --- |
| 2026-11-03 22:10:48 | Snapshotted worker IAM and the single lease, then removed only the gateway's worker-invoker binding. No worker requests appeared during the drain interval. The lease remained unchanged with no owner or authentication-in-use marker. |
| 22:14:47 | Cloud Build `212788ac-c065-47d3-a18d-3286fab84cc3` succeeded from ten allowlisted source files, using the existing build identity and bucket. Image digest: `sha256:8a9fcbb15ce2f622cd4062bd9197d829d850a2c6c50d9a92b55d9d3a6f006178`. |
| 22:16:22 | Started fresh dedicated login after 333 seconds of gated traffic, exceeding the 300-second request limit. No desktop authentication cache was copied. |
| 22:16:40 | Worker revision `sherpa-codex-worker-00003-cx7` ready with 100% traffic; existing environment, identities, private access and limits preserved. Old revisions have no traffic. |
| 22:18:44.391958 | Fresh Secret Manager version `3` created and enabled. Bootstrap completed; its temporary local login directory was removed. Credential values were not printed, committed or added to an image. |
| 22:20:38.183808 | Deleted only `_server_ai_runtime/codex-account`, using the exact snapshot update time `2026-11-02T11:32:16.247912Z` as a precondition; verified HTTP 404, then restored the sole gateway invoker. No workforce records or rules changed. |
| 22:21:29 | First greeting was denied by Cloud Run IAM before reaching the worker, shortly after restoring access. The persisted policy and gateway identity matched the baseline; no credentials were used or quarantined by this denial. |
| 22:22:52.354090 | Retry through the existing signed-in Chrome page returned gateway HTTP 200 in 11.025 seconds. Matching worker request at `22:22:52.553271` returned HTTP 200 in 10.802 seconds on the repaired revision. Browser visibly displayed “Chatul funcționează.” |
| 22:23:48 | Lease again absent (HTTP 404) after the successful request; no recovery lock remained. Secret metadata still showed version `3`. |

The transient first-test denial resolved without another policy or code change, consistent with [Google's documented IAM propagation delay](https://docs.cloud.google.com/iam/docs/access-change-propagation). The inferred propagation explanation is separate from the confirmed successful retry. Unauthenticated worker and callable probes still returned HTTP 403 and HTTP 401 (`AUTH_REQUIRED`), respectively.

[PR #35](https://github.com/PadureanRazvan/WPS/pull/35) merged as `b0727e7467e0fcb59b8e4aaee594f0b1578f8800`. GitHub Pages deployment succeeded; 41 live assets matched that commit byte-for-byte, including the preserved character assets. Release: **2026.11.04 — Steady Session**. Recovery receipts and the local screenshot are under ignored `output/chat-recovery-20261104/`.

The controlled greeting requested no data queries or mutations and produced only text. Workforce tool/proposal flows and simultaneous live requests were not retested. Natural credential refresh after this fresh login has not yet occurred; persistence behavior is covered by the regression suite, not claimed as newly observed live. Do not force token expiry or terminate a production request to test it. If recovery is required again, retain the existing quarantine protection, create a fresh dedicated session after draining traffic, and never roll credentials back to an old version.

## API contract

Google documents the version resource name returned by [accessSecretVersion](https://docs.cloud.google.com/secret-manager/docs/reference/rest/v1/AccessSecretVersionResponse) and the `SecretVersion` receipt returned by [addVersion](https://docs.cloud.google.com/secret-manager/docs/reference/rest/v1/projects.secrets/addVersion). The project-ID/project-number mismatch above was observed directly in this deployment's environment, version metadata and audit record.
