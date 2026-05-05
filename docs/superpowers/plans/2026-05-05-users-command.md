# Users Command Implementation Plan

**Goal:** Extract Agent form/save, inline edit, contract change, primary team change, deactivation, and reactivation payload rules from `js/users.js` into a tested Users Command Module.

**Architecture:** `js/users-command.js` returns command results: `{ ok, updateData, payload, activity, labels, error, action }`. `js/users.js` keeps DOM work and Firestore writes, translating command results into `addAgent`, `updateAgent`, `logActivity`, modal closing, rerendering, and user-facing messages.

**Tech Stack:** Browser ESM modules and Node built-in test runner.

---

### Task 1: Failing Users Command Tests

**Files:**
- Create: `tests/users-command.test.mjs`

- [x] **Step 1: Write the failing tests**

Add tests for create-Agent validation/payloads, contract changes, primary-team changes, deactivate/reactivate payloads, inline edit normalization, validation errors, no-op detection, and modal handoff actions.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/users-command.test.mjs tests/users-command-shell-cleanup.test.mjs tests/agent-lifecycle-shell-cleanup.test.mjs`

Expected: FAIL because `js/users-command.js` does not exist and `users.js` still owns the extracted rules.

### Task 2: Users Command Module

**Files:**
- Create: `js/users-command.js`

- [x] **Step 1: Implement command builders**

Create command helpers for create-Agent, inline edits, contract changes, primary-team changes, deactivation, and reactivation. Keep Firestore Timestamp conversion behind a caller-supplied `timestampFromDate` adapter.

- [x] **Step 2: Run focused Module tests**

Run: `node --test tests/users-command.test.mjs`

Expected: PASS.

### Task 3: Thin Users Shell Adapter

**Files:**
- Modify: `js/users.js`
- Create: `tests/users-command-shell-cleanup.test.mjs`
- Modify: `tests/agent-lifecycle-shell-cleanup.test.mjs`

- [x] **Step 1: Write the failing shell cleanup test**

Assert that `users.js` imports and calls Users Command helpers and no longer owns inline comparison helpers or lifecycle month rewrite rules.

- [x] **Step 2: Refactor `users.js` to consume Users Command**

Keep DOM/modal behavior, Firestore writes, activity logging, and translated messages in the shell. Replace payload construction and validation branches with command results.

- [x] **Step 3: Run focused and full verification**

Run:
- `node --test tests/users-command.test.mjs tests/users-command-shell-cleanup.test.mjs tests/agent-lifecycle-shell-cleanup.test.mjs`
- `node --test tests/*.test.mjs`
- `git diff --check HEAD`

Expected: PASS, with no whitespace errors.
