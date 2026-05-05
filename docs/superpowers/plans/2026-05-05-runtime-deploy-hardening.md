# Runtime Deploy Hardening Implementation Plan

**Goal:** Add a repeatable production deployment and smoke-check path so architecture slices can be merged with clearer evidence and less manual Chrome work.

**Architecture:** `scripts/production-smoke.mjs` becomes the Runtime Deploy Hardening Module for versioned production smoke checks. `docs/deployment.md` records backup, deploy, smoke, and rollback flow.

**Tech Stack:** Node built-in test runner, Node browser-compatible `WebSocket`, and Chrome DevTools Protocol.

---

### Task 1: Failing Smoke Helper Tests

**Files:**
- Create: `tests/production-smoke.test.mjs`

- [x] **Step 1: Write the failing tests**

Cover versioned URL building, Sherpa tab selection, browser-event filtering, and read-only CLI option defaults.

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/production-smoke.test.mjs`

Expected: FAIL because `scripts/production-smoke.mjs` does not exist.

### Task 2: Runtime Smoke Module

**Files:**
- Create: `scripts/production-smoke.mjs`

- [x] **Step 1: Implement the smoke Module**

Create exported helper functions plus a CLI that reuses one existing Chrome CDP tab, imports key Modules with a version query, opens Reports, clicks refresh, and reports relevant browser errors.

- [x] **Step 2: Run focused tests**

Run: `node --test tests/production-smoke.test.mjs`

Expected: PASS.

- [x] **Step 3: Run against current production**

Run: `node scripts/production-smoke.mjs --version 23f2544`

Expected: PASS, with authenticated shell visible and no relevant browser errors.

### Task 3: Deployment Docs

**Files:**
- Create: `tests/deployment-docs.test.mjs`
- Create: `docs/deployment.md`
- Modify: `CONTEXT.md`

- [x] **Step 1: Write the failing docs guard**

Assert the docs record Firestore backup, the smoke command, single external Chrome, no Firestore writes, and rollback by merge-commit revert.

- [x] **Step 2: Add deployment documentation**

Document pre-deploy checks, GitHub Pages availability checks, read-only production smoke, and rollback.

- [x] **Step 3: Run focused verification**

Run: `node --test tests/production-smoke.test.mjs tests/deployment-docs.test.mjs`

Expected: PASS.
