import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEffectiveAgentDayValue
} from 'file:///C:/Users/USER/Desktop/WPS/js/config.js';

function makeAgent(overrides = {}) {
  return {
    fullName: 'Test Agent',
    primaryTeam: 'RO zooplus',
    contractHours: 8,
    contractType: 'Full-time',
    isActive: true,
    hireDate: new Date('2026-04-01T00:00:00'),
    monthlyDays: {
      '2026-04': Array(31).fill('8RO'),
      '2026-05': Array(31).fill('8RO')
    },
    monthlyNotes: {},
    ...overrides
  };
}

test('returns blank before hire date', () => {
  const agent = makeAgent({
    hireDate: new Date('2026-04-13T00:00:00')
  });

  assert.equal(
    getEffectiveAgentDayValue(agent, new Date('2026-04-12T00:00:00')),
    ''
  );
});

test('returns raw schedule on active dates after hire', () => {
  const agent = makeAgent({
    hireDate: new Date('2026-04-13T00:00:00')
  });

  assert.equal(
    getEffectiveAgentDayValue(agent, new Date('2026-04-14T00:00:00')),
    '8RO'
  );
});

test('inactive range overrides stored hours with DZ', () => {
  const agent = makeAgent({
    isActive: false,
    inactiveFrom: new Date('2026-04-20T00:00:00'),
    inactiveTo: new Date('2026-05-10T00:00:00')
  });

  assert.equal(
    getEffectiveAgentDayValue(agent, new Date('2026-04-25T00:00:00')),
    'DZ'
  );
  assert.equal(
    getEffectiveAgentDayValue(agent, new Date('2026-05-02T00:00:00')),
    'DZ'
  );
});

test('dates after the inactive period fall back to saved schedule', () => {
  const agent = makeAgent({
    isActive: false,
    inactiveFrom: new Date('2026-04-20T00:00:00'),
    inactiveTo: new Date('2026-04-25T00:00:00')
  });

  assert.equal(
    getEffectiveAgentDayValue(agent, new Date('2026-04-26T00:00:00')),
    '8RO'
  );
});
