# Steady Compass — 2026.10.21

Restore Planner date selection, month navigation, search and CSV export after
the authenticated workspace loads lazily. Quiet Motion imported Planner after
`DOMContentLoaded`, so its old event listener never attached those controls.
The runtime now initializes them explicitly after calendar dependencies are
ready, once per page, including across subsequent sign-ins.

The approved interface, sculpture mechanics, animation and browser icon assets
are preserved. Production behavior changes only in Planner initialization;
other runtime edits refresh the release queries and version identity. Functions,
Firestore rules, calculations and persistence commands are unchanged. No data
migration or restore belongs to this release.

## Verification

The [incident review](../health/2026-10-21-planner-startup.md) records the original
failure, before/after regression tests, synthetic browser checks and backup.
The final release candidate passed 540 frontend tests, six Functions checks,
release-map verification (97 local modules) and whitespace checks. A source
comparison confirmed all other runtime diffs are release-query refreshes, and
design, icons, backend and rules are unchanged. Existing backend dependency
alerts remain separate work, as documented in that review.

Live acceptance uses the existing external Chrome session and actual downloads:

1. Reload after the deployed files match this commit, and confirm the new
   version/build and populated Planner date range.
2. Navigate previous → current → next → current month. Verify each header and
   table range, not just the click or successful app-init log.
3. Download previous- and current-month CSVs. Verify filenames, parsed dates,
   record counts and exported hours against the displayed Planner. Keep all
   production row data private and outside Git.
4. Confirm filtering and Reports refresh still work; capture relevant browser
   errors, if any, without performing business-data writes.
5. Verify the approved icon bytes and design assets remain unchanged.

Local release logs and the final deployment/smoke report are stored in ignored
`output/release-20261021/`; the pull request records the merge and live outcome.
Use the release version and build fingerprint as the user-facing identity.

## Rollback

This is a frontend-only repair. If acceptance fails, diagnose before further
changes and follow the deployment rollback procedure; do not restore Firestore
for a control-initialization fault. Reverting only this repair reintroduces the
known Quiet Motion toolbar failure. A full fallback to the pre-Quiet-Motion
version would also remove the approved design/icon work, so it is reserved for
an unresolved broader failure.
