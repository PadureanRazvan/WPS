# Everyday Sherpa — 2026.10.25

Remove Rahela's birthday cap from the 3D model and regenerated fallback portrait. Remove the Meet Sherpa header button, M and right-click shortcuts, dialog, studio module and styles. Chat, dragging, waving, minimizing and existing saved ragdoll preferences remain available. The portrait now carries the release cache key so returning browsers fetch the updated image.

## Verification and rollout

- 608 frontend tests and 25 Firebase callable tests passed.
- Six offline browser scenarios passed with no page errors: desktop drag/recovery, keyboard chat activation and focus, logout, mobile touch/minimize/chat, reduced motion and graphics fallback. Visual review confirmed the bareheaded portrait and simpler chat header.
- Release-map verification covers 104 local modules; unrelated runtime edits only refresh cache keys.
- `npm --prefix functions audit --omit=dev` reported one existing high-severity `body-parser` advisory (GHSA-27r3-jxmh-p828). Functions dependencies are unchanged by this frontend release; the audit is not recorded as passing. Backend remediation and deployment remain separate work.
- The 21 October Firestore backup was reverified against its manifest SHA-256 (18,335 documents, six collections). This frontend-only change performs no data migration, backend deployment or production writes.

Merge only after GitHub checks pass. Then confirm Pages publishes the merge commit and compare the served index, companion model, chat module, stylesheet and portrait with this checkout. Use the existing single-tab production smoke; record any authentication limitation separately. Local evidence is under ignored `output/everyday-sherpa/`.

## Rollback

Revert the merge commit and republish GitHub Pages. Keep Firestore records and the current AI backend unchanged.
