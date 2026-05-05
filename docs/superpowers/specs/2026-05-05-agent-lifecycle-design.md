# Agent Lifecycle Design

## Goal

Move Agent date-effective lifecycle rules out of caller modules and into a deeper, tested Agent Lifecycle module.

## Design

The Agent Lifecycle module is the source of truth for:

- contract start boundaries and local date normalization
- active and inactive date windows
- primary team history and Report Role state by date
- contract-change month day generation
- inactive `DZ` month updates
- per-Agent productivity role eligibility

`js/schedule-semantics.js` still owns Planner Cell parsing, leave codes, hours, default schedule generation, and effective Planner values. `js/users.js` remains the browser shell for Agent modals and Firestore writes. `js/productivity-metrics.js` still owns Productivity metric aggregation. These callers should ask Agent Lifecycle for lifecycle decisions instead of duplicating the date and role rules.

## Scope

- Add `js/agent-lifecycle.js`.
- Re-export lifecycle helpers through Schedule Semantics where existing callers rely on `js/config.js`.
- Update Schedule Semantics to call `getAgentLifecycleState()` for pre-start and inactive effective-day behavior.
- Update Users to call Agent Lifecycle helpers for contract-change, inactive, and primary-team-history date handling.
- Update Productivity Metrics to re-export per-Agent role eligibility from Agent Lifecycle.
- Keep Firestore schemas and browser write flows unchanged.

## Verification

- Run the Agent Lifecycle tests.
- Run the Agent Lifecycle shell cleanup test.
- Run focused Schedule, Team History, Productivity, Planner Read Model, and Reports tests.
- Run the full Node test suite.
- Smoke test production UI without clicking Save, Undo, Add, Delete, or clear-month confirmations.
