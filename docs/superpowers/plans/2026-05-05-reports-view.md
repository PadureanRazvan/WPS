# Reports View Implementation Plan

**Goal:** Extract Reports table/card HTML rendering from `js/reports.js` into a tested Reports View Module while keeping the shell responsible for date picking, refresh state, Planner data access, and Report Read Model creation.

**Architecture:** `js/reports-view.js` turns a Report Read Model plus translated labels into Reports HTML and updates the target container. `js/reports.js` builds the read model, passes translated labels, and delegates all Reports display markup.

**Tech Stack:** Browser ESM modules and Node built-in test runner.

---

### Task 1: Failing Reports View Tests

**Files:**
- Create: `tests/reports-view.test.mjs`

- [x] **Step 1: Write the failing tests**

Add tests that import the new Reports View Module and cover empty states, shop sections, Report Role sections, half-hour formatting, dynamic text escaping, and container rendering.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/reports-view.test.mjs tests/reports-shell-cleanup.test.mjs`

Expected: FAIL because `js/reports-view.js` does not exist and `js/reports.js` still owns rendering helpers.

### Task 2: Reports View Module

**Files:**
- Create: `js/reports-view.js`

- [x] **Step 1: Implement Reports rendering behind the new Module**

Create `buildReportsHtml`, `renderReportsView`, `buildReportHoursTableRows`, and `buildReportDistributionCards` to render the Report Read Model while preserving existing DOM shape and escaping dynamic content.

- [x] **Step 2: Run focused module tests**

Run: `node --test tests/reports-view.test.mjs`

Expected: PASS.

### Task 3: Thin Reports Shell Rendering Adapter

**Files:**
- Modify: `tests/reports-shell-cleanup.test.mjs`
- Modify: `js/reports.js`

- [x] **Step 1: Write the failing shell cleanup guard**

Assert that `reports.js` imports and calls `renderReportsView`, and no longer owns table/card HTML helpers.

- [x] **Step 2: Refactor `renderReports` to consume the Reports View**

Keep date checks, Report Read Model creation, translations, refresh behavior, and cleanup in `reports.js`. Delegate empty-state and report-section HTML to `renderReportsView`.

- [x] **Step 3: Run focused verification**

Run: `node --test tests/reports-view.test.mjs tests/reports-shell-cleanup.test.mjs tests/report-read-model.test.mjs tests/report-roles.test.mjs tests/planner-table-view.test.mjs tests/planner-read-model.test.mjs`

Expected: PASS.
