import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/planner.js', import.meta.url), 'utf8');

test('planner shell delegates read-model rules to the Planner Read Model', () => {
  assert.match(source, /import\s+\{[^}]*\bbuildPlannerReadModel\b[^}]*\}\s+from\s+'\.\/planner-read-model\.js';/s);
  assert.match(source, /\bbuildPlannerReadModel\(/);

  [
    /function getFilteredAgents\(/,
    /function getCellClass\(/,
    /function formatCellContent\(/,
    /function applyDynamicFontSizing\(/,
    /function calculateAgentTotalHours\(/,
    /const dayCells = \[\]/,
    /let weeklyHours = 0/,
    /cell\.dataset\.rawValue = dayValue/
  ].forEach(pattern => {
    assert.doesNotMatch(source, pattern);
  });
});
