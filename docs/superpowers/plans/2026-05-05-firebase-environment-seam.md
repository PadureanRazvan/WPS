# Firebase Environment Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe Firebase environment seam so production remains the default while development can be wired later.

**Architecture:** Put environment choice in a pure module that has no Firebase SDK dependency. Keep `firebase-config.js` as the existing public module for Firestore/Auth exports, but make it initialize Firebase from the selected environment config.

**Tech Stack:** Browser ESM modules, Firebase Web SDK 9.6.7, Node built-in test runner.

---

### Task 1: Environment Selection Tests

**Files:**
- Create: `tests/firebase-environments.test.mjs`

- [x] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadFirebaseEnvironmentModule() {
  try {
    return await import('../js/firebase-environments.js');
  } catch (error) {
    assert.fail(`firebase-environments.js should be importable: ${error.message}`);
  }
}

test('Firebase environment defaults to production when no override is present', async () => {
  const { getFirebaseEnvironmentName } = await loadFirebaseEnvironmentModule();

  assert.equal(getFirebaseEnvironmentName({}), 'production');
});

test('production Firebase config preserves the live Sherpa project', async () => {
  const { getFirebaseConfig } = await loadFirebaseEnvironmentModule();

  const config = getFirebaseConfig('production');

  assert.equal(config.projectId, 'wps-sherpa-database');
  assert.equal(config.authDomain, 'wps-sherpa-database.firebaseapp.com');
  assert.equal(config.storageBucket, 'wps-sherpa-database.appspot.com');
});

test('development Firebase environment is explicit but not silently usable yet', async () => {
  const {
    getFirebaseEnvironmentName,
    getFirebaseConfig,
    isFirebaseEnvironmentConfigured
  } = await loadFirebaseEnvironmentModule();

  assert.equal(getFirebaseEnvironmentName({ WPS_FIREBASE_ENV: 'development' }), 'development');
  assert.equal(isFirebaseEnvironmentConfigured('development'), false);
  assert.throws(
    () => getFirebaseConfig('development'),
    /development.*not configured/i
  );
});

test('unknown Firebase environment fails fast', async () => {
  const { getFirebaseEnvironmentName } = await loadFirebaseEnvironmentModule();

  assert.throws(
    () => getFirebaseEnvironmentName({ WPS_FIREBASE_ENV: 'staging' }),
    /Unknown Firebase environment/i
  );
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/firebase-environments.test.mjs`

Expected: FAIL because `js/firebase-environments.js` does not exist yet.

### Task 2: Environment Module

**Files:**
- Create: `js/firebase-environments.js`

- [x] **Step 1: Write minimal implementation**

```js
const DEFAULT_FIREBASE_ENVIRONMENT = 'production';

const FIREBASE_ENVIRONMENTS = {
  production: {
    apiKey: 'AIzaSyCZqJeajOlCekhzXgHAhf4ZIpCMKJxW8qs',
    authDomain: 'wps-sherpa-database.firebaseapp.com',
    projectId: 'wps-sherpa-database',
    storageBucket: 'wps-sherpa-database.appspot.com',
    messagingSenderId: '897978989234',
    appId: '1:897978989234:web:f2869963eb261af70ce7ab',
    measurementId: 'G-NBPVK629X4'
  },
  development: null
};

export function getFirebaseEnvironmentName(source = globalThis) {
  const requestedEnvironment = source?.WPS_FIREBASE_ENV;
  if (!requestedEnvironment) return DEFAULT_FIREBASE_ENVIRONMENT;

  const environmentName = String(requestedEnvironment).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(FIREBASE_ENVIRONMENTS, environmentName)) {
    throw new Error(`Unknown Firebase environment: ${requestedEnvironment}`);
  }

  return environmentName;
}

export function isFirebaseEnvironmentConfigured(environmentName = DEFAULT_FIREBASE_ENVIRONMENT) {
  return Boolean(FIREBASE_ENVIRONMENTS[environmentName]);
}

export function getFirebaseConfig(environmentName = getFirebaseEnvironmentName()) {
  if (!Object.prototype.hasOwnProperty.call(FIREBASE_ENVIRONMENTS, environmentName)) {
    throw new Error(`Unknown Firebase environment: ${environmentName}`);
  }

  const config = FIREBASE_ENVIRONMENTS[environmentName];
  if (!config) {
    throw new Error(`Firebase environment "${environmentName}" is not configured yet.`);
  }

  return { ...config };
}
```

- [x] **Step 2: Run test to verify it passes**

Run: `node --test tests/firebase-environments.test.mjs`

Expected: PASS.

### Task 3: Wire Existing Firebase Config

**Files:**
- Modify: `js/firebase-config.js`

- [x] **Step 1: Replace inline config with environment module**

Use `getFirebaseConfig()` and export `firebaseEnvironment` for browser confirmation. Keep the existing exported `db`, `auth`, `googleProvider`, `signInWithPopup`, `signOut`, and `onAuthStateChanged` names unchanged.

- [x] **Step 2: Run full tests**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass.

- [x] **Step 3: Reload external Chrome**

Reload `http://localhost:3000/`.

Expected: login screen still loads, with no intentional cloud writes.
