# App Shell Wiring Implementation Plan

**Goal:** Extract app visibility, auth lifecycle binding, navigation, theme/language controls, logout, before-unload cleanup, and cross-module refresh event wiring from `js/main.js`.

**Architecture:** `js/app-shell-wiring.js` provides small deep Interfaces for browser shell wiring: `showLoginScreen`, `showAuthenticatedShell`, `bindAppShellInteractions`, `bindAppLifecycleEvents`, and `bindAppRefreshEvents`. Callers pass concrete adapters for auth, UI, logs, cleanup, and feature Modules.

**Tech Stack:** Browser ESM modules and Node built-in test runner.

---

### Task 1: Failing App Shell Wiring Tests

**Files:**
- Create: `tests/app-shell-wiring.test.mjs`

- [x] **Step 1: Write the failing tests**

Add tests for login/app visibility, sidebar user details, navigation clicks, theme toggle, language dropdown and selection, Planner control binding handoff, sidebar toggle, logout, DOMContentLoaded boot, auth callbacks, before-unload cleanup, and Productivity refresh events.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/app-shell-wiring.test.mjs tests/app-shell-wiring-shell-cleanup.test.mjs`

Expected: FAIL because `js/app-shell-wiring.js` does not exist and `main.js` still owns the extracted wiring.

### Task 2: App Shell Wiring Module

**Files:**
- Create: `js/app-shell-wiring.js`

- [x] **Step 1: Implement shell wiring helpers**

Create browser-safe helpers that tolerate missing DOM nodes and return teardown functions for future hardening.

- [x] **Step 2: Run focused Module tests**

Run: `node --test tests/app-shell-wiring.test.mjs`

Expected: PASS.

### Task 3: Thin Main Shell Adapter

**Files:**
- Modify: `js/main.js`
- Create: `tests/app-shell-wiring-shell-cleanup.test.mjs`

- [x] **Step 1: Write the failing shell cleanup test**

Assert that `main.js` imports and calls App Shell Wiring helpers and no longer owns the extracted DOM selector/listener blocks.

- [x] **Step 2: Refactor `main.js` to consume App Shell Wiring**

Keep dynamic greeting generation, module initialization order, feature Module initialization, concrete auth/log/UI adapters, and cleanup semantics in `main.js`.

- [x] **Step 3: Run focused and full verification**

Run:
- `node --test tests/app-shell-wiring.test.mjs tests/app-shell-wiring-shell-cleanup.test.mjs tests/planner-interaction-wiring.test.mjs tests/productivity-controls.test.mjs tests/users-command.test.mjs`
- `node --test tests/*.test.mjs`
- `git diff --check HEAD`

Expected: PASS, with no whitespace errors.
