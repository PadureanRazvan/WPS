import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calculateMatchedTeamTrendPoint,
  hasPerAgentProductivityEligibleDate,
  isPerAgentProductivityRoleExcluded
} from '../js/productivity-metrics.js';

function makeAgent(overrides = {}) {
  return {
    fullName: 'Productivity Agent',
    username: 'Productivity Agent_fsp',
    primaryTeam: 'IT zooplus',
    hireDate: new Date('2026-05-01T00:00:00'),
    ...overrides
  };
}

function entry(originalName, teams) {
  return {
    originalName,
    teams: new Map(Object.entries(teams))
  };
}

test('per-agent productivity excludes TL and QA users by effective primary team', () => {
  const teamLead = makeAgent({
    fullName: 'Gabriela Samsudean',
    primaryTeam: 'TL Team Lead'
  });
  const qa = makeAgent({
    fullName: 'QA Agent',
    primaryTeam: 'QA Quality Assurance'
  });
  const regular = makeAgent({
    fullName: 'Regular CS Agent',
    primaryTeam: 'CS zooplus'
  });
  const date = new Date('2026-05-04T00:00:00');

  assert.equal(isPerAgentProductivityRoleExcluded(teamLead, date), true);
  assert.equal(isPerAgentProductivityRoleExcluded(qa, date), true);
  assert.equal(isPerAgentProductivityRoleExcluded(regular, date), false);
});

test('per-agent productivity eligibility follows primary-team history by date', () => {
  const agent = makeAgent({
    fullName: 'Future Team Lead',
    primaryTeam: 'TL Team Lead',
    primaryTeamHistory: [
      { from: '2026-05-01', primaryTeam: 'CS zooplus' },
      { from: '2026-05-03', primaryTeam: 'TL Team Lead' }
    ]
  });

  assert.equal(
    hasPerAgentProductivityEligibleDate(
      agent,
      new Date('2026-05-01T00:00:00'),
      new Date('2026-05-02T00:00:00')
    ),
    true
  );
  assert.equal(
    hasPerAgentProductivityEligibleDate(
      agent,
      new Date('2026-05-03T00:00:00'),
      new Date('2026-05-04T00:00:00')
    ),
    false
  );
});

test('dashboard trend helper still includes uploaded TL and QA items when caller provides hours', () => {
  const agents = [
    makeAgent({
      fullName: 'Gabriela Samsudean',
      username: 'Gabriela Samsudean_fsp',
      primaryTeam: 'TL Team Lead'
    })
  ];
  const ticketEntries = new Map([
    ['gabriela samsudean', entry('Gabriela Samsudean_fsp', { CS: 16 })]
  ]);

  const point = calculateMatchedTeamTrendPoint({
    agents,
    team: 'CS',
    ticketEntries,
    callEntries: null,
    getEligibleHoursForTeam: () => 8
  });

  assert.equal(point.items, 16);
  assert.equal(point.hours, 8);
  assert.equal(point.productivity, 2);
});
