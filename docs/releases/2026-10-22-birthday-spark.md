# Birthday Spark — 2026.10.22

Replace the chat circle with the portrait-inspired Sherpa companion and add a plum-and-gold birthday hat for Rahela's 23 October birthday. The hat follows the head during waves, celebrations, dragging and throws. Both 3D views and the transparent fallback include the hat. It is visible immediately and has no automatic expiry.

The companion stays mostly upright during dragging, tumbles after a throw, reacts to walls and shaking, and can minimize to a small dock. Speech clouds are limited to one every three minutes. Opening chat hides the companion until chat closes. Meet Sherpa provides animations, a turntable, pause and the account-owned **Ragdoll on throws** switch.

## Persistence and rollout

`companion_preferences/{Firebase Auth UID}` stores only `ragdollEnabled`. Verified approved accounts can read/write their own boolean; cross-account access, collection listing, deletion, extra fields and non-booleans are denied. No workforce data migration is needed. Save failures restore the confirmed setting, and stale session callbacks are ignored.

Deploy the updated Firestore rules before the frontend. The active rules were fetched before deployment and matched `origin/main`; the only rules addition is the companion preference collection. Use the existing authenticated Google Cloud identity with the [Firebase Rules API](https://firebase.google.com/docs/reference/rules/rest/v1/projects.releases/patch) if the Firebase CLI is not signed in. Retain the previous release reference and verify the newly active rules source after publication. This rollout does not deploy Functions or change secrets, billing, AI behavior, existing workforce access or records.

The release starts from `ac81682` (current production), preserving the Planner startup fix and backend dependency security fixes. Unrelated runtime edits are only release-query refreshes. The original development checkout is preserved separately.

## Verification

- 584 frontend tests passed, including account isolation, persistence state, throw recovery, reduced motion and Planner startup.
- 21 backend checks passed; `npm audit --omit=dev` reported zero vulnerabilities. Backend source and lockfile are unchanged.
- Release map verified 103 local modules. Review the staged whitespace check before publishing.
- Twelve Firebase Rules API cases passed: owner read/create/update; denial of cross-account read/write, wrong types, extra/missing fields, deletion, listing, signed-out and unverified access. These evaluate supplied contexts and resource data; they do not perform document writes. The rules compiled without issues.
- Local browser review covers the hat's full framing, celebration, generated PNG, miniature, chat hiding and return. Production smoke uses one external Chrome tab and makes no workforce writes.
- The 21 October backup manifest and SHA-256 were reverified: 18,335 documents, six collections, `81256e31759d3c0f578692ce0e9863a23ad005749808c0462f6ffabaea6927a8`. Backup contents remain private outside Git.

Release logs, rules references and publication receipt are kept in ignored `output/birthday-release/`. Production confirmation requires the GitHub Pages deployment result, live asset/source comparison and browser smoke; local tests alone do not establish deployment.

## Rollback

Revert the release merge and let GitHub Pages redeploy the prior frontend. The additive preference rules can remain without affecting the old frontend. For a complete rollback, repoint `projects/wps-sherpa-database/releases/cloud.firestore` to the previous ruleset recorded in the release receipt, after verifying no later rules release has occurred. Leave preference documents intact for restoration; do not delete data or restore a workforce backup for this visual change. The previous production frontend contains the Planner repair and must remain the rollback baseline.
