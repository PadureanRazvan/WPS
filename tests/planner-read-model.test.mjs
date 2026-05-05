import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlannerReadModel,
  filterPlannerAgents,
  formatPlannerCellContent,
  getPlannerCellClassNames,
  getPlannerCellTextSizeClass
} from '../js/planner-read-model.js';

function makeAgent(overrides = {}) {
  return {
    id: 'agent-1',
    fullName: 'Ada Planner',
    username: 'ada.planner',
    contractHours: 8,
    contractType: 'Full-time',
    primaryTeam: 'RO zooplus',
    teams: ['RO'],
    hireDate: new Date('2026-05-01T00:00:00'),
    isActive: true,
    monthlyDays: {
      '2026-05': Array(31).fill('')
    },
    monthlyNotes: {},
    ...overrides
  };
}

function setMonthDays(values) {
  return [
    ...values,
    ...Array(Math.max(0, 31 - values.length)).fill('')
  ];
}

test('formatPlannerCellContent preserves leave codes and formats planner entries', () => {
  assert.deepEqual(formatPlannerCellContent(''), []);
  assert.deepEqual(formatPlannerCellContent('Co'), ['Co']);
  assert.deepEqual(formatPlannerCellContent('8 RO'), ['8RO']);
  assert.deepEqual(formatPlannerCellContent('7.52L'), ['7.52L']);
  assert.deepEqual(formatPlannerCellContent('4RO+3.5IT'), ['4RO', '3.5IT']);
  assert.deepEqual(formatPlannerCellContent('2QA+6TL'), ['2QA', '6TL']);
});

test('getPlannerCellClassNames describes empty, leave, working, multi-team, weekend, and today cells', () => {
  assert.deepEqual(
    getPlannerCellClassNames('', new Date('2026-05-04T00:00:00')),
    ['day-cell', 'empty']
  );

  assert.deepEqual(
    getPlannerCellClassNames('Co', new Date('2026-05-04T00:00:00')),
    ['day-cell', 'holiday']
  );

  assert.deepEqual(
    getPlannerCellClassNames('8RO', new Date('2026-05-04T00:00:00')),
    ['day-cell', 'working']
  );

  assert.deepEqual(
    getPlannerCellClassNames('4RO+42L', new Date('2026-05-09T00:00:00'), {
      today: new Date('2026-05-09T12:00:00')
    }),
    ['day-cell', 'working', 'multi-team', 'weekend', 'today']
  );

  assert.deepEqual(
    getPlannerCellClassNames('DZ', new Date('2026-05-10T00:00:00')),
    ['day-cell', 'deactivated', 'weekend']
  );
});

test('getPlannerCellTextSizeClass keeps existing sizing thresholds', () => {
  assert.equal(getPlannerCellTextSizeClass(['8RO']), '');
  assert.equal(getPlannerCellTextSizeClass(['1234567890']), 'medium-text');
  assert.equal(getPlannerCellTextSizeClass(['1234567890123']), 'small-text');
  assert.equal(getPlannerCellTextSizeClass(['1234567890123456']), 'tiny-text');
  assert.equal(getPlannerCellTextSizeClass(['4RO', '2IT', '2HU']), 'medium-text');
  assert.equal(getPlannerCellTextSizeClass(['4RO', '2IT', '1HU', '1QA']), 'small-text');
});

test('filterPlannerAgents gives selected agents precedence over team filters and preserves search narrowing', () => {
  const agents = [
    makeAgent({ id: 'ada', fullName: 'Ada Planner', username: 'ada', teams: ['RO'] }),
    makeAgent({ id: 'bea', fullName: 'Bea Scheduler', username: 'bea', teams: ['IT'] }),
    makeAgent({ id: 'cal', fullName: 'Cal Planner', username: 'cal', teams: ['QA'] })
  ];

  assert.deepEqual(
    filterPlannerAgents(agents, { selectedTeams: ['IT'], selectedAgents: ['ada'], filterType: 'agent', agentSearchTerm: '' }).map(agent => agent.id),
    ['ada']
  );

  assert.deepEqual(
    filterPlannerAgents(agents, { selectedTeams: ['IT'], selectedAgents: ['ada'], filterType: 'agent', agentSearchTerm: 'bea' }).map(agent => agent.id),
    []
  );

  assert.deepEqual(
    filterPlannerAgents(agents, { selectedTeams: ['IT'], selectedAgents: [], filterType: 'team' }).map(agent => agent.id),
    ['bea']
  );

  assert.deepEqual(
    filterPlannerAgents(agents, { selectedTeams: ['all'], selectedAgents: [], filterType: 'agent', agentSearchTerm: 'planner' }).map(agent => agent.id),
    ['ada', 'cal']
  );
});

test('buildPlannerReadModel returns table-ready rows with notes, totals, and single-month delete keys', () => {
  const agent = makeAgent({
    monthlyDays: {
      '2026-05': setMonthDays(['8RO', '4RO+42L', 'Co', ''])
    },
    monthlyNotes: {
      '2026-05': { '1': 'Split shop and 2L' }
    }
  });

  const model = buildPlannerReadModel(
    [agent],
    new Date('2026-05-01T00:00:00'),
    new Date('2026-05-04T00:00:00'),
    {
      today: new Date('2026-05-04T12:00:00'),
      viewOptions: { highlightWeekends: true, showWeekTotals: false },
      dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    }
  );

  assert.equal(model.fewDaysView, true);
  assert.equal(model.headers.length, 4);
  assert.equal(model.rows.length, 1);

  const row = model.rows[0];
  assert.equal(row.agentId, 'agent-1');
  assert.equal(row.agentName, 'Ada Planner');
  assert.equal(row.contractHoursLabel, '8h');
  assert.equal(row.deleteMonthKey, '2026-05');
  assert.equal(row.totalHoursLabel, '16h');

  assert.deepEqual(row.cells.map(cell => cell.key), [
    'agent-1|2026-05|0',
    'agent-1|2026-05|1',
    'agent-1|2026-05|2',
    'agent-1|2026-05|3'
  ]);
  assert.deepEqual(row.cells[1].displayLines, ['4RO', '42L']);
  assert.equal(row.cells[1].title, 'Split shop and 2L');
  assert.equal(row.cells[3].classNames.includes('today'), true);
});

test('buildPlannerReadModel uses effective days for hire and inactive dates', () => {
  const agent = makeAgent({
    hireDate: new Date('2026-05-03T00:00:00'),
    isActive: false,
    inactiveFrom: new Date('2026-05-04T00:00:00'),
    inactiveTo: new Date('2026-05-04T00:00:00'),
    deactivationNote: 'Inactive one day',
    monthlyDays: {
      '2026-05': setMonthDays(['8RO', '8RO', '8RO', '8RO'])
    }
  });

  const model = buildPlannerReadModel(
    [agent],
    new Date('2026-05-01T00:00:00'),
    new Date('2026-05-04T00:00:00')
  );

  assert.deepEqual(model.rows[0].cells.map(cell => cell.rawValue), ['', '', '8RO', 'DZ']);
  assert.equal(model.rows[0].cells[3].title, 'Inactive one day');
  assert.equal(model.rows[0].totalHoursLabel, '8h');
});

test('buildPlannerReadModel supports week totals and omits delete key across multiple months', () => {
  const agent = makeAgent({
    monthlyDays: {
      '2026-05': setMonthDays(Array(31).fill('8RO')),
      '2026-06': setMonthDays(Array(30).fill('8IT'))
    }
  });

  const model = buildPlannerReadModel(
    [agent],
    new Date('2026-05-31T00:00:00'),
    new Date('2026-06-01T00:00:00'),
    {
      viewOptions: { showWeekTotals: true, highlightWeekends: true },
      dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    }
  );

  assert.equal(model.rows[0].deleteMonthKey, '');
  assert.deepEqual(model.headers.map(header => header.type), ['day', 'week-total', 'day']);
  assert.deepEqual(model.rows[0].cells.map(cell => cell.type), ['day', 'week-total', 'day']);
  assert.equal(model.rows[0].cells[1].totalHoursLabel, '8h');
  assert.equal(model.rows[0].totalHoursLabel, '16h');
});
