import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plannerSource = readFileSync(new URL('../js/planner.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

test('planner shell delegates rendered table listener binding to Planner Interaction Wiring', () => {
  assert.match(plannerSource, /import\s+\{[^}]*\bbindPlannerTableInteractions\b[^}]*\}\s+from\s+'\.\/planner-interaction-wiring\.js';/s);
  assert.match(plannerSource, /\bbindPlannerTableInteractions\(\{\s*root:\s*document,\s*documentTarget:\s*document,\s*handlers:/s);

  [
    /function addCellEventListeners\(/,
    /document\.querySelectorAll\('\.planner-cell\.selectable'\)/,
    /document\.getElementById\('plannerTableBody'\)/,
    /cell\.addEventListener\('mousedown'/,
    /cell\.addEventListener\('mouseover'/,
    /cell\.addEventListener\('mouseup'/,
    /cell\.addEventListener\('contextmenu'/,
    /plannerBody\.addEventListener\('contextmenu'/,
    /plannerBody\.addEventListener\('click'/
  ].forEach(pattern => {
    assert.doesNotMatch(plannerSource, pattern);
  });
});

test('app shell delegates Planner edit-modal opening and shortcut wiring to Planner Interaction Wiring', () => {
  assert.match(mainSource, /import\s+\{[^}]*\bbindPlannerControlInteractions\b[^}]*\}\s+from\s+'\.\/planner-interaction-wiring\.js';/s);
  assert.match(mainSource, /\bbindPlannerControlInteractions\(\{\s*root:\s*document,\s*documentTarget:\s*document,\s*actions:/s);

  [
    /getElementById\('editSelectionBtn'\)/,
    /getElementById\('cancelSelectionBtn'\)/,
    /addEventListener\('click',\s*openEditModal\)/,
    /addEventListener\('click',\s*clearSelection\)/,
    /document\.addEventListener\('keydown'/,
    /querySelectorAll\('\.planner-cell\.selected'\)/,
    /e\.key\s*===\s*'Enter'/,
    /e\.key\s*===\s*'Escape'/
  ].forEach(pattern => {
    assert.doesNotMatch(mainSource, pattern);
  });
});
