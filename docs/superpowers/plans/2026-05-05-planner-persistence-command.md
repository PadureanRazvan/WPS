# Planner Persistence Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Planner persistence payload preparation into a tested Planner Persistence Command module.

**Architecture:** `js/planner-persistence-command.js` becomes the pure command module for migration, undo restore, and clear-month update payloads. `js/planner.js` remains the browser shell and Firestore adapter.

**Tech Stack:** Browser ESM modules and Node built-in test runner.

---

### Task 1: Failing Planner Persistence Command Tests

**Files:**
- Create: `tests/planner-persistence-command.test.mjs`

- [x] **Step 1: Write the failing test**

Add tests that import the new command functions from `../js/planner-persistence-command.js`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/planner-persistence-command.test.mjs tests/planner-persistence-command-shell-cleanup.test.mjs`

Expected: FAIL because `js/planner-persistence-command.js` does not exist and `planner.js` still owns the persistence rules.

### Task 2: Planner Persistence Command Module

**Files:**
- Create: `js/planner-persistence-command.js`

- [x] **Step 1: Implement minimal command builders**

Create pure builders for legacy migration commands, migration command lists, undo restore commands, and clear-month commands.

- [x] **Step 2: Run the focused command tests**

Run: `node --test tests/planner-persistence-command.test.mjs`

Expected: PASS.

### Task 3: Thin Planner Persistence Adapter

**Files:**
- Create: `tests/planner-persistence-command-shell-cleanup.test.mjs`
- Modify: `js/planner.js`

- [x] **Step 1: Write the failing shell cleanup test**

Assert that `planner.js` imports and calls the Planner Persistence Command, and no longer owns migration filtering, undo restore payload construction, or empty month payload construction.

- [x] **Step 2: Refactor persistence orchestration to consume the command**

Keep Firestore writes, prompts, logging, and messages in `planner.js`. Apply command update payloads through `updateAgent`.

- [x] **Step 3: Run verification**

Run: `node --test tests/planner-persistence-command.test.mjs tests/planner-persistence-command-shell-cleanup.test.mjs tests/planner-edit-command.test.mjs tests/planner-edit-command-shell-cleanup.test.mjs tests/planner-read-model.test.mjs tests/planner-shell-cleanup.test.mjs tests/planner-half-hours.test.mjs tests/effective-day.test.mjs tests/team-history.test.mjs tests/schedule-semantics.test.mjs`

Expected: PASS.
