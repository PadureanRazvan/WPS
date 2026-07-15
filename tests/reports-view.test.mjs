import test from 'node:test';
import assert from 'node:assert/strict';

async function loadReportsViewModule() {
  try {
    return await import('../js/reports-view.js');
  } catch (error) {
    assert.fail(`reports-view.js should be importable: ${error.message}`);
  }
}

const labels = {
  selectRange: 'Select a range',
  noData: 'No planned data',
  hoursPerShop: 'Planned Hours per Shop',
  distribution: 'Agent Distribution per Shop',
  roleHours: 'Planned TL/QA Hours',
  roleDistribution: 'TL/QA Agent Distribution',
  shop: 'Shop',
  totalHours: 'Total Hours',
  agentCount: 'Agents',
  agentsHours: 'agents',
  hoursUnit: 'hours',
  period: 'Reporting period',
  total: 'TOTAL'
};

function makeReportModel() {
  return {
    hasData: true,
    range: { label: '01.05.2026 - 02.05.2026' },
    shop: {
      grandTotal: 16.5,
      buckets: [
        {
          name: 'RO <Shop>',
          totalHours: 12.5,
          agentCount: 2,
          agents: [
            { name: 'Ana & Bob', hours: 8 },
            { name: 'Mallory <script>', hours: 4.5 }
          ]
        },
        {
          name: 'IT zooplus',
          totalHours: 4,
          agentCount: 1,
          agents: [{ name: 'Iris', hours: 4 }]
        }
      ]
    },
    roles: {
      grandTotal: 8,
      buckets: [
        {
          name: 'Team Lead',
          totalHours: 8,
          agentCount: 1,
          agents: [{ name: 'Lead Agent', hours: 8 }]
        }
      ]
    }
  };
}

test('renders report placeholders for missing ranges and empty read models', async () => {
  const { buildReportsHtml } = await loadReportsViewModule();

  assert.match(buildReportsHtml(null, labels), /class="reports-status" role="status">Select a range/);
  assert.match(
    buildReportsHtml({ hasData: false, range: { label: '01.05.2026 - 02.05.2026' }, shop: { buckets: [] }, roles: { buckets: [] } }, labels),
    /No planned data/
  );
});

test('renders shop and Report Role sections from a Report Read Model', async () => {
  const { buildReportsHtml } = await loadReportsViewModule();
  const html = buildReportsHtml(makeReportModel(), labels);

  assert.match(html, /<span>Reporting period<\/span>/);
  assert.match(html, /<strong>01\.05\.2026 - 02\.05\.2026<\/strong>/);
  assert.match(html, /id="report-domain-shops"[^>]*>Planned Hours per Shop/);
  assert.match(html, /id="report-distribution-shops"[^>]*>Agent Distribution per Shop/);
  assert.match(html, /id="report-domain-roles"[^>]*>Planned TL\/QA Hours/);
  assert.match(html, /id="report-distribution-roles"[^>]*>TL\/QA Agent Distribution/);
  assert.match(html, /RO &lt;Shop&gt;/);
  assert.match(html, /12\.5/);
  assert.match(html, /16\.5/);
  assert.match(html, /4\.5 <span>hours<\/span>/);
  assert.match(html, /2 agents &middot; 12\.5 hours/);
});

test('uses semantic report tables and native collapsible distribution groups', async () => {
  const { buildReportsHtml } = await loadReportsViewModule();
  const html = buildReportsHtml(makeReportModel(), labels);

  assert.match(html, /<caption class="visually-hidden">Planned Hours per Shop &mdash; 01\.05\.2026 - 02\.05\.2026<\/caption>/);
  assert.equal((html.match(/<th scope="col">/g) || []).length, 6);
  assert.ok((html.match(/<th scope="row">/g) || []).length >= 5);
  assert.equal((html.match(/<details class="report-team-card" open>/g) || []).length, 3);
  assert.doesNotMatch(html, /class="chart-container"|class="stat-card"|style="/);
});

test('escapes report labels, bucket names, and agent names', async () => {
  const { buildReportsHtml } = await loadReportsViewModule();
  const html = buildReportsHtml(makeReportModel(), {
    ...labels,
    hoursPerShop: 'Hours <unsafe>'
  });

  assert.match(html, /Hours &lt;unsafe&gt;/);
  assert.match(html, /Ana &amp; Bob/);
  assert.match(html, /Mallory &lt;script&gt;/);
  assert.doesNotMatch(html, /<unsafe>/);
  assert.doesNotMatch(html, /Mallory <script>/);
});

test('renders a Report View into a supplied container', async () => {
  const { renderReportsView } = await loadReportsViewModule();
  const container = { innerHTML: '' };

  renderReportsView(container, makeReportModel(), labels);

  assert.match(container.innerHTML, /Planned Hours per Shop/);
});
