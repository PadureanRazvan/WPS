import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadDashboardMetricsModule() {
  try {
    return await import('../js/productivity-dashboard-metrics.js');
  } catch (error) {
    assert.fail(`productivity-dashboard-metrics.js should be importable: ${error.message}`);
  }
}

function uploadedEntry(originalName, totals, teams) {
  return {
    originalName,
    ...totals,
    teams: new Map(Object.entries(teams))
  };
}

function dateEntry({ ticketsData = null, callsData = null } = {}) {
  return { ticketsData, callsData };
}

test('dashboard average uses only the last seven uploaded dates', async () => {
  const { buildAverageProductivitySummary } = await loadDashboardMetricsModule();
  const dataByDate = new Map();

  for (let day = 1; day <= 8; day++) {
    const dateKey = `2026-05-${String(day).padStart(2, '0')}`;
    dataByDate.set(dateKey, dateEntry({
      ticketsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop_fsp', { tickets: day === 1 ? 80 : 8 }, { IT: 8 })]
      ]),
      callsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop_fsp', { calls: 2 }, { IT: 2 })]
      ])
    }));
  }

  const result = buildAverageProductivitySummary({
    dataByDate,
    agents: [{ fullName: 'Ana Pop', username: 'Ana Pop_fsp' }],
    getEligibleHoursForRange: () => 5
  });

  assert.deepEqual(result, {
    average: 70 / 35,
    days: 7
  });
});

test('dashboard trend builds a full-month team series from uploaded Productivity Data', async () => {
  const { buildProductivityTrendData } = await loadDashboardMetricsModule();
  const dataByDate = new Map([
    ['2026-05-02', dateEntry({
      ticketsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop_fsp', { tickets: 8 }, { IT: 8, OTHER: 5 })]
      ]),
      callsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop_fsp', { calls: 4 }, { IT: 4 })]
      ])
    })],
    ['2026-05-04', dateEntry({
      ticketsData: new Map([
        ['unmatched person', uploadedEntry('Unmatched Person', { tickets: 10 }, { CS: 10 })]
      ])
    })]
  ]);

  const result = buildProductivityTrendData({
    dataByDate,
    agents: [{ fullName: 'Ana Pop', username: 'Ana Pop_fsp' }],
    targetYear: 2026,
    targetMonth: 4,
    getEligibleHoursForTeamInRange: (agent, start, end, team) => team === 'IT' ? 6 : 0
  });

  assert.equal(result.dates.length, 31);
  assert.equal(result.dates[0], '2026-05-01');
  assert.equal(result.dates[30], '2026-05-31');
  assert.deepEqual(Object.keys(result.teams), ['IT']);
  assert.equal(result.teams.IT[0], null);
  assert.equal(result.teams.IT[1], 2);
  assert.equal(result.teams.IT[3], null);
});

test('dashboard trend returns null when no customer-facing uploaded teams are present', async () => {
  const { buildProductivityTrendData } = await loadDashboardMetricsModule();

  const result = buildProductivityTrendData({
    dataByDate: new Map([
      ['2026-05-02', dateEntry({
        ticketsData: new Map([
          ['ana pop', uploadedEntry('Ana Pop_fsp', { tickets: 8 }, { OTHER: 8 })]
        ])
      })]
    ]),
    agents: [{ fullName: 'Ana Pop', username: 'Ana Pop_fsp' }],
    targetYear: 2026,
    targetMonth: 4,
    getEligibleHoursForTeamInRange: () => 8
  });

  assert.equal(result, null);
});
