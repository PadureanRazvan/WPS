# Planner Shell State Design

## Goal

Move Planner shell selection, filter, month, range, search, and view-option state rules out of `js/planner.js` and into deeper, tested modules.

## Design

`js/planner-selection-state.js` owns pure Planner Cell selection transitions:

- build stable Planner Cell selection keys from rendered cell datasets
- toggle a clicked Planner Cell
- add cells during drag selection
- stop drag selection
- clear selected Planner Cells
- report selection counts

`js/planner-view-state.js` owns pure Planner view and filter transitions:

- selected month toggles, select-all, and clear
- selected team fallback to `all`
- Agent and team filter dropdown changes
- range type and preset date ranges
- Agent search terms
- view options such as compact view
- reset and clear-filter behavior

`js/planner.js` remains the browser shell. It still owns Firestore subscriptions, DOM rendering, event listeners, modals, delete confirmations, and calls to existing Planner read/edit/persistence modules. The shell applies state module results and updates DOM classes.

## Scope

- Add `js/planner-selection-state.js`.
- Add `js/planner-view-state.js`.
- Update `js/planner.js` to consume both modules while preserving public exports.
- Add focused module tests and a shell cleanup guard.
- Do not change Firestore schema, save/delete payloads, Agent CRUD, undo behavior, or Planner Cell rendering rules.

## Verification

- Run Planner Selection State tests.
- Run Planner View State tests.
- Run Planner shell cleanup tests.
- Run focused Planner read/edit/persistence regressions.
- Run the full Node test suite.
- Browser smoke should select a Planner Cell and open/cancel the edit modal without clicking Save, Undo, Add, Delete, or clear-month confirmations.
