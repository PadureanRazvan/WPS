import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScheduleTemplateCsv } from '../js/schedule-template.js';
import { parseScheduleCsv } from '../js/schedule-import.js';
import { validateScheduleRows } from '../js/schedule-validation.js';

// The two example agents the default template references.
const AGENTS = [
  { username: 'mpopescu', fullName: 'Maria Popescu' },
  { username: 'ionescu', fullName: 'Andrei Ionescu' }
];

// End-to-end contract: the template emits text-guarded dates (="YYYY-MM-DD"),
// the CSV parser reads them, and validation strips the guard and normalizes to
// canonical YYYY-MM-DD with no INVALID_DATE. This is the path a user hits when
// they download the template and import it back unchanged.
test('default template CSV round-trips: guarded dates parse and normalize cleanly', () => {
  const csv = buildScheduleTemplateCsv();
  const parsed = parseScheduleCsv(csv);

  assert.equal(parsed.headerError, null);
  assert.equal(parsed.rows.length, 4);
  // The raw parsed date still carries the Excel guard remnant (=, quotes vary).
  assert.match(parsed.rows[0].date, /^=?"?2026-06-01"?$/);

  const { results, summary } = validateScheduleRows(parsed.rows, AGENTS, { expectedMonth: '2026-06' });

  results.forEach(r => {
    assert.ok(!r.errors.map(e => e.code).includes('INVALID_DATE'));
    assert.match(r.normalizedDate, /^\d{4}-\d{2}-\d{2}$/);
  });
  assert.equal(results[0].normalizedDate, '2026-06-01');
  assert.equal(summary.errors, 0);      // 3 working + 1 day-off, none invalid
  assert.equal(summary.daysOff, 1);
});
