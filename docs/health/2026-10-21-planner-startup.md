# Planner startup regression and health review — 2026-10-21

## Decision and current status

Recommend the targeted Planner initialization repair instead of reverting the
entire Quiet Motion release. The confirmed fault is in frontend control binding;
there is no evidence from these checks that a database restore is needed.
The repair is local on `codex/planner-startup-regression`, based on production
merge `4b7900c89a0f888bf0adc80d2540845d916779f3`. This review has not deployed or
rolled back production. The approved interface, motion and browser icons remain
unchanged. Release cache identity must be refreshed before publishing the fix.

## Confirmed failure and cause

The existing authenticated production session loaded 93 Planner agents, but its
date input and range title stayed empty. Clicking either month arrow left the
month unchanged, and Export CSV produced no download. The successful app-init
message and the screenshot's Google popup COOP warnings did not explain whether
Planner controls were attached.

Quiet Motion moved the authenticated modules into a dynamic runtime import.
`planner.js` still bound its date picker, month arrows, filter and export inside
a `DOMContentLoaded` listener. That event had already fired before the module
loaded. Its separate Firestore subscription still rendered the table, making
the workspace look ready while the toolbar was disconnected.

The repair calls an idempotent `initializePlannerControls()` from
`initializePlanner()`. The runtime already awaits the calendar libraries before
that call. Controls bind once per page; sign-out/sign-in reuses them while
restarting the data subscription. No persistence commands, calculations, access
rules or backend configuration are changed.

## Evidence and verification

- The deployed 56 release assets matched the committed release bytes. Latest
  Pages build was successful at `4b7900c`; a mixed cached deployment was not
  observed.
- Deterministic reproduction imported the real Planner after the page-load
  event. Before repair: one eager-loading case passed and four lifecycle cases
  failed. After repair: all five passed, including the real app runtime waiting
  for its calendar library, selected-month CSV and sign-out/sign-in without
  duplicate handlers. These tests reject database writes.
- Full frontend suite: **540 passed**, zero failures, with
  `node --test --test-concurrency=2 tests/*.test.mjs`.
- Functions policy checks: **6 passed**. Release-map verification (97 local
  modules) and whitespace checks passed. The release number is intentionally
  unchanged until a production release is prepared.
- External Chrome with synthetic data and the real Litepicker passed
  October → September → October → November → October navigation, a custom
  October 5–9 range, search filtering, and a fresh sign-out/sign-in round trip.
- An actual downloaded September CSV contained **22 rows / 176 hours**, all
  for the synthetic agent and September dates. SHA-256:
  `2606ddce778a79f3879d401b1a760bbaa69c9ec2699c439ed42076257f823e60`.
- Local diagnostics reported four active data subscriptions and zero attempted
  business writes after re-login. The only external preview resources were the
  two explicitly allowed calendar CDN files. No new console errors or warnings
  were captured in the final operational checks.

Evidence logs, synthetic CSV and browser screenshot are in ignored
`output/health-20261021/`. They are not a production write or OAuth test.

## Production health observations

Read-only checks in the existing authenticated Chrome session found:

| Area | Result |
| --- | --- |
| Planner data read | 93 agents rendered; toolbar regression confirmed |
| Dashboard | Date and team table rendered |
| Users | 93 rows; search no-match and clearing search worked |
| Productivity | Date control initialized; selected date rendered |
| Reports | Date range initialized; refresh retained 11 report rows |
| Deployment | Pages build successful; release asset hashes matched |
| Backend policy tests | Six checks passed; no backend changes in the release |

These checks do not establish complete database integrity, new-login OAuth
health, production editing, upload behavior or AI-function execution. No Save,
Add, Delete, Undo, upload or clear-month action was used. Existing application
initialization and its normal logging were not altered.

A fresh private Firestore snapshot used fixed read time
`2026-10-21T07:12:40.000Z`, completed at `07:14:38.061Z`, and verified 18,335
documents across six collections: 93 agents, 234 productivity documents, one
schedule, one config document, five tickets and 18,001 activity logs. Recursive
enumeration found no missing ancestors. JSON/count/hash verification completed;
the backup procedure made **zero database writes**. Backup data is outside Git.
SHA-256: `81256e31759d3c0f578692ce0e9863a23ad005749808c0462f6ffabaea6927a8`.

The dependency audit remains **two high and one critical** alerts in
`@fastify/busboy`, `@grpc/grpc-js` and `proxy-addr`. These predate this frontend
release and are not the cause of unbound Planner buttons. They still need
separate backend remediation; this is not an all-clear security assessment.

## Other observations and limits

- At a narrow viewport, an export success toast covered toolbar buttons and
  stayed open while hovered. Explicit dismissal restored access; this behavior
  predates Quiet Motion and is separate from the initial blank date/failed
  download regression. No notification redesign is included in this repair.
- A long browser pass showed a date mismatch after re-login. Earlier calendar
  DOM timestamps used UTC+8 day boundaries; subsequent fresh diagnostics showed
  Europe/Bucharest (UTC+3). A browser timezone change is the likely explanation,
  rather than duplicate navigation handlers. A fresh page with unchanged
  Bucharest timezone passed re-login and month navigation. The ambiguous pass
  is not counted as a successful check or used to justify a calendar-code fix.
- GPU warm-up variation remains as documented in the Quiet Motion release.
  This repair does not claim to improve rendering performance further.

## Why the release tests missed it

The old runtime tests replaced `initializePlanner` with a stub. Planner export
tests verified that a handler existed in source, not that it attached after a
late import. The visual preview used an empty roster and a calendar stub. Those
checks passed without exercising the user's month/export workflow.

Prevention: retain the real runtime/Planner lifecycle regression tests; use the
opt-in synthetic roster with the real calendar for browser checks; and require
actual month navigation, filtering and a verified CSV in release smoke checks.

## Rollback contingency

If the targeted repair fails those production smoke checks after a reviewed
release, revert the frontend release through the normal deployment flow. The
pre-Quiet-Motion main commit is
`624847da3e3b733f51ede91a11e23960bac65ef6`. A full rollback removes the approved
startup, sculpture and icon work as well as the regression, so it is the fallback
rather than the preferred first action. Refresh cache identity and verify served
files and controls after either path. Neither path calls for restoring Firestore
from backup for this frontend initialization fault.
