import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/planner.js', import.meta.url), 'utf8');

test('planner shell delegates table rendering to the Planner Table View', () => {
  assert.match(source, /import\s+\{[^}]*\brenderPlannerTableView\b[^}]*\}\s+from\s+'\.\/planner-table-view\.js';/s);
  assert.match(source, /\brenderPlannerTableView\(tableContainer,\s*readModel,/);

  [
    /function createTextHeader\(/,
    /function renderPlannerHeader\(/,
    /function renderAgentRow\(/,
    /function renderPlannerCell\(/,
    /function appendPlannerCellText\(/,
    /function applyPlannerCellPresentation\(/,
    /document\.createElement\('table'\)/,
    /tbody\.id\s*=\s*'plannerTableBody'/,
    /cell\.dataset\.rawValue\s*=/,
    /cell\.style\.textAlign\s*=/
  ].forEach(pattern => {
    assert.doesNotMatch(source, pattern);
  });
});
