# Planner Table View Implementation Plan

**Goal:** Extract Planner table/header/row/cell rendering from `js/planner.js` into a tested Planner Table View module while keeping the shell responsible for Firestore, selection listeners, edit modal flow, save/delete, and undo behavior.

**Architecture:** `js/planner-table-view.js` turns the Planner Read Model plus translated labels into table HTML and updates the target table container. `js/planner.js` builds the read model, delegates rendering, then re-attaches existing interaction listeners.

**Tech Stack:** Browser ESM modules and Node built-in test runner.

---

### Task 1: Failing Planner Table View Tests

**Files:**
- Create: `tests/planner-table-view.test.mjs`

- [x] **Step 1: Write the failing tests**

Add tests that import the new Planner Table View module and cover table structure, headers, rows, Planner Cells, week totals, delete-month metadata, note titles, few-days class toggling, and escaped dynamic text.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/planner-table-view.test.mjs`

Expected: FAIL because `js/planner-table-view.js` does not exist.

### Task 2: Planner Table View Module

**Files:**
- Create: `js/planner-table-view.js`

- [x] **Step 1: Implement table rendering behind the new module**

Create `buildPlannerTableHtml` and `renderPlannerTableView` to render the Planner Read Model while preserving existing DOM hooks and escaping dynamic content.

- [x] **Step 2: Run focused module tests**

Run: `node --test tests/planner-table-view.test.mjs`

Expected: PASS.

### Task 3: Thin Planner Shell Rendering Adapter

**Files:**
- Create: `tests/planner-table-view-shell-cleanup.test.mjs`
- Modify: `js/planner.js`

- [x] **Step 1: Write the failing shell cleanup test**

Assert that `planner.js` imports and calls `renderPlannerTableView`, and no longer owns extracted table/header/row/cell rendering helpers.

- [x] **Step 2: Refactor `renderPlannerTable` to consume the Planner Table View**

Keep date fallback, read-model creation, header update, and listener re-attachment in `planner.js`. Delegate table rendering and container display classes to `renderPlannerTableView`.

- [x] **Step 3: Run focused verification**

Run: `node --test tests/planner-table-view.test.mjs tests/planner-table-view-shell-cleanup.test.mjs tests/planner-read-model.test.mjs tests/planner-shell-cleanup.test.mjs tests/planner-shell-state-cleanup.test.mjs tests/planner-edit-command.test.mjs tests/planner-persistence-command.test.mjs tests/planner-half-hours.test.mjs`

Expected: PASS.
