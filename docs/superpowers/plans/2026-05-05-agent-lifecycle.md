# Agent Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Agent date-effective lifecycle rules into a tested Agent Lifecycle module.

**Architecture:** `js/agent-lifecycle.js` becomes the pure module for contract start, active/inactive windows, primary team history, Report Role state, inactive month updates, contract-change month updates, and per-Agent productivity role eligibility. Existing browser shells and Firestore writes stay in place.

**Tech Stack:** Browser ESM modules and Node built-in test runner.

---

### Task 1: Failing Agent Lifecycle Tests

**Files:**
- Create: `tests/agent-lifecycle.test.mjs`
- Create: `tests/agent-lifecycle-shell-cleanup.test.mjs`

- [x] **Step 1: Write the failing behavior tests**

Add tests for contract start behavior, active/inactive ranges, primary team history, Report Role state, contract-change month generation, inactive month helpers, and per-Agent productivity role eligibility.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/agent-lifecycle.test.mjs tests/agent-lifecycle-shell-cleanup.test.mjs`

Expected: FAIL because `js/agent-lifecycle.js` does not exist and callers still own lifecycle rules.

### Task 2: Agent Lifecycle Module

**Files:**
- Create: `js/agent-lifecycle.js`

- [x] **Step 1: Implement lifecycle helpers**

Create pure helpers for local date normalization, lifecycle state, primary team history, Report Role state, inactive month updates, contract-change month generation, and per-Agent productivity eligibility.

- [x] **Step 2: Run the focused lifecycle tests**

Run: `node --test tests/agent-lifecycle.test.mjs`

Expected: PASS.

### Task 3: Thin Caller Refactor

**Files:**
- Modify: `js/schedule-semantics.js`
- Modify: `js/users.js`
- Modify: `js/productivity-metrics.js`

- [x] **Step 1: Delegate Schedule Semantics lifecycle decisions**

Use `getAgentLifecycleState()` for pre-start and inactive effective-day behavior, and re-export primary-team and Report Role helpers for compatibility.

- [x] **Step 2: Delegate Users month lifecycle rules**

Use Agent Lifecycle helpers for contract-change month updates, inactive `DZ` month updates, date keys, and primary-team-history changes. Keep modal flows and Firestore writes in `users.js`.

- [x] **Step 3: Delegate Productivity per-Agent eligibility**

Re-export per-Agent Productivity role eligibility from Agent Lifecycle while keeping metric aggregation in `productivity-metrics.js`.

- [x] **Step 4: Run verification**

Run: `node --test tests/agent-lifecycle.test.mjs tests/agent-lifecycle-shell-cleanup.test.mjs tests/effective-day.test.mjs tests/team-history.test.mjs tests/productivity-roles.test.mjs tests/planner-read-model.test.mjs tests/report-read-model.test.mjs tests/productivity-calculation.test.mjs tests/productivity-detail-rows.test.mjs`

Expected: PASS.
