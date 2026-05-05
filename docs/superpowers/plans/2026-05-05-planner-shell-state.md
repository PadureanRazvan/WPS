# Planner Shell State Implementation Plan

**Goal:** Extract Planner shell selection and filter/view state rules into tested modules while keeping the browser shell responsible for DOM, Firestore, and existing public exports.

**Architecture:** `js/planner-selection-state.js` becomes the pure module for Planner Cell selection transitions. `js/planner-view-state.js` becomes the pure module for Planner filter, month, date-range, search, and view-option transitions. `js/planner.js` delegates state changes to those modules.

**Tech Stack:** Browser ESM modules and Node built-in test runner.

---

### Task 1: Failing Planner State Module Tests

**Files:**
- Create: `tests/planner-selection-state.test.mjs`
- Create: `tests/planner-view-state.test.mjs`

- [x] **Step 1: Write the failing tests**

Add tests that import the new state modules and cover Planner Cell selection, drag add, clear/stop, month toggles, team fallback, Agent filter selection, date presets, search terms, view options, and reset behavior.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/planner-selection-state.test.mjs` and `node --test tests/planner-view-state.test.mjs`

Expected: FAIL because the modules do not exist.

### Task 2: Planner State Modules

**Files:**
- Create: `js/planner-selection-state.js`
- Create: `js/planner-view-state.js`

- [x] **Step 1: Implement minimal pure state transitions**

Create immutable helpers for selection, month, team, Agent, date-range, search, view-option, and reset state changes.

- [x] **Step 2: Run focused module tests**

Run: `node --test tests/planner-selection-state.test.mjs tests/planner-view-state.test.mjs`

Expected: PASS.

### Task 3: Thin Planner Shell State Adapter

**Files:**
- Create: `tests/planner-shell-state-cleanup.test.mjs`
- Modify: `js/planner.js`

- [x] **Step 1: Write the failing shell cleanup test**

Assert that `planner.js` imports and calls the Planner Selection State and Planner View State modules, and no longer mutates selected Planner Cells, selected teams, selected Agents, selected months, range type, date ranges, search terms, or view options inline.

- [x] **Step 2: Refactor shell event handlers to consume the state modules**

Keep DOM class updates, rendering, event listeners, Firestore writes, and public exports in `js/planner.js`. Replace inline state mutation with module calls.

- [x] **Step 3: Run focused verification**

Run: `node --test tests/planner-selection-state.test.mjs tests/planner-view-state.test.mjs tests/planner-shell-state-cleanup.test.mjs tests/planner-read-model.test.mjs tests/planner-edit-command.test.mjs tests/planner-persistence-command.test.mjs tests/planner-half-hours.test.mjs`

Expected: PASS.
