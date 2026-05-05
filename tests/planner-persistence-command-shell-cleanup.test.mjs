import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/planner.js', import.meta.url), 'utf8');

test('planner shell delegates persistence payload rules to the Planner Persistence Command', () => {
  assert.match(
    source,
    /import\s+\{[^}]*\bbuildPlannerMigrationCommands\b[^}]*\bbuildPlannerUndoCommand\b[^}]*\bbuildPlannerClearMonthCommand\b[^}]*\}\s+from\s+'\.\/planner-persistence-command\.js';/s
  );
  assert.match(source, /\bbuildPlannerMigrationCommands\(\s*plannerData\s*,\s*currentMonthKey\s*,\s*migratedAgentIds\s*\)/);
  assert.match(source, /\bbuildPlannerUndoCommand\(\s*snapshot\s*\)/);
  assert.match(source, /\bbuildPlannerClearMonthCommand\(\s*agentId\s*,\s*monthKey\s*,\s*plannerData\s*\)/);

  [
    /!a\.monthlyDays\s*&&\s*a\.days\s*&&\s*Array\.isArray\(a\.days\)/,
    /\[`monthlyDays\.\$\{currentMonthKey\}`\]/,
    /\[`monthlyNotes\.\$\{currentMonthKey\}`\]/,
    /entry\.previousDays/,
    /entry\.previousDayNotes/,
    /Array\(31\)\.fill\(''\)/
  ].forEach(pattern => {
    assert.doesNotMatch(source, pattern);
  });
});
