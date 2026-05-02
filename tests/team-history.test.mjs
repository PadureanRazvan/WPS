import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPrimaryTeamHistoryForChange,
  getEffectivePrimaryTeam,
  generateDefaultSchedule,
  rewriteMonthlyDaysForPrimaryTeamChange
} from 'file:///C:/Users/USER/Desktop/WPS/js/config.js';

function makeAgent(overrides = {}) {
  return {
    fullName: 'Team Change Agent',
    primaryTeam: 'IT zooplus',
    contractHours: 8,
    hireDate: new Date('2026-05-01T00:00:00'),
    isActive: true,
    monthlyDays: {},
    ...overrides
  };
}

test('primary team history uses old team before change date and new team from change date', () => {
  const agent = makeAgent();
  const history = buildPrimaryTeamHistoryForChange(
    agent,
    'RO zooplus',
    new Date('2026-05-15T00:00:00')
  );

  const changedAgent = { ...agent, primaryTeam: 'RO zooplus', primaryTeamHistory: history };

  assert.deepEqual(history, [
    { from: '2026-05-01', primaryTeam: 'IT zooplus' },
    { from: '2026-05-15', primaryTeam: 'RO zooplus' }
  ]);
  assert.equal(getEffectivePrimaryTeam(changedAgent, new Date('2026-05-14T00:00:00')), 'IT zooplus');
  assert.equal(getEffectivePrimaryTeam(changedAgent, new Date('2026-05-15T00:00:00')), 'RO zooplus');
});

test('default schedule uses dated primary team history inside a transition month', () => {
  const agent = makeAgent({
    primaryTeam: 'RO zooplus',
    primaryTeamHistory: [
      { from: '2026-05-01', primaryTeam: 'IT zooplus' },
      { from: '2026-05-15', primaryTeam: 'RO zooplus' }
    ]
  });

  const days = generateDefaultSchedule(agent, '2026-05');

  assert.equal(days[0], '8IT');
  assert.equal(days[13], '8IT');
  assert.equal(days[14], '8RO');
});

test('default schedule preserves the raw primary team code for planner cells', () => {
  const agent = makeAgent({
    primaryTeam: 'SK zooplus'
  });

  const days = generateDefaultSchedule(agent, '2026-05');

  assert.equal(days[0], '8SK');
});

test('future team rewrite updates default old-team cells and preserves custom cells', () => {
  const agent = makeAgent({
    monthlyDays: {
      '2026-05': [
        '8IT', '8IT', '4IT+4HU', 'Co', '', '8RO', '8',
        ...Array(24).fill('')
      ],
      '2026-06': ['8IT', ...Array(30).fill('')]
    }
  });

  const rewritten = rewriteMonthlyDaysForPrimaryTeamChange(
    agent,
    'RO zooplus',
    new Date('2026-05-02T00:00:00')
  );

  assert.equal(rewritten['2026-05'][0], '8IT');
  assert.equal(rewritten['2026-05'][1], '8RO');
  assert.equal(rewritten['2026-05'][2], '4IT+4HU');
  assert.equal(rewritten['2026-05'][3], 'Co');
  assert.equal(rewritten['2026-05'][4], '');
  assert.equal(rewritten['2026-05'][5], '8RO');
  assert.equal(rewritten['2026-05'][6], '8RO');
  assert.equal(rewritten['2026-06'][0], '8RO');
});
