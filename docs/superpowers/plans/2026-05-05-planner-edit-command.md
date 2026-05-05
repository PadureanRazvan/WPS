# Planner Edit Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Planner save command preparation into a tested Planner Edit Command module.

**Architecture:** `js/planner-edit-command.js` becomes the pure command module. It imports Schedule Semantics helpers, owns selected-cell grouping, month update payloads, note behavior, and undo snapshots, and presents a small interface to `js/planner.js`.

**Tech Stack:** Browser ESM modules and Node built-in test runner.

---

### Task 1: Failing Planner Edit Command Tests

**Files:**
- Create: `tests/planner-edit-command.test.mjs`

- [x] **Step 1: Write the failing test**

Add tests that import `buildPlannerEditCommand` from `../js/planner-edit-command.js`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/planner-edit-command.test.mjs`

Expected: FAIL because `js/planner-edit-command.js` does not exist yet.

### Task 2: Planner Edit Command Module

**Files:**
- Create: `js/planner-edit-command.js`

- [x] **Step 1: Implement minimal command builder**

Create the new module with selected-cell grouping, Firestore update payloads, note replacement/clearing, undo snapshots, changed Agent ids, missing Agent ids, and edit activity metadata.

- [x] **Step 2: Run the focused tests**

Run: `node --test tests/planner-edit-command.test.mjs`

Expected: PASS.

### Task 3: Thin Planner Write Adapter

**Files:**
- Create: `tests/planner-edit-command-shell-cleanup.test.mjs`
- Modify: `js/planner.js`

- [x] **Step 1: Write the failing shell cleanup test**

Assert that `planner.js` imports and calls `buildPlannerEditCommand`, and no longer owns selected-cell grouping, month padding, note mutation, or undo snapshot construction.

- [x] **Step 2: Refactor save orchestration to consume the command**

Keep Firestore writes, undo stack mutation, logging, and UI messages in `planner.js`. Apply the command's update payloads through `updateAgent`.

- [x] **Step 3: Run verification**

Run: `node --test tests/planner-edit-command.test.mjs tests/planner-edit-command-shell-cleanup.test.mjs tests/planner-read-model.test.mjs tests/planner-shell-cleanup.test.mjs tests/planner-half-hours.test.mjs tests/effective-day.test.mjs tests/team-history.test.mjs tests/schedule-semantics.test.mjs`

Expected: PASS.
