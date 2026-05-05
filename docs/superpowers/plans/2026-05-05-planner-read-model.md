# Planner Read Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Planner table read rules into a tested Planner Read Model module.

**Architecture:** `js/planner-read-model.js` becomes the Planner calculation module. It imports Schedule Semantics helpers, owns Planner Cell display and row shape, and presents a small interface to `js/planner.js`.

**Tech Stack:** Browser ESM modules and Node built-in test runner.

---

### Task 1: Failing Planner Read Model Tests

**Files:**
- Create: `tests/planner-read-model.test.mjs`

- [x] **Step 1: Write the failing test**

Add tests that import `buildPlannerReadModel`, `filterPlannerAgents`, `formatPlannerCellContent`, `getPlannerCellClassNames`, and `getPlannerCellTextSizeClass` from `../js/planner-read-model.js`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/planner-read-model.test.mjs`

Expected: FAIL because `js/planner-read-model.js` does not exist yet.

### Task 2: Planner Read Model Module

**Files:**
- Create: `js/planner-read-model.js`

- [x] **Step 1: Implement minimal read model**

Create the new module with filtering, Planner Cell display, class names, text sizing, headers, rows, totals, notes, and week totals.

- [x] **Step 2: Run the focused tests**

Run: `node --test tests/planner-read-model.test.mjs`

Expected: PASS.

### Task 3: Thin Planner UI Adapter

**Files:**
- Create: `tests/planner-shell-cleanup.test.mjs`
- Modify: `js/planner.js`

- [x] **Step 1: Write the failing shell cleanup test**

Assert that `planner.js` imports and calls `buildPlannerReadModel`, and no longer owns filtering, cell formatting, cell classes, text sizing, or total-hour calculation helpers.

- [x] **Step 2: Refactor rendering to consume the read model**

Keep Firestore, undo, Agent CRUD, selection, and modal flows in `planner.js`. Render headers, rows, cells, titles, classes, and totals from the Planner Read Model.

- [x] **Step 3: Run verification**

Run: `node --test tests/planner-read-model.test.mjs tests/planner-shell-cleanup.test.mjs tests/planner-half-hours.test.mjs tests/effective-day.test.mjs tests/team-history.test.mjs tests/schedule-semantics.test.mjs`

Expected: PASS.
