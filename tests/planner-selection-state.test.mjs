import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addPlannerDragSelectionCell,
  clearPlannerCellSelection,
  createPlannerSelectionState,
  getPlannerCellSelectionKey,
  getPlannerSelectionCount,
  isPlannerSelectionDragActive,
  stopPlannerCellSelection,
  togglePlannerCellSelection
} from '../js/planner-selection-state.js';

test('getPlannerCellSelectionKey builds stable keys from rendered Planner Cell datasets', () => {
  assert.equal(
    getPlannerCellSelectionKey({ agentId: 'agent-1', month: '2026-05', day: '8' }),
    'agent-1|2026-05|8'
  );

  assert.equal(
    getPlannerCellSelectionKey({ agentId: 'agent-2', monthKey: '2026-06', dayIndex: 0 }),
    'agent-2|2026-06|0'
  );
});

test('togglePlannerCellSelection starts selection and toggles one cell immutably', () => {
  const initial = createPlannerSelectionState();
  const selected = togglePlannerCellSelection(initial, 'agent-1|2026-05|8');

  assert.equal(selected.changed, true);
  assert.equal(selected.isSelected, true);
  assert.equal(selected.cellKey, 'agent-1|2026-05|8');
  assert.equal(isPlannerSelectionDragActive(selected.state), true);
  assert.deepEqual([...selected.state.selectedCells], ['agent-1|2026-05|8']);
  assert.equal(getPlannerSelectionCount(initial), 0);

  const deselected = togglePlannerCellSelection(selected.state, 'agent-1|2026-05|8');
  assert.equal(deselected.changed, true);
  assert.equal(deselected.isSelected, false);
  assert.equal(getPlannerSelectionCount(deselected.state), 0);
  assert.equal(getPlannerSelectionCount(selected.state), 1);
});

test('addPlannerDragSelectionCell only adds new cells while selection drag is active', () => {
  const inactive = createPlannerSelectionState();
  const ignored = addPlannerDragSelectionCell(inactive, 'agent-1|2026-05|8');

  assert.equal(ignored.changed, false);
  assert.equal(getPlannerSelectionCount(ignored.state), 0);

  const active = togglePlannerCellSelection(inactive, 'agent-1|2026-05|8').state;
  const added = addPlannerDragSelectionCell(active, 'agent-1|2026-05|9');
  assert.equal(added.changed, true);
  assert.equal(added.isSelected, true);
  assert.deepEqual([...added.state.selectedCells], [
    'agent-1|2026-05|8',
    'agent-1|2026-05|9'
  ]);

  const duplicate = addPlannerDragSelectionCell(added.state, 'agent-1|2026-05|9');
  assert.equal(duplicate.changed, false);
  assert.deepEqual([...duplicate.state.selectedCells], [
    'agent-1|2026-05|8',
    'agent-1|2026-05|9'
  ]);
});

test('stop and clear preserve metadata while ending drag and clearing selected Planner Cells', () => {
  const selected = togglePlannerCellSelection(
    createPlannerSelectionState({ currentEditType: 'bulk', bulkEditMode: true }),
    'agent-1|2026-05|8'
  ).state;

  const stopped = stopPlannerCellSelection(selected);
  assert.equal(isPlannerSelectionDragActive(stopped), false);
  assert.equal(getPlannerSelectionCount(stopped), 1);
  assert.equal(stopped.currentEditType, 'bulk');
  assert.equal(stopped.bulkEditMode, true);

  const cleared = clearPlannerCellSelection(stopped);
  assert.equal(getPlannerSelectionCount(cleared), 0);
  assert.equal(isPlannerSelectionDragActive(cleared), false);
  assert.equal(cleared.currentEditType, 'bulk');
  assert.equal(cleared.bulkEditMode, true);
});
