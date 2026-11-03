# Sherpa AI chat: false authentication persistence failure

## Current status

Diagnosis confirmed on 3 November 2026. The production AI account is quarantined; the code and user-message repair is prepared locally on `codex/repair-chat-auth-persistence`, but has not been deployed. No production credentials, lease state, IAM, billing, service configuration or workforce records were changed during diagnosis. Credential payloads were not read.

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

## Prepared repair

`auth-state.js` now derives the canonical secret identity from the authenticated `accessSecretVersion` response, then validates the saved receipt against that identity. Both receipts must identify a concrete numeric version of the dedicated secret. Other projects/secrets, aliases, missing identities and extra path segments are rejected. Credential cleanup, lease ownership, quarantine and protection against interrupted refresh remain intact.

The browser maps account invalid/persistence/recovery errors to an administrator-recovery message in English, Romanian and Italian. The generic service-configuration message no longer mentions Gemini.

The original bug was reproduced with a fixture requesting a project ID while returning its canonical project number. That regression failed with `AI_AUTH_PERSIST_FAILED` before the repair and passes afterward. The earlier fixture omitted the accessed version name and returned the requested project ID on save, hiding the production mismatch.

Validation: **51 worker tests and 609 frontend tests passed** locally using Node.js 24.14.1. The worker suite includes the pinned real CLI against an offline provider, with no live model requests. Production/CI use Node.js 22; Linux/container CI and deployment checks remain required before publication. Logs are under ignored `output/chat-diagnosis-20261103/`.

## Production recovery still required

Deploying code alone does not remove the existing quarantine. Follow the [cloud recovery runbook](../sherpa-codex-cloud.md#smoke-and-failure-recovery): stop gateway traffic and drain old worker revisions, establish a fresh dedicated ChatGPT login, then remove only the single account lease after verifying no old execution can refresh credentials. Resume the service and test a synthetic greeting through the authenticated callable. Do not delete account/workforce collections, disable the quarantine protection, reuse the desktop login or roll credentials back to version 1.

The successful save proves this code defect; it does not establish that an old session may safely be reused after quarantine. No recovery or live response is claimed by this report.

## API contract

Google documents the version resource name returned by [accessSecretVersion](https://docs.cloud.google.com/secret-manager/docs/reference/rest/v1/AccessSecretVersionResponse) and the `SecretVersion` receipt returned by [addVersion](https://docs.cloud.google.com/secret-manager/docs/reference/rest/v1/projects.secrets/addVersion). The project-ID/project-number mismatch above was observed directly in this deployment's environment, version metadata and audit record.
