# Planner Edit Command Design

## Goal

Make Planner edits call a deeper, tested Planner Edit Command module instead of rebuilding Firestore update payloads, undo snapshots, month padding, and note changes inside `js/planner.js`.

## Design

The Planner Edit Command sits between Planner selection state and the Firestore write adapter. It imports Schedule Semantics helpers for month days and notes, then returns pure data:

- update payloads for `updateAgent`
- undo snapshots for the Planner undo stack
- changed and missing Agent ids
- activity metadata for edit logging

`js/planner.js` remains the browser shell. It still owns Firestore writes, the undo stack, activity logging, DOM state, and success/error messages. The shell should not know how selected cell keys are grouped, how month arrays are padded, or how note replacement and clearing are applied.

## Scope

- Add `js/planner-edit-command.js`.
- Update `applyChangesToSelectedCells()` in `js/planner.js` to consume the command result.
- Keep Planner public exports stable.
- Add tests for single-Agent, multi-Agent, multi-month, notes, note clearing, undo snapshots, missing Agents, and empty selection.
- Do not change Firestore schema or production data.

## Verification

- Run the new Planner Edit Command tests.
- Run the Planner Edit Command shell cleanup test.
- Run focused Planner/Schedule tests.
- Run the full Node test suite.
- Smoke test production UI without clicking Save.
