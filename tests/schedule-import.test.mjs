import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseScheduleCsvLine,
  parseScheduleCsv,
  SCHEDULE_CSV_HEADERS,
  SCHEDULE_REQUIRED_HEADERS
} from '../js/schedule-import.js';

const CANONICAL_HEADER = SCHEDULE_CSV_HEADERS.join(',');

test('parseScheduleCsvLine splits a plain comma-separated line', () => {
  assert.deepEqual(
    parseScheduleCsvLine('2026-06,mpopescu,Maria Popescu,2026-06-01,09:00,17:00,30,'),
    ['2026-06', 'mpopescu', 'Maria Popescu', '2026-06-01', '09:00', '17:00', '30', '']
  );
});

test('parseScheduleCsvLine keeps commas inside quoted fields', () => {
  assert.deepEqual(
    parseScheduleCsvLine('2026-06,mpopescu,"Popescu, Maria",2026-06-01,09:00,17:00,30,"late, then early"'),
    ['2026-06', 'mpopescu', 'Popescu, Maria', '2026-06-01', '09:00', '17:00', '30', 'late, then early']
  );
});

test('parseScheduleCsvLine collapses doubled quotes inside a quoted field', () => {
  assert.deepEqual(
    parseScheduleCsvLine('a,"she said ""hi""",c'),
    ['a', 'she said "hi"', 'c']
  );
});

test('parseScheduleCsvLine returns a single empty field for an empty line', () => {
  assert.deepEqual(parseScheduleCsvLine(''), ['']);
});

test('parseScheduleCsvLine tolerates non-string input', () => {
  assert.deepEqual(parseScheduleCsvLine(null), ['']);
  assert.deepEqual(parseScheduleCsvLine(undefined), ['']);
});

test('parseScheduleCsv parses a well-formed file', () => {
  const csv = [
    CANONICAL_HEADER,
    '2026-06,mpopescu,Maria Popescu,2026-06-01,09:00,17:00,30,',
    '2026-06,mpopescu,Maria Popescu,2026-06-02,10:00,18:00,30,',
    '2026-06,ionescu,Andrei Ionescu,2026-06-01,08:00,16:00,30,'
  ].join('\n');

  const { headerError, rows } = parseScheduleCsv(csv);

  assert.equal(headerError, null);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    month: '2026-06',
    agentUsername: 'mpopescu',
    agentName: 'Maria Popescu',
    date: '2026-06-01',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    notes: '',
    lineNumber: 2
  });
  assert.equal(rows[1].agentUsername, 'mpopescu');
  assert.equal(rows[1].date, '2026-06-02');
  assert.equal(rows[2].agentUsername, 'ionescu');
});

test('parseScheduleCsv keeps commas inside a quoted notes field', () => {
  const csv = [
    CANONICAL_HEADER,
    '2026-06,mpopescu,Maria Popescu,2026-06-01,09:00,17:00,30,"swapped shift, covers Andrei"'
  ].join('\n');

  const { headerError, rows } = parseScheduleCsv(csv);

  assert.equal(headerError, null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].notes, 'swapped shift, covers Andrei');
  assert.equal(rows[0].breakMinutes, 30);
});

test('parseScheduleCsv is tolerant of reordered and extra columns', () => {
  const csv = [
    'notes,date,agent_name,start_time,end_time,break_minutes,agent_username,month,extra_col',
    'morning,2026-06-01,Maria Popescu,09:00,17:00,30,mpopescu,2026-06,ignored'
  ].join('\n');

  const { headerError, rows } = parseScheduleCsv(csv);

  assert.equal(headerError, null);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    month: '2026-06',
    agentUsername: 'mpopescu',
    agentName: 'Maria Popescu',
    date: '2026-06-01',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    notes: 'morning',
    lineNumber: 2
  });
});

test('parseScheduleCsv matches headers case-insensitively and trims them', () => {
  const csv = [
    ' Month , Agent_Username , Agent_Name , DATE , Start_Time , End_Time , Break_Minutes , Notes ',
    '2026-06,mpopescu,Maria Popescu,2026-06-01,09:00,17:00,30,'
  ].join('\n');

  const { headerError, rows } = parseScheduleCsv(csv);

  assert.equal(headerError, null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].agentUsername, 'mpopescu');
  assert.equal(rows[0].startTime, '09:00');
});

test('parseScheduleCsv reports a missing required header via headerError', () => {
  // start_time is absent.
  const csv = [
    'month,agent_username,agent_name,date,end_time,break_minutes,notes',
    '2026-06,mpopescu,Maria Popescu,2026-06-01,17:00,30,'
  ].join('\n');

  const { headerError, rows } = parseScheduleCsv(csv);

  assert.ok(headerError, 'a missing required header should produce a headerError');
  assert.match(headerError, /start_time/);
  assert.deepEqual(rows, []);
});

test('parseScheduleCsv reports every missing required header', () => {
  const csv = [
    'agent_name,date,start_time,end_time,break_minutes,notes',
    'Maria Popescu,2026-06-01,09:00,17:00,30,'
  ].join('\n');

  const { headerError, rows } = parseScheduleCsv(csv);

  // month and agent_username are both required and both missing.
  assert.match(headerError, /month/);
  assert.match(headerError, /agent_username/);
  assert.deepEqual(rows, []);
});

test('parseScheduleCsv treats a blank break_minutes as 0 (number)', () => {
  const csv = [
    CANONICAL_HEADER,
    '2026-06,mpopescu,Maria Popescu,2026-06-01,09:00,17:00,,note'
  ].join('\n');

  const { rows } = parseScheduleCsv(csv);

  assert.equal(rows.length, 1);
  assert.strictEqual(rows[0].breakMinutes, 0);
  assert.equal(typeof rows[0].breakMinutes, 'number');
});

test('parseScheduleCsv coerces a present break_minutes to a number', () => {
  const csv = [
    CANONICAL_HEADER,
    '2026-06,mpopescu,Maria Popescu,2026-06-01,09:00,17:00,45,'
  ].join('\n');

  const { rows } = parseScheduleCsv(csv);

  assert.strictEqual(rows[0].breakMinutes, 45);
  assert.equal(typeof rows[0].breakMinutes, 'number');
});

test('parseScheduleCsv skips fully blank lines and preserves source lineNumber', () => {
  const csv = [
    CANONICAL_HEADER,                                              // line 1
    '',                                                            // line 2 (blank)
    '2026-06,mpopescu,Maria Popescu,2026-06-01,09:00,17:00,30,',  // line 3
    '   ',                                                         // line 4 (whitespace-only)
    '2026-06,ionescu,Andrei Ionescu,2026-06-01,08:00,16:00,30,'   // line 5
  ].join('\n');

  const { headerError, rows } = parseScheduleCsv(csv);

  assert.equal(headerError, null);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].agentUsername, 'mpopescu');
  assert.equal(rows[0].lineNumber, 3);
  assert.equal(rows[1].agentUsername, 'ionescu');
  assert.equal(rows[1].lineNumber, 5);
});

test('parseScheduleCsv lineNumber is 1-based against the original source', () => {
  const csv = [
    CANONICAL_HEADER,                                              // line 1
    '2026-06,mpopescu,Maria Popescu,2026-06-01,09:00,17:00,30,',  // line 2
    '2026-06,mpopescu,Maria Popescu,2026-06-02,10:00,18:00,30,'   // line 3
  ].join('\n');

  const { rows } = parseScheduleCsv(csv);

  assert.equal(rows[0].lineNumber, 2);
  assert.equal(rows[1].lineNumber, 3);
});

test('parseScheduleCsv tolerates CRLF line endings', () => {
  const csv = [
    CANONICAL_HEADER,
    '2026-06,mpopescu,Maria Popescu,2026-06-01,09:00,17:00,30,'
  ].join('\r\n') + '\r\n'; // trailing CRLF -> trailing blank line

  const { headerError, rows } = parseScheduleCsv(csv);

  assert.equal(headerError, null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].lineNumber, 2);
  assert.equal(rows[0].startTime, '09:00');
});

test('parseScheduleCsv preserves empty start/end (day off) without flagging it', () => {
  // A day-off row (empty start AND end) is structurally valid here; semantic
  // handling belongs to schedule-validation.
  const csv = [
    CANONICAL_HEADER,
    '2026-06,mpopescu,Maria Popescu,2026-06-03,,,,'
  ].join('\n');

  const { headerError, rows } = parseScheduleCsv(csv);

  assert.equal(headerError, null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].startTime, '');
  assert.equal(rows[0].endTime, '');
  assert.strictEqual(rows[0].breakMinutes, 0);
});

test('parseScheduleCsv reports an empty file via headerError', () => {
  assert.deepEqual(parseScheduleCsv(''), { headerError: 'empty_file', rows: [] });
  assert.deepEqual(parseScheduleCsv('   \n  \n'), { headerError: 'empty_file', rows: [] });
  assert.deepEqual(parseScheduleCsv(null), { headerError: 'empty_file', rows: [] });
});

test('parseScheduleCsv does NOT do semantic validation (bad data still parses)', () => {
  // Unknown agent, invalid date, end <= start, and a non-numeric break all flow
  // through as plain structural data. None of these produce a headerError.
  const csv = [
    CANONICAL_HEADER,
    'not-a-month,ghost,Nobody,2026-13-40,17:00,09:00,abc,'
  ].join('\n');

  const { headerError, rows } = parseScheduleCsv(csv);

  assert.equal(headerError, null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].month, 'not-a-month');
  assert.equal(rows[0].agentUsername, 'ghost');
  assert.equal(rows[0].date, '2026-13-40');
  assert.equal(rows[0].startTime, '17:00');
  assert.equal(rows[0].endTime, '09:00');
  assert.ok(Number.isNaN(rows[0].breakMinutes)); // non-numeric -> NaN, not an error here
});

test('exported header constants describe the template', () => {
  assert.deepEqual(SCHEDULE_CSV_HEADERS, [
    'month',
    'agent_username',
    'agent_name',
    'date',
    'start_time',
    'end_time',
    'break_minutes',
    'notes'
  ]);
  assert.deepEqual(SCHEDULE_REQUIRED_HEADERS, [
    'month',
    'agent_username',
    'date',
    'start_time',
    'end_time'
  ]);
});
