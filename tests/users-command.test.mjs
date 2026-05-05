import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildContractChangeCommand,
  buildCreateAgentCommand,
  buildDeactivateAgentCommand,
  buildInlineUserEditCommand,
  buildPrimaryTeamChangeCommand,
  buildReactivateAgentCommand,
  getComparableUserInlineDraftState,
  getComparableUserInlineFieldState,
  normalizeUserInlineFieldValue
} from '../js/users-command.js';

const MAY_5_2026 = new Date(2026, 4, 5);

function timestampFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { timestamp: `${year}-${month}-${day}` };
}

function monthDays(fill = '') {
  return Array.from({ length: 31 }, () => fill);
}

test('buildCreateAgentCommand validates required fields and creates a month-ready Agent payload', () => {
  const missing = buildCreateAgentCommand({
    fullName: '',
    username: 'ada',
    contractType: 'Full-time',
    primaryTeam: 'RO zooplus',
    hireDateStr: '2026-05-06'
  }, { now: MAY_5_2026 });
  assert.deepEqual(missing, { ok: false, error: 'fill-required-fields' });

  const invalidPartTime = buildCreateAgentCommand({
    fullName: 'Ada Planner',
    username: 'ada',
    contractType: 'Part-time',
    contractHours: '9',
    primaryTeam: 'RO zooplus',
    hireDateStr: '2026-05-06'
  }, { now: MAY_5_2026 });
  assert.deepEqual(invalidPartTime, { ok: false, error: 'pt-hours-range' });

  const created = buildCreateAgentCommand({
    fullName: ' Ada Planner ',
    username: ' ada ',
    contractType: 'Full-time',
    primaryTeam: 'RO zooplus',
    hireDateStr: '2026-05-06'
  }, { now: MAY_5_2026 });

  assert.equal(created.ok, true);
  assert.equal(created.monthKey, '2026-05');
  assert.equal(created.teamCode, 'RO');
  assert.equal(created.payload.fullName, 'Ada Planner');
  assert.equal(created.payload.username, 'ada');
  assert.equal(created.payload.contractHours, 8);
  assert.deepEqual(created.payload.teams, ['RO']);
  assert.equal(created.payload.isActive, true);
  assert.equal(created.payload.monthlyDays['2026-05'][4], '');
  assert.equal(created.payload.monthlyDays['2026-05'][5], '8RO');
  assert.deepEqual(created.payload.monthlyNotes, {});
});

test('buildContractChangeCommand validates current-month changes and rewrites only the current contract month', () => {
  const user = {
    id: 'agent-1',
    fullName: 'Ada Planner',
    primaryTeam: 'RO zooplus',
    monthlyDays: { '2026-05': monthDays('8RO') }
  };

  const wrongMonth = buildContractChangeCommand(user, {
    newContractType: 'Part-time',
    contractHours: '6',
    fromDateStr: '2026-06-01',
    now: MAY_5_2026
  });
  assert.deepEqual(wrongMonth, { ok: false, error: 'date-must-be-current-month' });

  const command = buildContractChangeCommand(user, {
    newContractType: 'Part-time',
    contractHours: '6',
    fromDateStr: '2026-05-06',
    now: MAY_5_2026
  });

  assert.equal(command.ok, true);
  assert.equal(command.monthKey, '2026-05');
  assert.equal(command.contractHours, 6);
  assert.equal(command.updateData.contractType, 'Part-time');
  assert.equal(command.updateData.contractHours, 6);
  assert.equal(command.updateData['monthlyDays.2026-05'][4], '8RO');
  assert.equal(command.updateData['monthlyDays.2026-05'][5], '6RO');
  assert.deepEqual(command.activity, { name: 'Ada Planner', type: 'Part-time', hours: 6 });
});

test('buildPrimaryTeamChangeCommand validates hire date and returns history plus monthly rewrites', () => {
  const user = {
    id: 'agent-1',
    fullName: 'Ada Planner',
    primaryTeam: 'RO zooplus',
    teams: ['RO'],
    hireDate: new Date(2026, 4, 5),
    monthlyDays: { '2026-05': monthDays('8RO') }
  };

  const beforeHire = buildPrimaryTeamChangeCommand(user, {
    newPrimaryTeam: 'IT zooplus',
    fromDateStr: '2026-05-04'
  });
  assert.deepEqual(beforeHire, { ok: false, error: 'team-date-before-hire' });

  const command = buildPrimaryTeamChangeCommand(user, {
    newPrimaryTeam: 'IT zooplus',
    fromDateStr: '2026-05-06'
  });

  assert.equal(command.ok, true);
  assert.equal(command.teamCode, 'IT');
  assert.equal(command.updateData.primaryTeam, 'IT zooplus');
  assert.deepEqual(command.updateData.teams, ['IT']);
  assert.deepEqual(command.updateData.primaryTeamHistory, [
    { from: '2026-05-05', primaryTeam: 'RO zooplus' },
    { from: '2026-05-06', primaryTeam: 'IT zooplus' }
  ]);
  assert.equal(command.updateData['monthlyDays.2026-05'][4], '8RO');
  assert.equal(command.updateData['monthlyDays.2026-05'][5], '8IT');
});

test('buildDeactivateAgentCommand validates dates and produces DZ month updates with timestamp conversion', () => {
  const user = {
    id: 'agent-1',
    fullName: 'Ada Planner',
    monthlyDays: { '2026-05': monthDays('8RO') }
  };

  const invalid = buildDeactivateAgentCommand(user, {
    startDate: new Date(2026, 4, 10),
    endDate: new Date(2026, 4, 9),
    noteText: '',
    now: MAY_5_2026,
    timestampFromDate
  });
  assert.deepEqual(invalid, { ok: false, error: 'end-date-after-start' });

  const command = buildDeactivateAgentCommand(user, {
    startDate: new Date(2026, 4, 6),
    endDate: new Date(2026, 4, 7),
    noteText: 'Seasonal pause',
    now: MAY_5_2026,
    timestampFromDate
  });

  assert.equal(command.ok, true);
  assert.equal(command.updateData.isActive, false);
  assert.deepEqual(command.updateData.inactiveFrom, { timestamp: '2026-05-06' });
  assert.deepEqual(command.updateData.inactiveTo, { timestamp: '2026-05-07' });
  assert.equal(command.updateData.deactivationNote, 'Seasonal pause');
  assert.equal(command.updateData['monthlyDays.2026-05'][4], '8RO');
  assert.equal(command.updateData['monthlyDays.2026-05'][5], 'DZ');
  assert.equal(command.updateData['monthlyDays.2026-05'][6], 'DZ');
  assert.equal(command.activity.mode, 'period');
});

test('buildReactivateAgentCommand clears future DZ values and leaves past days untouched', () => {
  const mayDays = monthDays('');
  mayDays[4] = 'DZ';
  mayDays[5] = 'DZ';
  mayDays[6] = 'DZ';
  const juneDays = monthDays('DZ');
  const user = {
    id: 'agent-1',
    fullName: 'Ada Planner',
    isActive: false,
    monthlyDays: {
      '2026-04': monthDays('DZ'),
      '2026-05': mayDays,
      '2026-06': juneDays
    }
  };

  const command = buildReactivateAgentCommand(user, { now: new Date(2026, 4, 6) });

  assert.equal(command.ok, true);
  assert.equal(command.updateData.isActive, true);
  assert.equal(command.updateData.inactiveFrom, null);
  assert.equal(command.updateData.inactiveTo, null);
  assert.equal(command.updateData.deactivationNote, null);
  assert.equal(command.updateData['monthlyDays.2026-05'][4], 'DZ');
  assert.equal(command.updateData['monthlyDays.2026-05'][5], '');
  assert.equal(command.updateData['monthlyDays.2026-06'][0], '');
  assert.equal(command.updateData['monthlyDays.2026-04'], undefined);
});

test('inline user edit command normalizes comparisons, validations, and direct update payloads', () => {
  const user = {
    id: 'agent-1',
    fullName: 'Ada Planner',
    username: 'ada',
    contractType: 'Full-time',
    contractHours: 8,
    primaryTeam: 'RO zooplus',
    teams: ['RO'],
    hireDate: new Date(2026, 4, 5)
  };

  assert.equal(normalizeUserInlineFieldValue('contractHours', '06'), '6');
  assert.equal(getComparableUserInlineFieldState(user, 'contractType'), 'Full-time');
  assert.equal(
    getComparableUserInlineDraftState('primaryTeam', 'IT zooplus'),
    JSON.stringify({ primaryTeam: 'IT zooplus', teams: ['IT'] })
  );

  assert.deepEqual(
    buildInlineUserEditCommand(user, {
      field: 'contractType',
      rawValue: 'Part-time',
      eventType: 'change'
    }),
    { ok: true, action: 'open-contract-modal', value: 'Part-time' }
  );

  assert.deepEqual(
    buildInlineUserEditCommand(user, {
      field: 'contractHours',
      rawValue: '3',
      timestampFromDate
    }),
    { ok: false, error: 'hours-range-error', rerender: true }
  );

  const hireDateCommand = buildInlineUserEditCommand(user, {
    field: 'hireDate',
    rawValue: '2026-05-06',
    timestampFromDate
  });
  assert.equal(hireDateCommand.ok, true);
  assert.deepEqual(hireDateCommand.updatePayload, { hireDate: { timestamp: '2026-05-06' } });
  assert.deepEqual(hireDateCommand.logDetails, { field: 'hireDate', agentId: 'agent-1' });

  const unchanged = buildInlineUserEditCommand(user, {
    field: 'fullName',
    rawValue: 'Ada Planner',
    initialValue: 'Ada Planner',
    timestampFromDate
  });
  assert.deepEqual(unchanged, { ok: true, action: 'noop', initialValue: 'Ada Planner' });
});
