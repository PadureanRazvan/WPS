# Steady Session — 2026.11.04

Repair the false account lock that followed Sherpa's first observed cloud credential refresh. Secret Manager returned the numeric project identity after a project-ID request; comparing that successful save receipt with the requested alias incorrectly triggered `AI_AUTH_PERSIST_FAILED` and quarantined all later AI requests.

The worker now compares concrete version receipts against the canonical secret identity returned by the authenticated read. The existing account lease, failure quarantine, temporary credential cleanup and interrupted-refresh protection remain in place. The browser's English, Romanian and Italian messages identify administrator account recovery instead of suggesting a Gemini configuration issue. Rahela's figure remains disabled, with the compact chat launcher unchanged.

## Validation

The project-ID/project-number regression failed before the repair and passes afterward. Local validation passed 51 worker tests and 609 frontend tests. Worker coverage includes wrong-secret/project receipts, malformed version names, credential persistence after model errors, interrupted execution and the pinned CLI against an offline provider. Linux/container CI, the production image build and live recovery verification must also pass before the incident is described as resolved.

## Coordinated recovery

The user approved deployment and cloud-login recovery on 4 November. Keep the existing quarantine while preparing the release. Snapshot the worker IAM and account lease metadata, block gateway invocation of the worker, and drain prior requests before creating a fresh dedicated ChatGPT session. Build only the allowlisted worker sources and shared policy with the existing build identity. Deploy the repaired image privately while preserving the existing limits and service identities. After verifying the new session, revision and absence of old work, remove only the exact quarantined account lease, restore the gateway invoker binding and run an authenticated synthetic greeting. No workforce data or Firestore rules migration is needed.

Deployment receipts remain under ignored `output/chat-recovery-20261104/`. The [incident report](../health/2026-11-03-chat-auth-persistence.md) records the original evidence and the recovery outcome separately. Do not roll the credential secret back to an old version. If recovery fails, retain quarantine and keep the worker private; frontend rollback alone cannot repair the cloud account.
