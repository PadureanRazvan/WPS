# Planner Table View Design

## Goal

Move Planner table markup construction out of `js/planner.js` and into a deeper, tested module that renders the existing Planner Read Model without owning Firestore writes or interaction behavior.

## Design

`js/planner-table-view.js` owns the Planner Table View:

- render fixed Planner table structure, header row, body, Agent rows, Planner Cells, week-total cells, and total cells
- preserve the CSS classes, data attributes, delete-month metadata, note titles, and cell presentation styles expected by the existing shell
- escape dynamic labels, Agent names, Planner Cell text, titles, and data attributes before writing HTML
- toggle the `few-days-view` class on the table container from the Planner Read Model

`js/planner.js` remains the browser shell. It still owns Firestore subscriptions, Planner Read Model creation, selection and delete listener binding, edit modal flow, undo, save/delete commands, and public exports. After the table is rendered, the shell re-attaches the existing event listeners to the newly rendered Planner Cells.

## Scope

- Add `js/planner-table-view.js`.
- Update `js/planner.js` to consume `renderPlannerTableView`.
- Keep `planner.js` public exports stable.
- Add focused Planner Table View tests and a shell cleanup guard.
- Do not change Firestore schema, save/delete payloads, undo behavior, Agent CRUD, or Planner interaction wiring.

## Verification

- Run Planner Table View tests.
- Run Planner table shell cleanup tests.
- Run focused Planner read-model, shell, state, edit, persistence, half-hour, effective-day, team-history, and schedule-semantics regressions.
- Run the full Node test suite.
- Browser smoke should load Planner, render rows and selectable cells, select a Planner Cell, and open/cancel the edit modal without clicking Save, Undo, Add, Delete, or clear-month confirmations.
