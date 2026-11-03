# Steady Session — 2026.11.04

Repair the false account lock that followed Sherpa's first observed cloud credential refresh. Secret Manager returned the numeric project identity after a project-ID request; comparing that successful save receipt with the requested alias incorrectly triggered `AI_AUTH_PERSIST_FAILED` and quarantined all later AI requests.

The worker now compares concrete version receipts against the canonical secret identity returned by the authenticated read. The existing account lease, failure quarantine, temporary credential cleanup and interrupted-refresh protection remain in place. The browser's English, Romanian and Italian messages identify administrator account recovery instead of suggesting a Gemini configuration issue. Rahela's figure remains disabled, with the compact chat launcher unchanged.

## Validation

The project-ID/project-number regression failed before the repair and passes afterward. Local validation passed 51 worker tests, 609 frontend tests and 25 backend tests. Worker coverage includes wrong-secret/project receipts, malformed version names, credential persistence after model errors, interrupted execution and the pinned CLI against an offline provider. [Node.js 22 Linux/container CI passed](https://github.com/PadureanRazvan/WPS/actions/runs/41729074308), including production-image, non-root/certificate, offline-container and 50 deployment-preflight checks. The unchanged backend dependency audit reports one high and two moderate findings.

## Coordinated recovery

The user approved deployment and cloud-login recovery on 4 November local time. Worker IAM and account-lease metadata were snapshotted; gateway invocation was gated and prior requests drained before the fresh dedicated login. The repaired image was built from ten allowlisted files using the existing build identity, then deployed as private revision `sherpa-codex-worker-00003-cx7` with the existing identities, environment and limits. Secret version `3` holds the fresh session. After verifying those preconditions, only the quarantined account lease was removed using its exact update-time precondition; the original sole gateway-invoker binding was restored. No workforce records or Firestore rules changed.

[PR #35](https://github.com/PadureanRazvan/WPS/pull/35) merged as `b0727e7`; Pages deployment passed, and 41 live assets matched the merge byte-for-byte. An authenticated synthetic greeting displayed **“Chatul funcționează.”**; gateway and worker both returned HTTP 200 at `2026-11-03T22:22:52Z`. The lease was absent afterward. An earlier immediate test was denied during the restored-permission interval and succeeded on retry without further changes. Public unauthenticated access remains denied.

Natural refresh of the new session has not yet been observed; the canonical-identity persistence boundary is regression-tested. Workforce query/proposal flows and simultaneous live calls were not retested during this recovery.

Deployment receipts remain under ignored `output/chat-recovery-20261104/`. The [incident report](../health/2026-11-03-chat-auth-persistence.md) records the original evidence and the recovery outcome separately. Do not roll the credential secret back to an old version. If recovery fails, retain quarantine and keep the worker private; frontend rollback alone cannot repair the cloud account.
