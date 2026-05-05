# Reports Read Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract report aggregation and report-ready shape into a tested Report Read Model module.

**Architecture:** `js/report-read-model.js` becomes the report calculation module. It imports Schedule Semantics helpers, owns aggregation and sorting, and presents a small interface to `js/reports.js`.

**Tech Stack:** Browser ESM modules and Node built-in test runner.

---

### Task 1: Failing Report Read Model Tests

**Files:**
- Create: `tests/report-read-model.test.mjs`

- [ ] **Step 1: Write the failing test**

Add tests that import `buildReportReadModel` and `calculatePlannerReportData` from `../js/report-read-model.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/report-read-model.test.mjs`

Expected: FAIL because `js/report-read-model.js` does not exist yet.

### Task 2: Report Read Model Module

**Files:**
- Create: `js/report-read-model.js`
- Modify: `js/schedule-semantics.js`
- Modify: `js/config.js`

- [ ] **Step 1: Implement minimal report aggregation**

Create the new module with `calculatePlannerReportData(agents, start, end)` and `buildReportReadModel(agents, start, end)`.

- [ ] **Step 2: Run the focused tests**

Run: `node --test tests/report-read-model.test.mjs tests/report-roles.test.mjs tests/schedule-semantics.test.mjs`

Expected: PASS.

### Task 3: Thin Reports UI Adapter

**Files:**
- Modify: `js/reports.js`

- [ ] **Step 1: Replace local sorting/date-label rules**

Import `buildReportReadModel` from `./report-read-model.js`. Render the returned read model instead of directly calling `calculatePlannerReportData`.

- [ ] **Step 2: Run all tests**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass.
