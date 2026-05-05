# Planner Persistence Command Design

## Goal

Move Planner persistence payload rules out of `js/planner.js` and into a deeper, tested Planner Persistence Command module.

## Design

The Planner Persistence Command sits between Planner state and the Firestore write adapter. It returns pure data for:

- legacy `days` and `dayNotes` migration into `monthlyDays` and `monthlyNotes`
- undo restore payloads from Planner Edit Command snapshots
- single-month clear payloads and activity metadata

`js/planner.js` remains the browser shell. It still owns Firestore subscriptions, `updateAgent`, confirmation prompts, activity logging calls, DOM rendering, and user messages. The shell should not know how migration eligibility, restore fields, or empty month payloads are assembled.

## Scope

- Add `js/planner-persistence-command.js`.
- Update migration, undo, and clear-month orchestration in `js/planner.js` to consume the command results.
- Keep Planner public exports stable.
- Add tests for legacy migration, migrated-Agent filtering, undo restore payloads, incomplete snapshots, and clear-month payloads.
- Do not change Firestore schema or production data.

## Verification

- Run the new Planner Persistence Command tests.
- Run the Planner Persistence Command shell cleanup test.
- Run focused Planner/Schedule tests.
- Run the full Node test suite.
- Smoke test production UI without clicking Save, Undo, Add, Delete, or clear-month confirmations.
