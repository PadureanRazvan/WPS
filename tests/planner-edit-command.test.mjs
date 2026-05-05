import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlannerEditCommand } from '../js/planner-edit-command.js';

function makeAgent(overrides = {}) {
  return {
    id: 'agent-1',
    fullName: 'Ada Planner',
    contractHours: 8,
    primaryTeam: 'RO zooplus',
    monthlyDays: {
      '2026-05': ['8RO', '8RO']
    },
    monthlyNotes: {
      '2026-05': { '0': 'Keep this note', '1': 'Clear this note' }
    },
    ...overrides
  };
}

test('buildPlannerEditCommand prepares one Agent month update with an undo snapshot and note', () => {
  const agent = makeAgent();
  const command = buildPlannerEditCommand(
    [agent],
    new Set(['agent-1|2026-05|1']),
    'Co',
    'Vacation approved'
  );

  assert.equal(command.cellCount, 1);
  assert.deepEqual(command.missingAgentIds, []);
  assert.deepEqual(command.changedAgentIds, ['agent-1']);
  assert.deepEqual(command.snapshots, [
    {
      agentId: 'agent-1',
      monthKey: '2026-05',
      previousDays: ['8RO', '8RO'],
      previousDayNotes: { '0': 'Keep this note', '1': 'Clear this note' }
    }
  ]);

  assert.equal(command.updates.length, 1);
  assert.equal(command.updates[0].agentId, 'agent-1');
  assert.equal(command.updates[0].agentName, 'Ada Planner');
  assert.equal(command.updates[0].updateData['monthlyDays.2026-05'].length, 31);
  assert.deepEqual(command.updates[0].updateData['monthlyDays.2026-05'].slice(0, 4), [
    '8RO',
    'Co',
    '',
    ''
  ]);
  assert.deepEqual(command.updates[0].updateData['monthlyNotes.2026-05'], {
    '0': 'Keep this note',
    '1': 'Vacation approved'
  });
  assert.deepEqual(command.activity, {
    agentNames: ['Ada Planner'],
    cells: 1,
    value: 'Co'
  });
});

test('buildPlannerEditCommand clears the selected day note when the new note is blank', () => {
  const command = buildPlannerEditCommand(
    [makeAgent()],
    new Set(['agent-1|2026-05|1']),
    '8RO',
    ''
  );

  assert.deepEqual(command.updates[0].updateData['monthlyNotes.2026-05'], {
    '0': 'Keep this note'
  });
});

test('buildPlannerEditCommand groups multi-Agent and multi-month changes', () => {
  const agents = [
    makeAgent({
      id: 'agent-1',
      fullName: 'Ada Planner',
      monthlyDays: { '2026-05': ['8RO'] },
      monthlyNotes: { '2026-05': {} }
    }),
    makeAgent({
      id: 'agent-2',
      fullName: 'Bea Scheduler',
      monthlyDays: { '2026-05': ['8IT'], '2026-06': ['8IT'] },
      monthlyNotes: { '2026-05': { '0': 'Old May' }, '2026-06': { '0': 'Old June' } }
    })
  ];

  const command = buildPlannerEditCommand(
    agents,
    new Set([
      'agent-1|2026-05|0',
      'agent-2|2026-05|0',
      'agent-2|2026-06|0'
    ]),
    'SL',
    'Sick leave'
  );

  assert.deepEqual(command.changedAgentIds, ['agent-1', 'agent-2']);
  assert.equal(command.updates.length, 2);
  assert.equal(command.snapshots.length, 3);

  const beaUpdate = command.updates.find(update => update.agentId === 'agent-2');
  assert.equal(beaUpdate.updateData['monthlyDays.2026-05'][0], 'SL');
  assert.equal(beaUpdate.updateData['monthlyDays.2026-06'][0], 'SL');
  assert.deepEqual(beaUpdate.updateData['monthlyNotes.2026-05'], { '0': 'Sick leave' });
  assert.deepEqual(beaUpdate.updateData['monthlyNotes.2026-06'], { '0': 'Sick leave' });
  assert.deepEqual(command.activity.agentNames, ['Ada Planner', 'Bea Scheduler']);
});

test('buildPlannerEditCommand skips missing Agents while preserving activity cell count', () => {
  const command = buildPlannerEditCommand(
    [makeAgent()],
    new Set(['agent-1|2026-05|0', 'missing-agent|2026-05|0']),
    'LB',
    ''
  );

  assert.deepEqual(command.changedAgentIds, ['agent-1']);
  assert.deepEqual(command.missingAgentIds, ['missing-agent']);
  assert.equal(command.updates.length, 1);
  assert.equal(command.snapshots.length, 1);
  assert.deepEqual(command.activity, {
    agentNames: ['Ada Planner', 'missing-agent'],
    cells: 2,
    value: 'LB'
  });
});

test('buildPlannerEditCommand returns an empty command for empty selection', () => {
  const command = buildPlannerEditCommand([makeAgent()], new Set(), '8RO', '');

  assert.deepEqual(command, {
    updates: [],
    snapshots: [],
    changedAgentIds: [],
    cellCount: 0,
    missingAgentIds: [],
    activity: {
      agentNames: [],
      cells: 0,
      value: '8RO'
    }
  });
});
