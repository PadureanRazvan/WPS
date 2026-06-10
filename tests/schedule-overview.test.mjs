import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildScheduleOverview } from '../js/schedule-overview.js';

// Two working shifts (one per agent) plus one day-off row for an existing agent.
const ROWS = [
  { agentUsername: 'b', agentName: 'Bob', date: '2026-06-02', startTime: '10:00', endTime: '18:00', breakMinutes: 30, workedMinutes: 450, status: 'ok' },
  { agentUsername: 'a', agentName: 'Ana', date: '2026-06-01', startTime: '08:00', endTime: '16:00', breakMinutes: 30, workedMinutes: 450, status: 'ok' },
  { agentUsername: 'a', agentName: 'Ana', date: '2026-06-02', startTime: '', endTime: '', breakMinutes: 0, workedMinutes: 0, status: 'dayoff' }
];

test('metrics count unique working agents, total hours, average start and coverage', () => {
  const { metrics } = buildScheduleOverview(ROWS, { rosterSize: 4 });
  assert.equal(metrics.agentsScheduled, 2);   // a + b; the day-off row adds no new agent
  assert.equal(metrics.totalShifts, 2);
  assert.equal(metrics.daysOff, 1);
  assert.equal(metrics.totalShiftHours, 15);  // 7.5h + 7.5h
  assert.equal(metrics.avgStart, '09:00');    // mean of 08:00 and 10:00
  assert.equal(metrics.coveragePct, 50);      // 2 of 4
});

test('rows are sorted by date then agent, and day-off worked hours are blank', () => {
  const { rows } = buildScheduleOverview(ROWS, { rosterSize: 4 });
  assert.deepEqual(
    rows.map(r => `${r.date}:${r.agentUsername}`),
    ['2026-06-01:a', '2026-06-02:a', '2026-06-02:b']
  );
  assert.equal(rows.find(r => r.status === 'dayoff').workedHours, '');
  assert.equal(rows.find(r => r.status === 'ok').workedHours, '7.5');
});

test('coverage is 0 when roster size is unknown, and empty input is handled', () => {
  assert.equal(buildScheduleOverview(ROWS).metrics.coveragePct, 0);
  const empty = buildScheduleOverview([], { rosterSize: 3 });
  assert.equal(empty.rows.length, 0);
  assert.equal(empty.metrics.agentsScheduled, 0);
  assert.equal(empty.metrics.avgStart, '');
  assert.equal(empty.metrics.totalShiftHours, 0);
});

test('input array is not mutated in place', () => {
  const input = ROWS.slice();
  const snapshot = input.map(r => r.agentUsername + r.date);
  buildScheduleOverview(input, { rosterSize: 4 });
  assert.deepEqual(input.map(r => r.agentUsername + r.date), snapshot);
});
