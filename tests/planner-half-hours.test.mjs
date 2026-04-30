import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractHoursFromDay,
  formatPlannerHoursValue,
  isValidPlannerHoursValue,
  parseShiftEntry
} from 'file:///C:/Users/USER/Desktop/WPS/js/config.js';

test('parseShiftEntry accepts .5 single-team values', () => {
  assert.deepEqual(parseShiftEntry('7.5RO'), { hours: 7.5, team: 'RO' });
  assert.deepEqual(parseShiftEntry('0.5QA'), { hours: 0.5, team: 'QA' });
});

test('parseShiftEntry accepts .5 values for 2L team codes', () => {
  assert.deepEqual(parseShiftEntry('7.52L'), { hours: 7.5, team: '2L' });
});

test('extractHoursFromDay sums split half-hour values', () => {
  assert.equal(extractHoursFromDay('3.5RO+4IT'), 7.5);
  assert.equal(extractHoursFromDay('4RO+3.5IT'), 7.5);
});

test('parseShiftEntry rejects unsupported fractional formats', () => {
  assert.equal(parseShiftEntry('7.25RO'), null);
  assert.equal(parseShiftEntry('7.75RO'), null);
  assert.equal(parseShiftEntry('7.0RO'), null);
  assert.equal(parseShiftEntry('7,5RO'), null);
  assert.equal(parseShiftEntry('RO7.5'), null);
  assert.equal(parseShiftEntry('3.5RO+4.25IT'), null);
});

test('planner hour helpers keep canonical whole-or-.5 formatting', () => {
  assert.equal(isValidPlannerHoursValue(0), true);
  assert.equal(isValidPlannerHoursValue(0.5), true);
  assert.equal(isValidPlannerHoursValue(7), true);
  assert.equal(isValidPlannerHoursValue(7.5), true);
  assert.equal(isValidPlannerHoursValue(7.25), false);

  assert.equal(formatPlannerHoursValue(7), '7');
  assert.equal(formatPlannerHoursValue(7.5), '7.5');
  assert.equal(formatPlannerHoursValue(12), '12');
});
