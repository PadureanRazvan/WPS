import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadExportModule() {
  try {
    return await import('../js/productivity-export-command.js');
  } catch (error) {
    assert.fail(`productivity-export-command.js should be importable: ${error.message}`);
  }
}

function t(key) {
  return ({
    'prod-summary': 'Summary',
    'prod-per-agent': 'Per Agent',
    'prod-export-overview-sheet': 'Summary',
    'prod-export-detail-sheet': 'Per Agent',
    'prod-export-agent-totals-sheet': 'Agent Totals',
    'prod-export-readme-sheet': 'Read Me',
    'prod-export-generated': 'Generated',
    'prod-export-period': 'Period',
    'prod-export-team-filter': 'Team filter',
    'prod-export-view': 'View',
    'prod-export-agents': 'Agents',
    'prod-export-days': 'Days',
    'prod-export-dates-with-data': 'Dates with data',
    'prod-export-summary-note': 'Current Productivity selection export',
    'prod-all-teams': 'All',
    'th-agent': 'Agent',
    'th-teams': 'Teams',
    'th-tickets': 'Tickets',
    'th-calls': 'Calls',
    'th-total': 'Total',
    'th-hours-worked': 'Hours worked',
    'th-productivity': 'Productivity',
    'th-date': 'Date',
    'th-schedule': 'Schedule',
    'th-hours': 'Hours'
  })[key] || key;
}

test('buildProductivitySelectionWorkbookModel describes the current summary selection', async () => {
  const { buildProductivitySelectionWorkbookModel } = await loadExportModule();

  const model = buildProductivitySelectionWorkbookModel({
    view: 'overview',
    rows: [
      {
        name: 'Ada Planner',
        teamsDisplay: 'RO/IT',
        tickets: 12,
        calls: 3,
        total: 15,
        hours: 7.5,
        productivity: 2
      }
    ],
    summary: {
      tickets: 12,
      calls: 3,
      total: 15,
      hours: 7.5,
      productivity: 2
    },
    start: new Date('2026-06-15T00:00:00'),
    end: new Date('2026-06-18T00:00:00'),
    teamFilter: 'all',
    daysInRange: 4,
    datesWithData: 3,
    now: new Date('2026-06-23T10:30:00'),
    t
  });

  assert.equal(model.filename, 'productivity-summary-2026-06-15-to-2026-06-18.xlsx');
  assert.deepEqual(model.sheets.map(sheet => sheet.name), ['Read Me', 'Summary']);
  assert.deepEqual(model.sheets[0].rows.slice(0, 6), [
    ['Current Productivity selection export'],
    ['Generated', '2026-06-23 10:30'],
    ['Period', '2026-06-15 to 2026-06-18'],
    ['View', 'Summary'],
    ['Team filter', 'All'],
    ['Days', 4]
  ]);
  assert.deepEqual(model.sheets[1].rows, [
    ['Agent', 'Teams', 'Tickets', 'Calls', 'Total', 'Hours worked', 'Productivity'],
    ['Ada Planner', 'RO/IT', 12, 3, 15, 7.5, 2]
  ]);
  assert.equal(model.sheets[1].columns[0].width, 28);
  assert.equal(model.sheets[1].columns[6].format, '0.00');
});

test('buildProductivitySelectionWorkbookModel describes the current per-agent selection', async () => {
  const { buildProductivitySelectionWorkbookModel } = await loadExportModule();

  const model = buildProductivitySelectionWorkbookModel({
    view: 'detail',
    detailRows: [
      {
        dateKey: '2026-06-15',
        dateLabel: 'lun. 15.06',
        name: 'Ada Planner',
        teamsDisplay: 'RO',
        tickets: 5,
        calls: 2,
        total: 7,
        dayValue: '8RO',
        hours: 8,
        productivity: 0.875
      }
    ],
    selectedCount: 1,
    start: new Date('2026-06-15T00:00:00'),
    end: new Date('2026-06-18T00:00:00'),
    teamFilter: 'all',
    daysInRange: 4,
    datesWithData: 1,
    now: new Date('2026-06-23T10:30:00'),
    t
  });

  assert.equal(model.filename, 'productivity-per-agent-2026-06-15-to-2026-06-18.xlsx');
  assert.deepEqual(model.sheets.map(sheet => sheet.name), ['Read Me', 'Per Agent', 'Agent Totals']);
  assert.deepEqual(model.sheets[1].rows, [
    ['Date', 'Agent', 'Teams', 'Tickets', 'Calls', 'Total', 'Schedule', 'Hours', 'Productivity'],
    ['2026-06-15', 'Ada Planner', 'RO', 5, 2, 7, '8RO', 8, 0.875]
  ]);
  assert.equal(model.sheets[1].columns[8].format, '0.00');
  assert.deepEqual(model.sheets[2].rows, [
    ['Agent', 'Teams', 'Tickets', 'Calls', 'Total', 'Hours worked', 'Productivity'],
    ['Ada Planner', 'RO', 5, 2, 7, 8, 0.875]
  ]);
});

test('buildXlsxWorkbook creates a downloadable workbook package with visible worksheet XML', async () => {
  const { buildXlsxWorkbook } = await loadExportModule();

  const bytes = buildXlsxWorkbook({
    sheets: [
      {
        name: 'Summary',
        columns: [{ width: 20 }, { width: 14 }],
        rows: [
          ['Agent', 'Total'],
          ['Ada Planner', 15]
        ]
      }
    ]
  });
  const text = new TextDecoder().decode(bytes);

  assert.ok(bytes instanceof Uint8Array);
  assert.match(text, /\[Content_Types\]\.xml/);
  assert.match(text, /xl\/worksheets\/sheet1\.xml/);
  assert.match(text, /Ada Planner/);
  assert.match(text, /<sheet name="Summary" sheetId="1"/);
});

test('exportProductivityWorkbook downloads XLSX bytes with the model filename', async () => {
  const { exportProductivityWorkbook } = await loadExportModule();
  const calls = [];

  exportProductivityWorkbook({
    model: {
      filename: 'productivity-summary-2026-06-15-to-2026-06-18.xlsx',
      sheets: [
        {
          name: 'Summary',
          columns: [{ width: 20 }],
          rows: [['Agent'], ['Ada Planner']]
        }
      ]
    },
    downloadBinaryFile: (...args) => calls.push(args)
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'productivity-summary-2026-06-15-to-2026-06-18.xlsx');
  assert.equal(calls[0][2], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.ok(calls[0][1] instanceof Uint8Array);
});
