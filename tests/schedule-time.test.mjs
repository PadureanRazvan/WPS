import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTimeToMinutes,
  isValidTimeString,
  computeWorkedMinutes,
  formatMinutesAsHours,
  workedMinutesUntil
} from '../js/schedule-time.js';

test('parseTimeToMinutes converts valid HH:MM to minutes since midnight', () => {
  assert.equal(parseTimeToMinutes('00:00'), 0);
  assert.equal(parseTimeToMinutes('09:00'), 540);
  assert.equal(parseTimeToMinutes('09:30'), 570);
  assert.equal(parseTimeToMinutes('17:00'), 1020);
  assert.equal(parseTimeToMinutes('23:59'), 1439);
});

test('parseTimeToMinutes accepts a single-digit hour', () => {
  assert.equal(parseTimeToMinutes('9:00'), 540);
  assert.equal(parseTimeToMinutes('0:05'), 5);
  assert.equal(parseTimeToMinutes('8:30'), 510);
});

test('parseTimeToMinutes trims surrounding whitespace', () => {
  assert.equal(parseTimeToMinutes('  09:00  '), 540);
});

test('parseTimeToMinutes honors hour boundaries (0-23)', () => {
  assert.equal(parseTimeToMinutes('00:00'), 0);
  assert.equal(parseTimeToMinutes('23:00'), 1380);
  assert.equal(parseTimeToMinutes('24:00'), null);
  assert.equal(parseTimeToMinutes('25:00'), null);
  assert.equal(parseTimeToMinutes('99:00'), null);
});

test('parseTimeToMinutes honors minute boundaries (0-59)', () => {
  assert.equal(parseTimeToMinutes('10:00'), 600);
  assert.equal(parseTimeToMinutes('10:59'), 659);
  assert.equal(parseTimeToMinutes('10:60'), null);
  assert.equal(parseTimeToMinutes('10:99'), null);
});

test('parseTimeToMinutes rejects malformed strings', () => {
  assert.equal(parseTimeToMinutes(''), null);
  assert.equal(parseTimeToMinutes('   '), null);
  assert.equal(parseTimeToMinutes('abc'), null);
  assert.equal(parseTimeToMinutes('9'), null);
  assert.equal(parseTimeToMinutes('900'), null);
  assert.equal(parseTimeToMinutes('9:5'), null);      // minutes must be two digits
  assert.equal(parseTimeToMinutes('09-00'), null);    // missing colon
  assert.equal(parseTimeToMinutes('09:00:00'), null); // seconds not supported
  assert.equal(parseTimeToMinutes('9:00am'), null);   // no am/pm
  assert.equal(parseTimeToMinutes('09: 00'), null);   // inner space
  assert.equal(parseTimeToMinutes('+9:00'), null);
});

test('parseTimeToMinutes rejects non-string input', () => {
  assert.equal(parseTimeToMinutes(null), null);
  assert.equal(parseTimeToMinutes(undefined), null);
  assert.equal(parseTimeToMinutes(900), null);
  assert.equal(parseTimeToMinutes({}), null);
  assert.equal(parseTimeToMinutes(['09:00']), null);
});

test('isValidTimeString is a boolean wrapper over parseTimeToMinutes', () => {
  assert.equal(isValidTimeString('09:00'), true);
  assert.equal(isValidTimeString('9:00'), true);
  assert.equal(isValidTimeString('00:00'), true);
  assert.equal(isValidTimeString('23:59'), true);

  assert.equal(isValidTimeString('24:00'), false);
  assert.equal(isValidTimeString('10:60'), false);
  assert.equal(isValidTimeString(''), false);
  assert.equal(isValidTimeString('nope'), false);
  assert.equal(isValidTimeString(null), false);

  // Always returns a primitive boolean, never null.
  assert.equal(typeof isValidTimeString('09:00'), 'boolean');
  assert.equal(typeof isValidTimeString('bad'), 'boolean');
});

test('computeWorkedMinutes subtracts break from the start-to-end span', () => {
  assert.equal(computeWorkedMinutes('09:00', '17:00', 30), 450); // 8h - 30m
  assert.equal(computeWorkedMinutes('09:00', '17:00', 0), 480);
  assert.equal(computeWorkedMinutes('08:00', '16:00', 30), 450);
  assert.equal(computeWorkedMinutes('09:00', '17:00'), 480); // default break = 0
});

test('computeWorkedMinutes treats blank/NaN break as 0', () => {
  assert.equal(computeWorkedMinutes('09:00', '17:00', ''), 480);
  assert.equal(computeWorkedMinutes('09:00', '17:00', null), 480);
  assert.equal(computeWorkedMinutes('09:00', '17:00', undefined), 480);
  assert.equal(computeWorkedMinutes('09:00', '17:00', NaN), 480);
  assert.equal(computeWorkedMinutes('09:00', '17:00', 'abc'), 480);
  assert.equal(computeWorkedMinutes('09:00', '17:00', '30'), 450); // numeric string
});

test('computeWorkedMinutes coerces a negative break to 0', () => {
  assert.equal(computeWorkedMinutes('09:00', '17:00', -30), 480);
});

test('computeWorkedMinutes returns null when a time is invalid', () => {
  assert.equal(computeWorkedMinutes('bad', '17:00', 30), null);
  assert.equal(computeWorkedMinutes('09:00', 'bad', 30), null);
  assert.equal(computeWorkedMinutes('24:00', '17:00', 30), null);
  assert.equal(computeWorkedMinutes('', '', 0), null);
});

test('computeWorkedMinutes returns null when end <= start (no overnight in Phase 1)', () => {
  assert.equal(computeWorkedMinutes('17:00', '09:00', 0), null); // overnight not supported
  assert.equal(computeWorkedMinutes('09:00', '09:00', 0), null); // zero-length shift
  assert.equal(computeWorkedMinutes('23:00', '01:00', 0), null); // wraps midnight
});

test('computeWorkedMinutes returns null when break >= the shift span', () => {
  assert.equal(computeWorkedMinutes('09:00', '17:00', 480), null); // break == span
  assert.equal(computeWorkedMinutes('09:00', '17:00', 500), null); // break > span
  assert.equal(computeWorkedMinutes('09:00', '10:00', 60), null);  // 60m break, 60m span
  assert.equal(computeWorkedMinutes('09:00', '10:00', 59), 1);     // just under the span
});

test('formatMinutesAsHours renders one decimal and trims a trailing .0', () => {
  assert.equal(formatMinutesAsHours(450), '7.5');
  assert.equal(formatMinutesAsHours(480), '8');
  assert.equal(formatMinutesAsHours(0), '0');
  assert.equal(formatMinutesAsHours(60), '1');
  assert.equal(formatMinutesAsHours(90), '1.5');
  assert.equal(formatMinutesAsHours(630), '10.5');
  assert.equal(formatMinutesAsHours(1), '0'); // 1 minute rounds to 0.0 -> "0"
});

test('formatMinutesAsHours returns "" for null/NaN/invalid', () => {
  assert.equal(formatMinutesAsHours(null), '');
  assert.equal(formatMinutesAsHours(undefined), '');
  assert.equal(formatMinutesAsHours(NaN), '');
  assert.equal(formatMinutesAsHours('abc'), '');
  assert.equal(formatMinutesAsHours(Infinity), '');
});

test('formatMinutesAsHours composes with computeWorkedMinutes', () => {
  assert.equal(formatMinutesAsHours(computeWorkedMinutes('09:00', '17:00', 30)), '7.5');
  assert.equal(formatMinutesAsHours(computeWorkedMinutes('09:00', '17:00', 0)), '8');
  // Invalid shift -> null -> "".
  assert.equal(formatMinutesAsHours(computeWorkedMinutes('17:00', '09:00')), '');
});

test('workedMinutesUntil computes worked minutes up to a cutoff', () => {
  assert.equal(workedMinutesUntil('13:00', '09:00', 0), 240);  // 4h
  assert.equal(workedMinutesUntil('13:00', '09:00', 30), 210); // minus 30m break
  assert.equal(workedMinutesUntil('13:00', '09:00'), 240);     // default break = 0
  assert.equal(workedMinutesUntil('17:00', '09:00', 30), 450);
});

test('workedMinutesUntil clamps to >= 0 when the break exceeds elapsed time', () => {
  assert.equal(workedMinutesUntil('10:00', '09:00', 120), 0); // 60m elapsed, 120m break
  assert.equal(workedMinutesUntil('10:00', '09:00', 60), 0);
  assert.equal(workedMinutesUntil('10:00', '09:00', 59), 1);
});

test('workedMinutesUntil treats blank/NaN break as 0', () => {
  assert.equal(workedMinutesUntil('13:00', '09:00', ''), 240);
  assert.equal(workedMinutesUntil('13:00', '09:00', null), 240);
  assert.equal(workedMinutesUntil('13:00', '09:00', 'abc'), 240);
});

test('workedMinutesUntil returns null when cutoff or start is invalid', () => {
  assert.equal(workedMinutesUntil('bad', '09:00', 0), null);
  assert.equal(workedMinutesUntil('13:00', 'bad', 0), null);
  assert.equal(workedMinutesUntil('24:00', '09:00', 0), null);
  assert.equal(workedMinutesUntil('', '', 0), null);
});

test('workedMinutesUntil returns null when cutoff <= start', () => {
  assert.equal(workedMinutesUntil('09:00', '09:00', 0), null);
  assert.equal(workedMinutesUntil('08:00', '09:00', 0), null);
});
