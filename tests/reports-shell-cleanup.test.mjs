import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/reports.js', import.meta.url), 'utf8');

test('reports shell delegates report calculation to the Report Read Model', () => {
  assert.match(source, /import\s+\{\s*buildReportReadModel\s*\}\s+from\s+'\.\/report-read-model\.js';/);
  assert.match(source, /\bbuildReportReadModel\(/);
  assert.doesNotMatch(source, /\bcalculatePlannerReportData\b/);
  assert.doesNotMatch(source, /\bsortBucketsByHours\b/);
});
