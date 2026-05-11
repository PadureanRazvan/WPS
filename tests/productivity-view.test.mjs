import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadViewModule() {
  try {
    return await import('../js/productivity-view.js');
  } catch (error) {
    assert.fail(`productivity-view.js should be importable: ${error.message}`);
  }
}

function t(key) {
  return ({
    'prod-agents-processed': 'Agents processed',
    'prod-day': 'day',
    'prod-days': 'days',
    'prod-with-data': 'with data',
    'prod-tickets-resolved': 'Tickets resolved',
    'prod-from-xlsx': 'from XLSX',
    'prod-calls-answered': 'Calls answered',
    'prod-from-csv': 'from CSV',
    'prod-average': 'Average',
    'prod-formula': 'items/hour',
    'prod-no-agents': 'No agents',
    'prod-agents-selected': 'Agents selected',
    'prod-days-with-data': 'days with data',
    'prod-total-tickets': 'Total tickets',
    'prod-total-calls': 'Total calls',
    'prod-no-results': 'No results',
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

test('productivity view builds overview stats and table rows', async () => {
  const { buildProductivityOverviewView } = await loadViewModule();

  const view = buildProductivityOverviewView({
    rows: [
      {
        name: 'Ana Pop',
        teamsDisplay: 'CS/IT',
        teams: new Map([['IT', 4], ['CS', 2]]),
        tickets: 6,
        calls: 2,
        total: 8,
        hours: 2.5,
        productivity: 3.2
      }
    ],
    daysInRange: 2,
    datesWithData: 1,
    t
  });

  assert.match(view.statsHtml, /Agents processed/);
  assert.match(view.statsHtml, /1/);
  assert.match(view.statsHtml, /2 days \(1 with data\)/);
  assert.match(view.statsHtml, /Average/);
  assert.match(view.contentHtml, /<table>/);
  assert.match(view.contentHtml, /Ana Pop/);
  assert.match(view.contentHtml, /title="IT: 4, CS: 2"/);
  assert.match(view.contentHtml, /2.5h/);
  assert.match(view.contentHtml, /3.20/);
});

test('productivity view returns empty overview content while keeping zeroed stats', async () => {
  const { buildProductivityOverviewView } = await loadViewModule();

  const view = buildProductivityOverviewView({
    rows: [],
    daysInRange: 1,
    datesWithData: 0,
    t
  });

  assert.match(view.statsHtml, /Agents processed/);
  assert.match(view.statsHtml, /N\/A/);
  assert.match(view.contentHtml, /No agents/);
});

test('productivity view uses overview summary for shop totals when it differs from visible agent rows', async () => {
  const { buildProductivityOverviewView } = await loadViewModule();

  const view = buildProductivityOverviewView({
    rows: [
      {
        name: 'Regular Agent',
        teamsDisplay: 'CS',
        teams: new Map([['CS', 10]]),
        tickets: 10,
        calls: 0,
        total: 10,
        hours: 4,
        productivity: 2.5
      }
    ],
    summary: {
      tickets: 13,
      calls: 0,
      total: 13,
      hours: 4,
      productivity: 3.25
    },
    daysInRange: 1,
    datesWithData: 1,
    t
  });

  assert.match(view.statsHtml, /Tickets resolved[\s\S]*13/);
  assert.match(view.statsHtml, /Average[\s\S]*3\.25/);
  assert.match(view.contentHtml, /Regular Agent/);
  assert.doesNotMatch(view.contentHtml, /13/);
});

test('productivity view builds detail stats and collapses repeated date labels', async () => {
  const { buildProductivityDetailView } = await loadViewModule();

  const view = buildProductivityDetailView({
    rows: [
      {
        dateKey: '2026-05-04',
        dateLabel: 'lun. 4.05',
        isWeekend: false,
        hasData: true,
        name: 'Ana Pop',
        teamsDisplay: 'IT',
        teams: new Map([['IT', 7]]),
        tickets: 5,
        calls: 2,
        total: 7,
        hours: 3.5,
        dayValue: '3.5IT',
        productivity: 2
      },
      {
        dateKey: '2026-05-04',
        dateLabel: 'lun. 4.05',
        isWeekend: false,
        hasData: true,
        name: 'Mihai Popescu',
        teamsDisplay: 'IT',
        teams: new Map([['IT', 4]]),
        tickets: 4,
        calls: 0,
        total: 4,
        hours: 4,
        dayValue: '4IT',
        productivity: 1
      }
    ],
    selectedCount: 2,
    t
  });

  assert.match(view.statsHtml, /Agents selected/);
  assert.match(view.statsHtml, /2/);
  assert.match(view.statsHtml, /1 days with data/);
  assert.match(view.contentHtml, /lun\. 4\.05/);
  assert.match(view.contentHtml, /<td style="font-weight: 300; color: var\(--text-primary\);"><\/td>/);
  assert.match(view.contentHtml, /3.5IT/);
  assert.match(view.contentHtml, /2.00/);
});
