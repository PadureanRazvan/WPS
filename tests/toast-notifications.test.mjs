import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildToastModel,
  normalizeToastType,
  resolveToastDuration
} from '../js/toast-notifications.js';

test('toast models normalize messages, types, and caller durations', () => {
  const model = buildToastModel('  Planner saved.  ', 'success', 1800);

  assert.match(model.id, /^sherpa-toast-\d+$/);
  assert.equal(model.message, 'Planner saved.');
  assert.equal(model.type, 'success');
  assert.equal(model.duration, 1800);
  assert.equal(Object.isFrozen(model), true);
});

test('toast types and durations stay inside the supported feedback contract', () => {
  assert.equal(normalizeToastType('warning'), 'info');
  assert.equal(resolveToastDuration('success'), 3200);
  assert.equal(resolveToastDuration('error'), 6000);
  assert.equal(resolveToastDuration('unknown'), 4500);
  assert.equal(resolveToastDuration('info', -20), 1000);
  assert.equal(resolveToastDuration('info', 50000), 12000);
  assert.equal(resolveToastDuration('info', 0), 0);
});

test('toast models reject empty feedback instead of opening an empty surface', () => {
  assert.equal(buildToastModel('   ', 'info'), null);
  assert.equal(buildToastModel(null, 'error'), null);
});
