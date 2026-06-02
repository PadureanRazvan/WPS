import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScheduleDemoData } from '../js/schedule-demo-data.js';

const ALLOWED_STARTS = ['08:00', '09:00', '10:00', '14:00'];
const ALLOWED_TEAMS = ['RO', 'IT', 'HU', 'NL'];

function makeAgent(fullName, username) {
  return { fullName, username };
}

test('buildScheduleDemoData is deterministic: same input => identical output', () => {
  const agents = [
    makeAgent('Ada Lovelace', 'ada'),
    makeAgent('Grace Hopper', 'grace'),
    makeAgent('Alan Turing', 'alan')
  ];

  const first = buildScheduleDemoData(agents, { date: '2026-07-15' });
  const second = buildScheduleDemoData(agents, { date: '2026-07-15' });

  // Deep-equal across independent calls, and not the same object reference.
  assert.deepEqual(second, first);
  assert.notEqual(second, first);
  assert.notEqual(second.rows, first.rows);

  // Stable down to the JSON byte level (guards ordering/formatting drift).
  assert.equal(JSON.stringify(second), JSON.stringify(first));
});

test('buildScheduleDemoData is deterministic for the fabricated fallback too', () => {
  const a = buildScheduleDemoData();
  const b = buildScheduleDemoData([]);
  assert.deepEqual(b, a);
  assert.equal(JSON.stringify(b), JSON.stringify(a));
});

test('buildScheduleDemoData does not call Math.random (no time/random seeding)', () => {
  const original = Math.random;
  let called = false;
  Math.random = () => {
    called = true;
    return 0.42;
  };
  try {
    buildScheduleDemoData([makeAgent('Ada Lovelace', 'ada')]);
    buildScheduleDemoData();
  } finally {
    Math.random = original;
  }
  assert.equal(called, false);
});

test('buildScheduleDemoData fabricates a roster when no agents are given', () => {
  const { rows } = buildScheduleDemoData();

  assert.ok(rows.length >= 2, 'expected a handful of placeholder agents');

  // The two spec-mandated placeholders must be present, keyed by username.
  const byUsername = new Map(rows.map(row => [row.username, row]));
  assert.ok(byUsername.has('mpopescu'), 'Maria Popescu placeholder present');
  assert.ok(byUsername.has('ionescu'), 'Andrei Ionescu placeholder present');
  assert.equal(byUsername.get('mpopescu').agentName, 'Maria Popescu');
  assert.equal(byUsername.get('ionescu').agentName, 'Andrei Ionescu');
});

test('buildScheduleDemoData honors a real roster (username is the identifier)', () => {
  const agents = [
    makeAgent('Ada Lovelace', 'ada'),
    makeAgent('Grace Hopper', 'grace')
  ];
  const { rows } = buildScheduleDemoData(agents, { date: '2026-07-15' });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.username), ['ada', 'grace']);
  assert.deepEqual(rows.map(row => row.agentName), ['Ada Lovelace', 'Grace Hopper']);
  // The provided date is applied to every row.
  assert.ok(rows.every(row => row.date === '2026-07-15'));
});

test('every row has a believable shift within Phase 1 ranges', () => {
  const { rows } = buildScheduleDemoData([
    makeAgent('Ada Lovelace', 'ada'),
    makeAgent('Grace Hopper', 'grace'),
    makeAgent('Alan Turing', 'alan'),
    makeAgent('Maria Popescu', 'mpopescu')
  ]);

  for (const row of rows) {
    assert.ok(ALLOWED_STARTS.includes(row.startTime), `start ${row.startTime} is one of the allowed slots`);
    assert.ok(ALLOWED_TEAMS.includes(row.team), `team ${row.team} is from the demo set`);
    assert.equal(row.breakMinutes, 30, 'break is 30 minutes');

    // End is exactly an 8h span after start, same-day, formatted HH:MM.
    assert.match(row.endTime, /^\d{2}:\d{2}$/);
    const [sh, sm] = row.startTime.split(':').map(Number);
    const [eh, em] = row.endTime.split(':').map(Number);
    assert.equal((eh * 60 + em) - (sh * 60 + sm), 8 * 60, '8h span');

    // 8h span minus 30m break = 7.5 worked hours.
    assert.equal(row.workedHours, '7.5');
    assert.ok(Number(row.workedHours) >= 7 && Number(row.workedHours) <= 8);
  }
});

test('metrics: agentsScheduled, avgStart, totalShiftHours, coveragePct are computed correctly', () => {
  // Hand-checkable roster:
  //   ada   -> 08:00 (480)   grace -> 10:00 (600)   alan -> 14:00 (840)
  //   total start minutes = 1920, avg = 640 = "10:40"
  //   worked hours each = 7.5, total = 22.5
  const { metrics, rows } = buildScheduleDemoData([
    makeAgent('Ada Lovelace', 'ada'),
    makeAgent('Grace Hopper', 'grace'),
    makeAgent('Alan Turing', 'alan')
  ], { date: '2026-07-15' });

  assert.equal(metrics.agentsScheduled, 3);
  assert.equal(metrics.agentsScheduled, rows.length);
  assert.equal(metrics.avgStart, '10:40');
  assert.equal(metrics.totalShiftHours, 22.5);
  assert.equal(metrics.coveragePct, 100);
});

test('metrics for the fabricated fallback match a hand computation', () => {
  // Fallback starts: 09:00, 09:00, 14:00, 10:00, 09:00, 10:00
  //   sum = 3660 minutes, avg = 610 = "10:10"
  //   worked = 6 * 7.5 = 45 hours, coverage = 6/6 = 100%
  const { metrics } = buildScheduleDemoData();

  assert.equal(metrics.agentsScheduled, 6);
  assert.equal(metrics.avgStart, '10:10');
  assert.equal(metrics.totalShiftHours, 45);
  assert.equal(metrics.coveragePct, 100);
});

test('avgStart is a valid HH:MM string and totalShiftHours is non-negative', () => {
  const { metrics } = buildScheduleDemoData([
    makeAgent('Solo Agent', 'solo')
  ]);

  assert.match(metrics.avgStart, /^([01]\d|2[0-3]):[0-5]\d$/);
  assert.ok(metrics.totalShiftHours >= 0);
  assert.ok(metrics.coveragePct >= 0 && metrics.coveragePct <= 100);
});

test('avgStart equals the single agent start when only one row exists', () => {
  const { rows, metrics } = buildScheduleDemoData([makeAgent('Solo Agent', 'solo')]);
  assert.equal(rows.length, 1);
  assert.equal(metrics.avgStart, rows[0].startTime);
});

test('coveragePct reflects scheduled agents over the roster size', () => {
  // Every agent in the roster receives a row, so an ~8h demo shift never drops
  // anyone and coverage is a full 100%.
  const agents = Array.from({ length: 5 }, (_, i) => makeAgent(`Agent ${i}`, `user${i}`));
  const { metrics, rows } = buildScheduleDemoData(agents);
  assert.equal(rows.length, 5);
  assert.equal(metrics.coveragePct, 100);
});

test('reordering the roster does not reuse another agent shift (seeded by username+index)', () => {
  const forward = buildScheduleDemoData([
    makeAgent('Ada Lovelace', 'ada'),
    makeAgent('Grace Hopper', 'grace')
  ]);
  const reversed = buildScheduleDemoData([
    makeAgent('Grace Hopper', 'grace'),
    makeAgent('Ada Lovelace', 'ada')
  ]);

  // Same agents, different index => the per-row shift may differ. We only
  // assert that output stays internally consistent and deterministic, not that
  // a given username always maps to a fixed shift regardless of position.
  const adaForward = forward.rows.find(row => row.username === 'ada');
  const adaReversed = reversed.rows.find(row => row.username === 'ada');
  assert.ok(adaForward && adaReversed);
  assert.ok(ALLOWED_STARTS.includes(adaForward.startTime));
  assert.ok(ALLOWED_STARTS.includes(adaReversed.startTime));
});

test('output shape matches the documented contract', () => {
  const result = buildScheduleDemoData([makeAgent('Ada Lovelace', 'ada')]);

  assert.deepEqual(Object.keys(result).sort(), ['metrics', 'rows']);
  assert.deepEqual(
    Object.keys(result.rows[0]).sort(),
    ['agentName', 'breakMinutes', 'date', 'endTime', 'startTime', 'team', 'username', 'workedHours']
  );
  assert.deepEqual(
    Object.keys(result.metrics).sort(),
    ['agentsScheduled', 'avgStart', 'coveragePct', 'totalShiftHours']
  );
});
