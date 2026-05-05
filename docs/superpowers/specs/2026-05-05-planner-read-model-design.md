# Planner Read Model Design

## Goal

Make Planner rendering call a deeper, tested Planner Read Model module instead of carrying Planner Cell display rules, filtering, totals, and header shape in `js/planner.js`.

## Design

The Planner Read Model sits above Schedule Semantics. Schedule Semantics remains the source for effective Planner Cell values, Primary Team History, inactive dates, leave codes, team parsing, and hour extraction. The Planner Read Model owns table-ready structure for Planner: filtered Agents, headers, row totals, week totals, Planner Cell display lines, classes, titles, and sizing hints.

`js/planner.js` remains the browser shell. It keeps the Firestore subscription, Agent CRUD, undo stack, DOM rendering, event binding, and exported commands used by `ui.js`, `users.js`, `chat.js`, Reports, and Productivity. The shell should not know how to format multi-team Planner Cells, classify leave or working values, calculate row totals, or filter Agents.

## Scope

- Add `js/planner-read-model.js`.
- Update `js/planner.js` to render the returned read model.
- Keep existing Planner public exports stable.
- Add tests for Planner Cell display, classes, notes, effective days, totals, week totals, delete-month keys, and filters.
- Do not change Firestore schema or production data.

## Verification

- Run the new Planner Read Model tests.
- Run the Planner shell cleanup test.
- Run the focused Planner/Schedule tests.
- Run the full Node test suite.
- Open no automated Chrome windows unless explicitly requested.
