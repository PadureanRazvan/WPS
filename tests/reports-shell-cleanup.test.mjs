import test from 'node:test';
import assert from 'node:assert/strict';
import { SHERPA_VERSION } from '../js/version.js';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/reports.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const configSource = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');

test('reports shell delegates report calculation to the Report Read Model', () => {
  assert.ok(source.includes(`import { buildReportReadModel } from './report-read-model.js?v=${SHERPA_VERSION.number}';`));
  assert.match(source, /\bbuildReportReadModel\(/);
  assert.doesNotMatch(source, /\bcalculatePlannerReportData\b/);
  assert.doesNotMatch(source, /\bsortBucketsByHours\b/);
});

test('reports shell delegates report HTML to the Reports View Module', () => {
  assert.ok(source.includes(`import { renderReportsView } from './reports-view.js?v=${SHERPA_VERSION.number}';`));
  assert.match(source, /\brenderReportsView\(/);
  assert.doesNotMatch(source, /\brenderHoursTableRows\b/);
  assert.doesNotMatch(source, /\brenderDistributionCards\b/);
  assert.doesNotMatch(source, /\bformatPlannerHoursValue\b/);
  assert.doesNotMatch(source, /dashboard-grid/);
  assert.doesNotMatch(source, /<table/);
});

test('reports shell does not keep Forecast wiring', () => {
  assert.doesNotMatch(source, /forecast/i);
  assert.doesNotMatch(indexSource, /forecastContent/);
  assert.doesNotMatch(configSource, /'forecast-/);
});
