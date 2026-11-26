import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  buildPlannerExportCsv as buildBrowserCsv,
  buildPlannerExportRows as buildBrowserRows
} from '../js/planner-export-command.js';
import { translations } from '../js/config.js';

const require = createRequire(import.meta.url);
const {
  buildDatesForMonths,
  buildPlannerExportCsv: buildServerCsv,
  buildPlannerExportRows: buildServerRows,
  sortAgentsForExport
} = require('../functions/planner-feed.js');

function makeLocalDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function makeRichAgentsFixture() {
  return [
    {
      id: 'agent-b',
      fullName: 'Bianca Popescu',
      username: 'bianca.p',
      contractHours: 6,
      contractType: 'Part-time',
      primaryTeam: 'SK zooplus',
      teams: ['SK', '2L'],
      hireDate: makeLocalDate(2026, 5, 4),
      isActive: true,
      primaryTeamHistory: [
        { from: '2026-05-04', primaryTeam: 'SK zooplus' },
        { from: '2026-05-15', primaryTeam: 'CZ zooplus' }
      ],
      monthlyDays: {
        '2026-05': [
          '6SK', '6SK', '6SK', // Before hireDate (May 4) -> must be blank
          '4SK+22L',           // Day 4: SK -> CS, 2L -> 2L
          '6',                 // Day 5: implicit primaryTeam -> CS
          'Co',                // Day 6: leave code
          '',                  // Day 7: empty with note
          ...Array(24).fill('')
        ]
      },
      monthlyNotes: {
        '2026-05': {
          '3': 'Split, with "quotes"',
          '6': 'Note only cell'
        }
      }
    },
    {
      id: 'agent-a',
      fullName: 'Andrei Ionescu',
      username: 'andrei.i',
      contractHours: 8,
      contractType: 'Full-time',
      primaryTeam: 'RO zooplus',
      teams: ['RO', 'IT'],
      hireDate: makeLocalDate(2026, 1, 1),
      isActive: false,
      inactiveFrom: makeLocalDate(2026, 5, 10),
      inactiveTo: makeLocalDate(2026, 5, 12),
      deactivationNote: 'Medical pause',
      monthlyDays: {
        '2026-05': [
          '8RO',
          '4.5RO+3.5IT',
          'SL',
          ...Array(28).fill('')
        ]
      },
      monthlyNotes: {}
    },
    {
      id: 'agent-c',
      fullName: 'Cristina Default',
      username: 'cristina.d',
      contractHours: 8,
      contractType: 'Full-time',
      primaryTeam: 'HU zooplus',
      teams: ['HU'],
      hireDate: makeLocalDate(2026, 5, 1),
      isActive: true,
      // Migrated agent with no 2026-05 entry -> auto-generated weekdays
      monthlyDays: {},
      monthlyNotes: {}
    },
    {
      id: 'agent-d',
      fullName: 'Dan Legacy',
      username: 'dan.l',
      contractHours: 8,
      contractType: 'Full-time',
      primaryTeam: 'NL zooplus',
      teams: ['NL'],
      isActive: true,
      // Unmigrated legacy days array
      days: ['8NL', '4NL+42L', ...Array(29).fill('')],
      dayNotes: { '1': 'Legacy note' }
    }
  ];
}

test('server plannerFeed produces byte-for-byte identical rows and CSV to browser Export CSV', () => {
  const agents = makeRichAgentsFixture();
  const sortedForBrowser = sortAgentsForExport(agents);
  const start = makeLocalDate(2026, 5, 1);
  const end = makeLocalDate(2026, 5, 31);

  for (const lang of ['ro', 'en', 'it']) {
    const dayNames = translations[lang]['planner-day-names'].split(',');
    const browserRows = buildBrowserRows(sortedForBrowser, start, end, { dayNames });
    const browserCsv = buildBrowserCsv(browserRows);

    const serverDates = buildDatesForMonths(['2026-05']);
    const serverRows = buildServerRows(agents, serverDates, { dayNames });
    const serverCsv = buildServerCsv(serverRows);

    assert.deepEqual(serverRows, browserRows, `Row mismatch for lang=${lang}`);
    assert.equal(serverCsv, browserCsv, `CSV mismatch for lang=${lang}`);
  }
});
