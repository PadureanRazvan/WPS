import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHERPA_VERSION,
  computeBuildFingerprint,
  formatVersionLabel
} from '../js/version.js';

test('SHERPA_VERSION carries the three identifying fields as non-empty strings', () => {
  for (const key of ['number', 'codename', 'released']) {
    assert.equal(typeof SHERPA_VERSION[key], 'string');
    assert.ok(SHERPA_VERSION[key].length > 0, `${key} should not be empty`);
  }
});

test('SHERPA_VERSION.number is CalVer YYYY.MM.DD (optionally .N)', () => {
  assert.match(SHERPA_VERSION.number, /^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/);
});

test('SHERPA_VERSION.released is an ISO date', () => {
  assert.match(SHERPA_VERSION.released, /^\d{4}-\d{2}-\d{2}$/);
});

test('SHERPA_VERSION is frozen (cannot be mutated at runtime)', () => {
  assert.ok(Object.isFrozen(SHERPA_VERSION));
});

test('computeBuildFingerprint is 8 uppercase hex chars', () => {
  assert.match(computeBuildFingerprint(), /^[0-9A-F]{8}$/);
});

test('computeBuildFingerprint is deterministic for the same version', () => {
  const v = { number: '2026.06.10', codename: 'Liquid Aurora', released: '2026-06-10' };
  assert.equal(computeBuildFingerprint(v), computeBuildFingerprint(v));
});

test('computeBuildFingerprint changes when ANY identifying field changes', () => {
  const base = { number: '2026.06.10', codename: 'Liquid Aurora', released: '2026-06-10' };
  const baseId = computeBuildFingerprint(base);
  assert.notEqual(baseId, computeBuildFingerprint({ ...base, number: '2026.06.11' }));
  assert.notEqual(baseId, computeBuildFingerprint({ ...base, codename: 'Liquid Aurora ' }));
  assert.notEqual(baseId, computeBuildFingerprint({ ...base, released: '2026-06-11' }));
});

test('formatVersionLabel renders "v<number> · <codename>"', () => {
  assert.equal(
    formatVersionLabel({ number: '2026.06.10', codename: 'Liquid Aurora', released: '2026-06-10' }),
    'v2026.06.10 · Liquid Aurora'
  );
});
