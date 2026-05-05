# Planner Interaction Wiring Implementation Plan

**Goal:** Extract Planner table listener binding, delete delegation, edit-modal opening controls, and keyboard DOM orchestration into a tested Planner Interaction Wiring Module.

**Architecture:** `js/planner-interaction-wiring.js` hides DOM selectors and event binding details behind `bindPlannerTableInteractions` and `bindPlannerControlInteractions`. The shell modules pass existing handlers in, so the new Module owns wiring knowledge but not Planner state, Firestore writes, modal implementation, or command behavior.

**Tech Stack:** Browser ESM modules and Node built-in test runner.

---

### Task 1: Failing Planner Interaction Wiring Tests

**Files:**
- Create: `tests/planner-interaction-wiring.test.mjs`

- [x] **Step 1: Write the failing tests**

Add tests that import the new Module and cover selectable Planner Cell listener binding, document mouseup, scoped right-click, delete delegation, missing DOM safety, Planner edit controls, modal controls, undo, and Planner keyboard shortcuts.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/planner-interaction-wiring.test.mjs tests/planner-interaction-wiring-shell-cleanup.test.mjs`

Expected: FAIL because `js/planner-interaction-wiring.js` does not exist and the shells still own the listener wiring.

### Task 2: Planner Interaction Wiring Module

**Files:**
- Create: `js/planner-interaction-wiring.js`

- [x] **Step 1: Implement binding helpers behind the new Module**

Create `bindPlannerTableInteractions` for rendered Planner table interactions and `bindPlannerControlInteractions` for Planner edit/modal/keyboard controls.

- [x] **Step 2: Run focused Module tests**

Run: `node --test tests/planner-interaction-wiring.test.mjs`

Expected: PASS.

### Task 3: Thin Planner and App Shell Adapters

**Files:**
- Create: `tests/planner-interaction-wiring-shell-cleanup.test.mjs`
- Modify: `js/planner.js`
- Modify: `js/main.js`

- [x] **Step 1: Write the failing shell cleanup test**

Assert that `planner.js` delegates rendered table listener binding to `bindPlannerTableInteractions`, and `main.js` delegates Planner edit-modal and shortcut wiring to `bindPlannerControlInteractions`.

- [x] **Step 2: Refactor the shells to consume the Planner Interaction Wiring Module**

Keep existing named handlers, selection state, delete-month command behavior, modal functions, and undo behavior. Replace direct selector/listener blocks with calls into the new Module.

- [x] **Step 3: Run focused verification**

Run: `node --test tests/planner-interaction-wiring.test.mjs tests/planner-interaction-wiring-shell-cleanup.test.mjs tests/planner-table-view.test.mjs tests/planner-table-view-shell-cleanup.test.mjs tests/planner-selection-state.test.mjs tests/planner-view-state.test.mjs tests/planner-read-model.test.mjs tests/planner-edit-command.test.mjs tests/planner-persistence-command.test.mjs tests/planner-half-hours.test.mjs tests/effective-day.test.mjs tests/team-history.test.mjs tests/schedule-semantics.test.mjs`

Expected: PASS.
