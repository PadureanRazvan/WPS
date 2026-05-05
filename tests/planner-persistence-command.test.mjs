import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLegacyPlannerMigrationCommand,
  buildPlannerMigrationCommands,
  buildPlannerUndoCommand,
  buildPlannerClearMonthCommand
} from '../js/planner-persistence-command.js';

function makeAgent(overrides = {}) {
  return {
    id: 'agent-1',
    fullName: 'Ada Planner',
    days: ['8RO', 'Co'],
    dayNotes: { '1': 'Approved holiday' },
    ...overrides
  };
}

test('buildLegacyPlannerMigrationCommand copies legacy days and notes into the current month', () => {
  const command = buildLegacyPlannerMigrationCommand(makeAgent(), '2026-05');

  assert.deepEqual(command, {
    agentId: 'agent-1',
    agentName: 'Ada Planner',
    monthKey: '2026-05',
    updateData: {
      'monthlyDays.2026-05': ['8RO', 'Co'],
      'monthlyNotes.2026-05': { '1': 'Approved holiday' }
    }
  });
});

test('buildLegacyPlannerMigrationCommand omits empty legacy notes and rejects non-legacy Agents', () => {
  assert.deepEqual(
    buildLegacyPlannerMigrationCommand(makeAgent({ dayNotes: {} }), '2026-05'),
    {
      agentId: 'agent-1',
      agentName: 'Ada Planner',
      monthKey: '2026-05',
      updateData: {
        'monthlyDays.2026-05': ['8RO', 'Co']
      }
    }
  );

  assert.equal(
    buildLegacyPlannerMigrationCommand(makeAgent({ monthlyDays: { '2026-05': ['8RO'] } }), '2026-05'),
    null
  );
  assert.equal(buildLegacyPlannerMigrationCommand(makeAgent({ days: null }), '2026-05'), null);
  assert.equal(buildLegacyPlannerMigrationCommand(makeAgent(), ''), null);
});

test('buildPlannerMigrationCommands filters migrated Agents without mutating the migrated set', () => {
  const migratedAgentIds = new Set(['agent-2']);
  const commands = buildPlannerMigrationCommands(
    [
      makeAgent({ id: 'agent-1', fullName: 'Ada Planner' }),
      makeAgent({ id: 'agent-2', fullName: 'Bea Scheduler' }),
      makeAgent({ id: 'agent-3', fullName: 'Cal Current', monthlyDays: { '2026-05': ['8IT'] } })
    ],
    '2026-05',
    migratedAgentIds
  );

  assert.deepEqual(commands.map(command => command.agentId), ['agent-1']);
  assert.equal(migratedAgentIds.has('agent-1'), false);
  assert.equal(migratedAgentIds.has('agent-2'), true);
});

test('buildPlannerUndoCommand restores monthly days and notes from undo snapshots', () => {
  const command = buildPlannerUndoCommand([
    {
      agentId: 'agent-1',
      monthKey: '2026-05',
      previousDays: ['8RO', 'Co'],
      previousDayNotes: { '1': 'Approved holiday' }
    },
    {
      agentId: 'agent-2',
      monthKey: '2026-06',
      previousDays: ['8IT'],
      previousDayNotes: {}
    }
  ]);

  assert.deepEqual(command, {
    updates: [
      {
        agentId: 'agent-1',
        updateData: {
          'monthlyDays.2026-05': ['8RO', 'Co'],
          'monthlyNotes.2026-05': { '1': 'Approved holiday' }
        }
      },
      {
        agentId: 'agent-2',
        updateData: {
          'monthlyDays.2026-06': ['8IT'],
          'monthlyNotes.2026-06': {}
        }
      }
    ],
    activity: {
      agents: 2
    }
  });
});

test('buildPlannerUndoCommand ignores incomplete snapshot entries', () => {
  const command = buildPlannerUndoCommand([
    { agentId: 'agent-1', monthKey: '2026-05', previousDays: ['8RO'], previousDayNotes: {} },
    { agentId: '', monthKey: '2026-05', previousDays: ['8RO'], previousDayNotes: {} },
    { agentId: 'agent-2', monthKey: '', previousDays: ['8IT'], previousDayNotes: {} }
  ]);

  assert.deepEqual(command.updates.map(update => update.agentId), ['agent-1']);
  assert.deepEqual(command.activity, { agents: 1 });
});

test('buildPlannerClearMonthCommand prepares empty month data and activity details', () => {
  const command = buildPlannerClearMonthCommand('agent-1', '2026-05', [
    makeAgent({ id: 'agent-1', fullName: 'Ada Planner' })
  ]);

  assert.equal(command.update.agentId, 'agent-1');
  assert.equal(command.update.updateData['monthlyDays.2026-05'].length, 31);
  assert.deepEqual(command.update.updateData['monthlyDays.2026-05'], Array(31).fill(''));
  assert.deepEqual(command.update.updateData['monthlyNotes.2026-05'], {});
  assert.deepEqual(command.activity, {
    name: 'Ada Planner',
    month: '2026-05'
  });
});

test('buildPlannerClearMonthCommand falls back to Agent ID and rejects missing inputs', () => {
  assert.deepEqual(
    buildPlannerClearMonthCommand('agent-1', '2026-05', []),
    {
      update: {
        agentId: 'agent-1',
        updateData: {
          'monthlyDays.2026-05': Array(31).fill(''),
          'monthlyNotes.2026-05': {}
        }
      },
      activity: {
        name: 'agent-1',
        month: '2026-05'
      }
    }
  );

  assert.equal(buildPlannerClearMonthCommand('', '2026-05', []), null);
  assert.equal(buildPlannerClearMonthCommand('agent-1', '', []), null);
});
