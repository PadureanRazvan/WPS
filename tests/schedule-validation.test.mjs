import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateScheduleRows,
  SCHEDULE_ERROR_CODES
} from '../js/schedule-validation.js';

const AGENTS = [
  { username: 'mpopescu', fullName: 'Maria Popescu' },
  { username: 'ionescu', fullName: 'Andrei Ionescu' }
];

// Build a clean, valid working row; override fields per test.
function makeRow(overrides = {}) {
  return {
    month: '2026-06',
    agentUsername: 'mpopescu',
    agentName: 'Maria Popescu',
    date: '2026-06-01',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    notes: '',
    ...overrides
  };
}

// Convenience: validate a single row and return its result.
function validateOne(row, agents = AGENTS, options = {}) {
  const { results } = validateScheduleRows([row], agents, options);
  return results[0];
}

function codes(result) {
  return result.errors.map(e => e.code);
}

test('a valid working row is ok with correct workedMinutes', () => {
  const result = validateOne(makeRow());
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.errors, []);
  assert.equal(result.workedMinutes, 450); // 8h span - 30m break
  assert.equal(result.resolvedAgent, AGENTS[0]);
});

test('a row with empty start AND end is a day off (no errors, 0 minutes)', () => {
  const result = validateOne(makeRow({ startTime: '', endTime: '' }));
  assert.equal(result.status, 'dayoff');
  assert.deepEqual(result.errors, []);
  assert.equal(result.workedMinutes, 0);
});

test('UNKNOWN_AGENT fires when no username matches', () => {
  const result = validateOne(makeRow({ agentUsername: 'ghost', agentName: 'Nobody Here' }));
  assert.equal(result.status, 'error');
  assert.ok(codes(result).includes(SCHEDULE_ERROR_CODES.UNKNOWN_AGENT));
  assert.equal(result.resolvedAgent, null);
});

test('username match is case-insensitive', () => {
  const result = validateOne(makeRow({ agentUsername: 'MPopescu' }));
  assert.equal(result.status, 'ok');
  assert.equal(result.resolvedAgent, AGENTS[0]);
});

test('agent_name is a secondary fallback when username is blank', () => {
  // Blank username, but the human-readable name resolves via findProductivityAgent.
  const result = validateOne(makeRow({ agentUsername: '', agentName: 'Andrei Ionescu' }));
  assert.ok(!codes(result).includes(SCHEDULE_ERROR_CODES.UNKNOWN_AGENT));
  assert.equal(result.resolvedAgent, AGENTS[1]);
});

test('INVALID_DATE fires for an impossible calendar date', () => {
  const result = validateOne(makeRow({ date: '2026-02-30', month: '2026-02' }));
  assert.equal(result.status, 'error');
  assert.ok(codes(result).includes(SCHEDULE_ERROR_CODES.INVALID_DATE));
});

test('INVALID_DATE fires for a malformed date string', () => {
  const result = validateOne(makeRow({ date: '01/06/2026' }));
  assert.ok(codes(result).includes(SCHEDULE_ERROR_CODES.INVALID_DATE));
});

test('INVALID_DATE does not also raise MONTH_MISMATCH', () => {
  const result = validateOne(makeRow({ date: '2026-13-01' }));
  assert.ok(codes(result).includes(SCHEDULE_ERROR_CODES.INVALID_DATE));
  assert.ok(!codes(result).includes(SCHEDULE_ERROR_CODES.MONTH_MISMATCH));
});

test('MONTH_MISMATCH fires when the date month != row.month', () => {
  const result = validateOne(makeRow({ date: '2026-07-01', month: '2026-06' }));
  assert.equal(result.status, 'error');
  assert.ok(codes(result).includes(SCHEDULE_ERROR_CODES.MONTH_MISMATCH));
});

test('MONTH_MISMATCH uses options.expectedMonth when provided', () => {
  // Row month agrees with the date, but the selected expected month differs.
  const result = validateOne(
    makeRow({ date: '2026-06-01', month: '2026-06' }),
    AGENTS,
    { expectedMonth: '2026-05' }
  );
  assert.ok(codes(result).includes(SCHEDULE_ERROR_CODES.MONTH_MISMATCH));
});

test('expectedMonth that matches the date passes', () => {
  const result = validateOne(
    makeRow({ date: '2026-06-01', month: '2026-06' }),
    AGENTS,
    { expectedMonth: '2026-06' }
  );
  assert.equal(result.status, 'ok');
});

test('INVALID_START fires for a malformed start time', () => {
  const result = validateOne(makeRow({ startTime: '25:00' }));
  assert.equal(result.status, 'error');
  assert.ok(codes(result).includes(SCHEDULE_ERROR_CODES.INVALID_START));
});

test('INVALID_END fires for a malformed end time', () => {
  const result = validateOne(makeRow({ endTime: 'nope' }));
  assert.equal(result.status, 'error');
  assert.ok(codes(result).includes(SCHEDULE_ERROR_CODES.INVALID_END));
});

test('END_BEFORE_START fires when end <= start (no overnight in Phase 1)', () => {
  const equal = validateOne(makeRow({ startTime: '09:00', endTime: '09:00' }));
  assert.ok(codes(equal).includes(SCHEDULE_ERROR_CODES.END_BEFORE_START));

  const reversed = validateOne(makeRow({ startTime: '17:00', endTime: '09:00' }));
  assert.ok(codes(reversed).includes(SCHEDULE_ERROR_CODES.END_BEFORE_START));
  // A reversed shift is not also flagged as a too-long break.
  assert.ok(!codes(reversed).includes(SCHEDULE_ERROR_CODES.BREAK_TOO_LONG));
});

test('BREAK_TOO_LONG fires when break >= shift span', () => {
  const result = validateOne(makeRow({ startTime: '09:00', endTime: '10:00', breakMinutes: 60 }));
  assert.equal(result.status, 'error');
  assert.ok(codes(result).includes(SCHEDULE_ERROR_CODES.BREAK_TOO_LONG));
  assert.equal(result.workedMinutes, null);
});

test('DUPLICATE fires on every row sharing agentUsername + date', () => {
  const rows = [
    makeRow({ date: '2026-06-01', startTime: '09:00', endTime: '17:00' }),
    makeRow({ date: '2026-06-01', startTime: '10:00', endTime: '18:00' }),
    makeRow({ date: '2026-06-02' }) // distinct date — not a duplicate
  ];
  const { results } = validateScheduleRows(rows, AGENTS);

  assert.ok(codes(results[0]).includes(SCHEDULE_ERROR_CODES.DUPLICATE));
  assert.ok(codes(results[1]).includes(SCHEDULE_ERROR_CODES.DUPLICATE));
  assert.ok(!codes(results[2]).includes(SCHEDULE_ERROR_CODES.DUPLICATE));
  assert.equal(results[2].status, 'ok');
});

test('DUPLICATE detection is case-insensitive on the username', () => {
  const rows = [
    makeRow({ agentUsername: 'mpopescu', date: '2026-06-03' }),
    makeRow({ agentUsername: 'MPopescu', date: '2026-06-03' })
  ];
  const { results } = validateScheduleRows(rows, AGENTS);
  assert.ok(codes(results[0]).includes(SCHEDULE_ERROR_CODES.DUPLICATE));
  assert.ok(codes(results[1]).includes(SCHEDULE_ERROR_CODES.DUPLICATE));
});

test('a single row collects multiple independent errors', () => {
  const result = validateOne(
    makeRow({
      agentUsername: 'ghost',
      agentName: 'No Body',
      date: '2026-07-01', // month mismatch vs row.month 2026-06
      startTime: '99:99', // invalid start
      endTime: '17:00'
    })
  );
  const found = codes(result);
  assert.ok(found.includes(SCHEDULE_ERROR_CODES.UNKNOWN_AGENT));
  assert.ok(found.includes(SCHEDULE_ERROR_CODES.MONTH_MISMATCH));
  assert.ok(found.includes(SCHEDULE_ERROR_CODES.INVALID_START));
  assert.equal(result.status, 'error');
  assert.equal(result.workedMinutes, null);
});

test('every error carries a code and a non-empty message', () => {
  const result = validateOne(makeRow({ agentUsername: 'ghost', agentName: 'Nope' }));
  result.errors.forEach(err => {
    assert.equal(typeof err.code, 'string');
    assert.equal(typeof err.message, 'string');
    assert.ok(err.message.length > 0);
  });
});

test('summary counts ok, errors, daysOff and total correctly', () => {
  const rows = [
    makeRow({ date: '2026-06-01' }),                                   // ok
    makeRow({ date: '2026-06-02', startTime: '', endTime: '' }),       // dayoff
    makeRow({ date: '2026-06-03', agentUsername: 'ghost', agentName: 'X' }), // error
    makeRow({ agentUsername: 'ionescu', agentName: 'Andrei Ionescu', date: '2026-06-04' }) // ok
  ];
  const { summary } = validateScheduleRows(rows, AGENTS);

  assert.equal(summary.total, 4);
  assert.equal(summary.ok, 2);
  assert.equal(summary.daysOff, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.ok + summary.errors + summary.daysOff, summary.total);
});

test('handles non-array rows and empty agents gracefully', () => {
  const empty = validateScheduleRows(undefined);
  assert.deepEqual(empty.results, []);
  assert.deepEqual(empty.summary, { ok: 0, errors: 0, daysOff: 0, total: 0 });

  // With no agents, a row simply fails UNKNOWN_AGENT rather than throwing.
  const result = validateOne(makeRow(), []);
  assert.equal(result.status, 'error');
  assert.ok(codes(result).includes(SCHEDULE_ERROR_CODES.UNKNOWN_AGENT));
});
