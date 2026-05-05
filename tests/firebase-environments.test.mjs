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
