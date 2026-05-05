import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadProductivityCalculationModule() {
  try {
    return await import('../js/productivity-calculation.js');
  } catch (error) {
    assert.fail(`productivity-calculation.js should be importable: ${error.message}`);
  }
}

function makeAgent(overrides = {}) {
  return {
    fullName: 'Agent One',
    username: 'Agent One_fsp',
    primaryTeam: 'CS zooplus',
    monthlyDays: {
      '2026-05': ['82L', '4CS+4IT']
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

test('overview calculation excludes report roles and preserves 2L schedule hours', async () => {
  const { calculateProductivityOverview } = await loadProductivityCalculationModule();
  const agents = [
    makeAgent(),
    makeAgent({
      fullName: 'QA Agent',
      username: 'QA Agent_fsp',
      primaryTeam: 'QA Quality Assurance',
      monthlyDays: { '2026-05': ['8QA', '8QA'] }
    })
  ];
  const dataByDate = new Map([
    ['2026-05-01', {
      ticketsData: new Map([
        ['agent one', uploadedEntry('Agent One_fsp', 'tickets', { CS: 16 })],
        ['qa agent', uploadedEntry('QA Agent_fsp', 'tickets', { CS: 99 })]
      ]),
      callsData: null
    }],
    ['2026-05-02', {
      ticketsData: null,
      callsData: new Map([
        ['agent one', uploadedEntry('Agent One_fsp', 'calls', { IT: 4 })]
      ])
    }]
  ]);

  const { rows, datesWithData } = calculateProductivityOverview({
    agents,
    dataByDate,
    start: new Date('2026-05-01T00:00:00'),
    end: new Date('2026-05-02T00:00:00')
  });

  assert.equal(datesWithData, 2);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Agent One');
  assert.equal(rows[0].tickets, 16);
  assert.equal(rows[0].calls, 4);
  assert.equal(rows[0].total, 20);
  assert.equal(rows[0].hours, 16);
  assert.equal(rows[0].productivity, 1.25);
  assert.equal(rows[0].teamsDisplay, 'CS/IT');
});

test('overview calculation filters items and hours by selected team', async () => {
  const { calculateProductivityOverview } = await loadProductivityCalculationModule();
  const agents = [makeAgent()];
  const dataByDate = new Map([
    ['2026-05-01', {
      ticketsData: new Map([
        ['agent one', uploadedEntry('Agent One_fsp', 'tickets', { CS: 16 })]
      ]),
      callsData: null
    }],
    ['2026-05-02', {
      ticketsData: null,
      callsData: new Map([
        ['agent one', uploadedEntry('Agent One_fsp', 'calls', { IT: 4 })]
      ])
    }]
  ]);

  const { rows } = calculateProductivityOverview({
    agents,
    dataByDate,
    start: new Date('2026-05-01T00:00:00'),
    end: new Date('2026-05-02T00:00:00'),
    teamFilter: 'CS'
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].tickets, 16);
  assert.equal(rows[0].calls, 0);
  assert.equal(rows[0].total, 16);
  assert.equal(rows[0].hours, 4);
  assert.equal(rows[0].productivity, 4);
  assert.equal(rows[0].teamsDisplay, 'CS');
});
