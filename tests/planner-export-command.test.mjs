import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlannerExportCsv,
  buildPlannerExportFilename,
  buildPlannerExportRows
} from '../js/planner-export-command.js';

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
      '2026-05': [
        '8RO',
        '4RO+3.5IT',
        'Co',
        '',
        ...Array(27).fill('')
      ]
    },
    monthlyNotes: {
      '2026-05': {
        '1': 'Split shift'
      }
    },
    ...overrides
  };
}

test('buildPlannerExportRows creates separate shop rows with names, contracts, hours, and notes', () => {
  const rows = buildPlannerExportRows(
    [makeAgent()],
    new Date('2026-05-01T00:00:00'),
    new Date('2026-05-04T00:00:00'),
    {
      today: new Date('2026-05-22T12:00:00'),
      dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    }
  );

  assert.deepEqual(rows, [
    {
      month: '2026-05',
      date: '2026-05-01',
      day: 'Fri',
      name: 'Ada Planner',
      username: 'ada.planner',
      contractType: 'Full-time',
      contractHours: '8',
      primaryTeam: 'RO zooplus',
      shop: 'RO',
      plannedHours: '8',
      schedule: '8RO',
      note: ''
    },
    {
      month: '2026-05',
      date: '2026-05-02',
      day: 'Sat',
      name: 'Ada Planner',
      username: 'ada.planner',
      contractType: 'Full-time',
      contractHours: '8',
      primaryTeam: 'RO zooplus',
      shop: 'RO',
      plannedHours: '4',
      schedule: '4RO+3.5IT',
      note: 'Split shift'
    },
    {
      month: '2026-05',
      date: '2026-05-02',
      day: 'Sat',
      name: 'Ada Planner',
      username: 'ada.planner',
      contractType: 'Full-time',
      contractHours: '8',
      primaryTeam: 'RO zooplus',
      shop: 'IT',
      plannedHours: '3.5',
      schedule: '4RO+3.5IT',
      note: 'Split shift'
    },
    {
      month: '2026-05',
      date: '2026-05-03',
      day: 'Sun',
      name: 'Ada Planner',
      username: 'ada.planner',
      contractType: 'Full-time',
      contractHours: '8',
      primaryTeam: 'RO zooplus',
      shop: 'Co',
      plannedHours: '0',
      schedule: 'Co',
      note: ''
    }
  ]);
});

test('buildPlannerExportRows honors planner filters', () => {
  const rows = buildPlannerExportRows(
    [
      makeAgent({ id: 'agent-1', teams: ['RO'], monthlyDays: { '2026-05': ['8RO', ...Array(30).fill('')] } }),
      makeAgent({ id: 'agent-2', fullName: 'Bea Scheduler', username: 'bea', teams: ['IT'], monthlyDays: { '2026-05': ['8IT', ...Array(30).fill('')] } })
    ],
    new Date('2026-05-01T00:00:00'),
    new Date('2026-05-01T00:00:00'),
    {
      filterState: {
        selectedTeams: ['IT'],
        selectedAgents: [],
        filterType: 'team'
      }
    }
  );

  assert.deepEqual(rows.map(row => row.name), ['Bea Scheduler']);
  assert.deepEqual(rows.map(row => row.shop), ['IT']);
});

test('buildPlannerExportCsv emits user-friendly headers and escaped values', () => {
  const csv = buildPlannerExportCsv([
    {
      month: '2026-05',
      date: '2026-05-01',
      day: 'Fri',
      name: 'Ada "Planner"',
      username: 'ada,planner',
      contractType: 'Full-time',
      contractHours: '8',
      primaryTeam: 'RO zooplus',
      shop: 'RO',
      plannedHours: '8',
      schedule: '8RO',
      note: 'Needs, quote "safe"'
    }
  ]);

  assert.equal(csv, [
    'Month,Date,Day,Name,Username,Contract Type,Contract Hours,Primary Team,Shop,Planned Hours,Schedule,Note',
    '2026-05,2026-05-01,Fri,"Ada ""Planner""","ada,planner",Full-time,8,RO zooplus,RO,8,8RO,"Needs, quote ""safe"""'
  ].join('\n'));
});

test('buildPlannerExportFilename names month and range exports clearly', () => {
  assert.equal(
    buildPlannerExportFilename(new Date('2026-05-01T00:00:00'), new Date('2026-05-31T00:00:00')),
    'planner-2026-05.csv'
  );
  assert.equal(
    buildPlannerExportFilename(new Date('2026-05-03T00:00:00'), new Date('2026-05-09T00:00:00')),
    'planner-2026-05-03-to-2026-05-09.csv'
  );
});
