# Quiet Motion - 2026.10.19

**2026-10-21 incident:** the lazy startup introduced a Planner control-binding
regression. Data still renders, but the date picker, month arrows, filtering and
CSV export do not initialize. See the [health review and targeted repair](../health/2026-10-21-planner-startup.md).

This frontend release preserves Sherpa's existing interface while improving
sign-in feedback, navigation response and the daily sculpture animation. It also
ships the approved FSP Global browser-tab icon and its PNG, ICO and touch-icon
fallbacks. All app and icon cache queries use `2026.10.19`.

## Behavior

- The sign-in action binds before the authenticated workspace is loaded. Popup
  cancellation and connection failures restore a stable, localized button.
- Sculptures follow FSP, heart, summit, globe and infinity, returning to FSP.
  Dragging, queued activation, pause, reduced motion and graphics recovery have
  explicit lifecycle handling.
- Geometry preparation runs in a worker. Original studio reflections are loaded
  from a validated local asset. FSP renders before background preparation of the
  remaining figures; restored sessions initialize only the visible logo.
- Navigation commits immediately, and stale session responses cannot reactivate
  an abandoned workspace.

The detailed evidence and limitations remain in [experience polish](../experience-polish.md)
and [sculpture story](../sculpture-story.md). Local fixtures replace authentication
and data with isolated adapters; they do not verify real OAuth or production
Firestore behavior.

## Release verification

- 535 frontend tests passed with `node --test --test-concurrency=2 tests/*.test.mjs`.
- Six Functions policy checks passed with `npm --prefix functions run check`.
- Release-map verification and Git whitespace checks passed.
- External Chrome rendered sign-in and a restored-session dashboard from the
  final release worktree, using worker geometry and the shipped lighting asset.
  No unexpected external requests, fixture data writes or console errors were
  recorded in those entry checks.
- Sign-in handlers were ready in 57-81 ms in those Chrome observations. The first
  complete 3D frame took 3.79-4.17 seconds after the visible fallback. This is
  slower than the earlier in-app-browser observations: GPU warm-up and browser
  scheduling still vary, and this release does not guarantee an immediate 3D
  first frame on every browser or device.
- A fresh private Firestore snapshot was taken at `2026-10-19T18:03:23.000Z`,
  completed at `18:05:23.073Z`, and verified by JSON parsing, document counts and
  SHA-256. The snapshot contains 18,262 documents across six collections, with
  recursive collection enumeration at a fixed read time and zero database writes.
  Backup data remains outside the repository. Digest:
  `6029bd65d9ec4782ee6b1276a2bdc71ef3b60aa7c9dc5d997d342b2856b2bee8`.

`npm --prefix functions audit --omit=dev` still reports two high and one critical
dependency alerts in `@fastify/busboy`, `@grpc/grpc-js` and `proxy-addr`. These are
pre-existing backend dependencies: the Functions source/lockfile, Firestore rules
and backend configuration are unchanged in this frontend release. The audit is
not clean; remediation remains separate backend work.

## Deployment and rollback

Follow [the deployment flow](../deployment.md): draft PR, check available remote
statuses, merge, wait for GitHub Pages, then verify the served release and perform
read-only production UI checks. No Functions or rules deployment, data migration,
write smoke test or schema change is part of this release.

Rollback is a revert of the release merge followed by GitHub Pages deployment.
