# Planner Interaction Wiring Design

## Goal

Move Planner DOM listener orchestration out of `js/planner.js` and Planner-specific edit/keyboard wiring out of `js/main.js` into a deeper, tested Module. Keep Firestore writes, save/delete commands, undo behavior, and modal implementation unchanged.

## Design

`js/planner-interaction-wiring.js` owns the Planner Interaction Wiring:

- bind selectable Planner Cell mouse interactions after each table render
- bind document mouseup, scoped right-click clearing, and delete-month delegation for the rendered Planner table body
- bind Planner edit controls: edit selection, cancel selection, edit type choices, save, close modal, undo
- bind Planner keyboard shortcuts only when Planner is active and the event target is not an input
- tolerate missing DOM nodes so inactive sections and tests can call the Interface safely
- return teardown functions for tests and future shell cleanup, while preserving current one-time boot behavior

`js/planner.js` remains the browser shell for selection state, Planner Read Model creation, Firestore subscription/write orchestration, undo payloads, and delete-month commands. It passes named handler functions into the interaction Module.

`js/main.js` remains the app shell for auth boot, navigation, theme/language controls, and module initialization. It delegates Planner-specific edit-modal and shortcut wiring through `bindPlannerControlInteractions`.

## Scope

- Add `js/planner-interaction-wiring.js`.
- Update `js/planner.js` to call `bindPlannerTableInteractions` after rendering.
- Update `js/main.js` to call `bindPlannerControlInteractions` from `initializeUI`.
- Keep Planner public exports stable.
- Do not change Firestore schema, save/delete payloads, Agent CRUD, selection rules, undo command behavior, or modal rendering.

## Verification

- Run Planner Interaction Wiring tests and shell cleanup tests.
- Run Planner table, selection, view state, read model, edit command, persistence command, half-hour, effective-day, team-history, and schedule-semantics regressions.
- Run the full Node test suite.
- Browser smoke should use one external Chrome session, load production after merge, render Planner rows and selectable cells, select a Planner Cell, open and close the edit modal, and avoid Save, Undo, Add, Delete, or clear-month confirmations unless explicitly approved.
