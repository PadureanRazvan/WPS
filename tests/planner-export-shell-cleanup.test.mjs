import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plannerSource = readFileSync(new URL('../js/planner.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('planner shell exposes a CSV export button in the planner toolbar', () => {
  assert.match(indexSource, /id="plannerExportBtn"/);
  assert.match(indexSource, /class="[^"]*\bplanner-export-btn\b[^"]*"/);
  assert.match(indexSource, /data-translate="planner-export"/);
});

test('planner shell wires the export button to the planner export command', () => {
  assert.match(plannerSource, /from\s+'\.\/planner-export-command\.js';/);
  assert.match(plannerSource, /getElementById\('plannerExportBtn'\)/);
  assert.match(plannerSource, /addEventListener\('click',\s*exportToCSV\)/);
  assert.match(plannerSource, /\bbuildPlannerExportRows\(plannerData,/);
  assert.match(plannerSource, /\bdownloadPlannerExportCsv\(/);
});
