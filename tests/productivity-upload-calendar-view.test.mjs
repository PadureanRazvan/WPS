import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadCalendarViewModule() {
  try {
    return await import('../js/productivity-upload-calendar-view.js');
  } catch (error) {
    assert.fail(`productivity-upload-calendar-view.js should be importable: ${error.message}`);
  }
}

function t(key) {
  return ({
    'prod-data-for': 'Data for',
    'prod-data-exists': 'already exists',
    'prod-date-selected': 'Selected date',
    'prod-can-upload': 'can upload',
    'prod-data-uploaded-for': 'Data uploaded for',
    'prod-agents-from-tickets': 'agents from tickets',
    'prod-agents-from-calls': 'agents from calls',
    'prod-can-add-file': 'can add another file'
  })[key] || key;
}

function uploadedEntry(originalName, totals, teams) {
  return {
    originalName,
    ...totals,
    teams: new Map(Object.entries(teams))
  };
}

function entry({ ticketsData = null, callsData = null } = {}) {
  return { ticketsData, callsData };
}

function formatDateDisplay(dateKey) {
  return `Display ${dateKey}`;
}

test('upload calendar status view disables uploads when no date is selected', async () => {
  const { buildProductivityUploadDateStatusView } = await loadCalendarViewModule();

  const view = buildProductivityUploadDateStatusView({
    uploadDate: '',
    entry: null,
    formatDateDisplay,
    t
  });

  assert.deepEqual(view, {
    statusDisplay: 'none',
    filesOpacity: '0.4',
    filesPointerEvents: 'none',
    html: ''
  });
});

test('upload calendar status view distinguishes existing data from empty selected dates', async () => {
  const { buildProductivityUploadDateStatusView } = await loadCalendarViewModule();

  const existing = buildProductivityUploadDateStatusView({
    uploadDate: '2026-05-04',
    entry: entry({
      ticketsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop', { tickets: 3 }, { IT: 3 })]
      ])
    }),
    formatDateDisplay,
    t
  });
  const empty = buildProductivityUploadDateStatusView({
    uploadDate: '2026-05-05',
    entry: null,
    formatDateDisplay,
    t
  });

  assert.equal(existing.statusDisplay, 'block');
  assert.equal(existing.filesOpacity, '1');
  assert.match(existing.html, /alert-warning/);
  assert.match(existing.html, /Data for <strong>Display 2026-05-04<\/strong> already exists/);

  assert.equal(empty.statusDisplay, 'block');
  assert.match(empty.html, /Selected date <strong>Display 2026-05-05<\/strong>/);
  assert.match(empty.html, /can upload/);
});

test('upload calendar success view reports uploaded agent counts', async () => {
  const { buildProductivityUploadSuccessView } = await loadCalendarViewModule();

  const html = buildProductivityUploadSuccessView({
    uploadDate: '2026-05-04',
    entry: entry({
      ticketsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop', { tickets: 3 }, { IT: 3 })]
      ]),
      callsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop', { calls: 2 }, { IT: 2 })],
        ['mihai popescu', uploadedEntry('Mihai Popescu', { calls: 1 }, { HU: 1 })]
      ])
    }),
    formatDateDisplay,
    t
  });

  assert.match(html, /Data uploaded for <strong>Display 2026-05-04<\/strong>/);
  assert.match(html, /1 agents from tickets, 2 agents from calls/);
  assert.match(html, /can add another file/);
});

test('upload calendar view builds escaped month grid and selected action state', async () => {
  const { buildProductivityUploadCalendarView } = await loadCalendarViewModule();
  const dataByDate = new Map([
    ['2026-05-05', entry({
      ticketsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop', { tickets: 3 }, { IT: 3 })]
      ]),
      callsData: new Map([
        ['ana pop', uploadedEntry('Ana Pop', { calls: 2 }, { IT: 2 })]
      ])
    })]
  ]);

  const view = buildProductivityUploadCalendarView({
    dataByDate,
    uploadDate: '2026-05-05',
    monthDate: new Date('2026-05-01T00:00:00'),
    today: new Date('2026-05-05T12:00:00'),
    lang: 'en',
    formatDateDisplay: dateKey => `Display <${dateKey}>`
  });

  assert.equal(view.days.length, 42);
  assert.equal(view.days[0], '2026-04-27');
  assert.equal(view.days[41], '2026-06-07');
  assert.equal(view.selectedStatus.isComplete, true);
  assert.match(view.html, /Upload calendar/);
  assert.match(view.html, /data-date="2026-05-05"/);
  assert.match(view.html, /class="upload-calendar-day selected today has-tickets has-calls complete"/);
  assert.match(view.html, /title="Display &lt;2026-05-05&gt;: XLSX and CSV uploaded"/);
  assert.match(view.html, /XLSX · 1/);
  assert.match(view.html, /CSV · 1/);
  assert.doesNotMatch(view.html, /id="uploadCalendarExport" disabled/);
  assert.doesNotMatch(view.html, /id="uploadCalendarDelete" disabled/);
});
