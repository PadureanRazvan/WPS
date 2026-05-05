import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyInactiveCodeToMonth,
  buildContractMonthDaysFromDate,
  buildPrimaryTeamHistoryForChange,
  clearInactiveCodeFromMonth,
  getAgentLifecycleState,
  getEffectivePrimaryTeam,
  getEffectivePrimaryTeamCode,
  getEffectiveReportRoleCode,
  hasPerAgentProductivityEligibleDate,
  isAgentInactiveOnDate,
  isDateBeforeAgentStart,
  isPerAgentProductivityRoleExcluded,
  normalizeAgentLifecycleDate
} from '../js/agent-lifecycle.js';

function makeAgent(overrides = {}) {
  return {
    id: 'agent-1',
    fullName: '01A Test User',
    username: '01A',
    primaryTeam: 'RO zooplus',
    contractHours: 8,
    contractType: 'Full-time',
    hireDate: new Date('2026-05-09T00:00:00'),
    isActive: true,
    ...overrides
  };
}

test('Agent Lifecycle treats dates before contract start as pre-start and the 9th onward as active', () => {
  const agent = makeAgent();

  assert.equal(isDateBeforeAgentStart(agent, new Date('2026-05-08T00:00:00')), true);
  assert.equal(isDateBeforeAgentStart(agent, new Date('2026-05-09T00:00:00')), false);

  assert.deepEqual(getAgentLifecycleState(agent, new Date('2026-05-08T00:00:00')), {
    status: 'pre-start',
    isBeforeStart: true,
    isInactive: false,
    isActive: false,
    effectivePrimaryTeam: 'RO zooplus',
    effectivePrimaryTeamCode: 'RO',
    effectiveReportRoleCode: null
  });

  assert.deepEqual(getAgentLifecycleState(agent, new Date('2026-05-09T00:00:00')), {
    status: 'active',
    isBeforeStart: false,
    isInactive: false,
    isActive: true,
    effectivePrimaryTeam: 'RO zooplus',
    effectivePrimaryTeamCode: 'RO',
    effectiveReportRoleCode: null
  });
});

test('Agent Lifecycle detects inactive periods and preserves active dates after a bounded period', () => {
  const agent = makeAgent({
    isActive: false,
    inactiveFrom: new Date('2026-05-12T00:00:00'),
    inactiveTo: new Date('2026-05-14T00:00:00')
  });

  assert.equal(isAgentInactiveOnDate(agent, new Date('2026-05-11T00:00:00')), false);
  assert.equal(isAgentInactiveOnDate(agent, new Date('2026-05-12T00:00:00')), true);
  assert.equal(isAgentInactiveOnDate(agent, new Date('2026-05-14T00:00:00')), true);
  assert.equal(isAgentInactiveOnDate(agent, new Date('2026-05-15T00:00:00')), false);
  assert.equal(getAgentLifecycleState(agent, new Date('2026-05-12T00:00:00')).status, 'inactive');
  assert.equal(getAgentLifecycleState(agent, new Date('2026-05-15T00:00:00')).status, 'active');
});

test('Agent Lifecycle resolves primary team history and Report Roles by date', () => {
  const agent = makeAgent({
    primaryTeam: 'TL Team Lead',
    primaryTeamHistory: [
      { from: '2026-05-09', primaryTeam: 'CS zooplus' },
      { from: '2026-05-13', primaryTeam: 'QA Quality Assurance' },
      { from: '2026-05-18', primaryTeam: 'TL Team Lead' }
    ]
  });

  assert.equal(getEffectivePrimaryTeam(agent, new Date('2026-05-12T00:00:00')), 'CS zooplus');
  assert.equal(getEffectivePrimaryTeamCode(agent, new Date('2026-05-12T00:00:00')), 'CS');
  assert.equal(getEffectiveReportRoleCode(agent, new Date('2026-05-12T00:00:00')), null);
  assert.equal(getEffectiveReportRoleCode(agent, new Date('2026-05-13T00:00:00')), 'QA');
  assert.equal(getEffectiveReportRoleCode(agent, new Date('2026-05-18T00:00:00')), 'TL');
});

test('buildPrimaryTeamHistoryForChange seeds history from contract start and avoids duplicate changes', () => {
  const agent = makeAgent({ primaryTeam: 'IT zooplus' });

  assert.deepEqual(
    buildPrimaryTeamHistoryForChange(agent, 'RO zooplus', new Date('2026-05-15T00:00:00')),
    [
      { from: '2026-05-09', primaryTeam: 'IT zooplus' },
      { from: '2026-05-15', primaryTeam: 'RO zooplus' }
    ]
  );

  assert.deepEqual(
    buildPrimaryTeamHistoryForChange(agent, 'IT zooplus', new Date('2026-05-15T00:00:00')),
    [
      { from: '2026-05-09', primaryTeam: 'IT zooplus' }
    ]
  );
});

test('buildContractMonthDaysFromDate preserves days before the change date and writes weekdays after it', () => {
  const existingDays = ['8RO', '8RO', 'Co', '', '8RO', '', '', '8RO', ...Array(23).fill('')];
  const result = buildContractMonthDaysFromDate({
    existingDays,
    fromDate: new Date('2026-05-09T00:00:00'),
    contractHours: 6,
    primaryTeam: 'IT zooplus'
  });

  assert.deepEqual(result.slice(0, 8), existingDays.slice(0, 8));
  assert.equal(result[8], '');
  assert.equal(result[9], '');
  assert.equal(result[10], '6IT');
  assert.equal(result[11], '6IT');
  assert.equal(result.length, 31);
});

test('inactive month helpers apply and clear DZ without touching unrelated days', () => {
  const existingDays = ['8RO', 'Co', 'DZ', '8RO', ...Array(27).fill('')];

  const inactiveDays = applyInactiveCodeToMonth(
    existingDays,
    new Date('2026-05-01T00:00:00'),
    new Date('2026-05-02T00:00:00'),
    new Date('2026-05-03T00:00:00')
  );

  assert.deepEqual(inactiveDays.slice(0, 5), ['8RO', 'DZ', 'DZ', '8RO', '']);

  const reactivatedDays = clearInactiveCodeFromMonth(
    inactiveDays,
    new Date('2026-05-01T00:00:00'),
    new Date('2026-05-03T00:00:00')
  );

  assert.deepEqual(reactivatedDays.slice(0, 5), ['8RO', 'DZ', '', '8RO', '']);
});

test('per-agent productivity role eligibility lives with Agent Lifecycle', () => {
  const agent = makeAgent({
    primaryTeam: 'TL Team Lead',
    primaryTeamHistory: [
      { from: '2026-05-09', primaryTeam: 'CS zooplus' },
      { from: '2026-05-12', primaryTeam: 'TL Team Lead' }
    ]
  });

  assert.equal(isPerAgentProductivityRoleExcluded(agent, new Date('2026-05-11T00:00:00')), false);
  assert.equal(isPerAgentProductivityRoleExcluded(agent, new Date('2026-05-12T00:00:00')), true);
  assert.equal(
    hasPerAgentProductivityEligibleDate(
      agent,
      new Date('2026-05-09T00:00:00'),
      new Date('2026-05-11T00:00:00')
    ),
    true
  );
  assert.equal(
    hasPerAgentProductivityEligibleDate(
      agent,
      new Date('2026-05-12T00:00:00'),
      new Date('2026-05-14T00:00:00')
    ),
    false
  );
});

test('normalizeAgentLifecycleDate treats YYYY-MM-DD strings as local boundary dates', () => {
  const date = normalizeAgentLifecycleDate('2026-05-09');

  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 4);
  assert.equal(date.getDate(), 9);
  assert.equal(date.getHours(), 0);
});
