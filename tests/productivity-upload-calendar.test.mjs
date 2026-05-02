import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildProductivityExportCsv,
  getProductivityDateStatus
} from '../js/productivity-upload-calendar.js';

function entry(originalName, totals, teams) {
  return {
    originalName,
    ...totals,
    teams: new Map(Object.entries(teams))
  };
}

test('date status reports whether tickets and calls are uploaded', () => {
  const status = getProductivityDateStatus({
    ticketsData: new Map([['ana', entry('Ana', { tickets: 5 }, { IT: 5 })]]),
    callsData: new Map([['ana', entry('Ana', { calls: 3 }, { IT: 3 })]])
  });

  assert.deepEqual(status, {
    hasTickets: true,
    hasCalls: true,
    ticketAgents: 1,
    callAgents: 1,
    isComplete: true,
    hasAnyData: true
  });
});

test('date status handles partial and empty days', () => {
  assert.equal(getProductivityDateStatus({
    ticketsData: new Map([['ana', entry('Ana', { tickets: 5 }, { IT: 5 })]]),
    callsData: null
  }).isComplete, false);

  assert.equal(getProductivityDateStatus(null).hasAnyData, false);
});

test('export CSV contains parsed tickets and calls by agent and team', () => {
  const csv = buildProductivityExportCsv('2026-05-02', {
    ticketsData: new Map([
      ['ana', entry('Ana, Pop', { tickets: 7 }, { IT: 4, CS: 3 })]
    ]),
    callsData: new Map([
      ['ana', entry('Ana, Pop', { calls: 2 }, { IT: 2 })]
    ])
  });

  assert.equal(csv, [
    'date,file_type,agent,team,count',
    '2026-05-02,tickets,"Ana, Pop",IT,4',
    '2026-05-02,tickets,"Ana, Pop",CS,3',
    '2026-05-02,calls,"Ana, Pop",IT,2'
  ].join('\n'));
});
