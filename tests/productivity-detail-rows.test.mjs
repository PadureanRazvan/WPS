import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadDetailRowsModule() {
  try {
    return await import('../js/productivity-detail-rows.js');
  } catch (error) {
    assert.fail(`productivity-detail-rows.js should be importable: ${error.message}`);
  }
}

function makeAgent(overrides = {}) {
  return {
    fullName: 'Ana Pop',
    username: 'Ana Pop_fsp',
    primaryTeam: 'IT zooplus',
    monthlyDays: {
      '2026-05': ['4IT+4CS', '8CS']
    },
    ...overrides
  };
}

function uploadedEntry(originalName, itemField, itemsByTeam) {
  const total = Object.values(itemsByTeam).reduce((sum, count) => sum + count, 0);
  return {
    originalName,
    [itemField]: total,
    teams: new Map(Object.entries(itemsByTeam))
  };
}

test('detail rows combine single-date tickets and calls by normalized team', async () => {
  const { getProductivityDataForSingleDate } = await loadDetailRowsModule();
  const dataByDate = new Map([
    ['2026-05-01', {
      ticketsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop_fsp', 'tickets', { IT: 5 })]
      ]),
      callsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop_fsp', 'calls', { IT: 2, CS: 1 })]
      ])
    }]
  ]);

  const data = getProductivityDataForSingleDate(dataByDate, '2026-05-01', 'ana pop');

  assert.equal(data.tickets, 5);
  assert.equal(data.calls, 3);
  assert.equal(data.teams.get('IT'), 7);
  assert.equal(data.teams.get('CS'), 1);
});

test('detail rows build per-agent day rows and exclude report-role agents', async () => {
  const { buildProductivityDetailRows } = await loadDetailRowsModule();
  const agents = [
    makeAgent(),
    makeAgent({
      fullName: 'QA Agent',
      username: 'QA Agent_fsp',
      primaryTeam: 'QA Quality Assurance',
      monthlyDays: {
        '2026-05': ['8QA', '8QA']
      }
    })
  ];
  const dataByDate = new Map([
    ['2026-05-01', {
      ticketsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop_fsp', 'tickets', { IT: 5 })],
        ['qa agent', uploadedEntry('QA Agent_fsp', 'tickets', { CS: 99 })]
      ]),
      callsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop_fsp', 'calls', { CS: 3 })]
      ])
    }]
  ]);

  const rows = buildProductivityDetailRows({
    dataByDate,
    agents,
    selectedAgents: new Set(['ana pop', 'qa agent']),
    start: new Date('2026-05-01T00:00:00'),
    end: new Date('2026-05-02T00:00:00')
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].dateKey, '2026-05-01');
  assert.match(rows[0].dateLabel, /1\.05/);
  assert.equal(rows[0].hasData, true);
  assert.equal(rows[0].name, 'Ana Pop');
  assert.equal(rows[0].teamsDisplay, 'CS/IT');
  assert.equal(rows[0].tickets, 5);
  assert.equal(rows[0].calls, 3);
  assert.equal(rows[0].total, 8);
  assert.equal(rows[0].hours, 8);
  assert.equal(rows[0].dayValue, '4IT+4CS');
  assert.equal(rows[0].productivity, 1);

  assert.equal(rows[1].dateKey, '2026-05-02');
  assert.equal(rows[1].hasData, false);
  assert.equal(rows[1].teamsDisplay, 'CS');
  assert.equal(rows[1].total, 0);
  assert.equal(rows[1].hours, 8);

  assert.equal(rows.some(row => row.name === 'QA Agent'), false);
});

test('detail rows split tickets and calls when a team filter is active', async () => {
  const { buildProductivityDetailRows } = await loadDetailRowsModule();
  const agents = [makeAgent()];
  const dataByDate = new Map([
    ['2026-05-01', {
      ticketsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop_fsp', 'tickets', { IT: 5 })]
      ]),
      callsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop_fsp', 'calls', { CS: 3 })]
      ])
    }]
  ]);

  const rows = buildProductivityDetailRows({
    dataByDate,
    agents,
    selectedAgents: new Set(['ana pop']),
    start: new Date('2026-05-01T00:00:00'),
    end: new Date('2026-05-02T00:00:00'),
    teamFilter: 'IT'
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].teamsDisplay, 'IT');
  assert.equal(rows[0].tickets, 5);
  assert.equal(rows[0].calls, 0);
  assert.equal(rows[0].total, 5);
  assert.equal(rows[0].hours, 4);
  assert.equal(rows[0].productivity, 1.25);
});
