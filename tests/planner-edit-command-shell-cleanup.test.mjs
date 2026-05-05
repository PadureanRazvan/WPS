import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/planner.js', import.meta.url), 'utf8');

test('planner shell delegates edit command rules to the Planner Edit Command', () => {
  assert.match(source, /import\s+\{[^}]*\bbuildPlannerEditCommand\b[^}]*\}\s+from\s+'\.\/planner-edit-command\.js';/s);
  assert.match(source, /\bbuildPlannerEditCommand\(\s*plannerData\s*,\s*selectedCellKeys\s*,\s*newValue\s*,\s*noteText\s*\)/);

  [
    /\bgetAgentDaysForMonth\b/,
    /\bgetAgentNotesForMonth\b/,
    /const updates = new Map\(\);/,
    /selectedCellKeys\.forEach\(key =>/,
    /const snapshot = \[\];/,
    /while \(newDays\.length < 31\)/,
    /previousDays: \[\.\.\.daysArray\]/,
    /newDayNotes\[dayIndex\.toString\(\)\] = noteText/
  ].forEach(pattern => {
    assert.doesNotMatch(source, pattern);
  });
});
