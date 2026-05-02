import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculatePlannerReportData
} from 'file:///C:/Users/USER/Desktop/WPS/js/config.js';

function makeAgent(overrides = {}) {
  return {
    fullName: 'Report Agent',
    primaryTeam: 'IT zooplus',
    contractHours: 8,
    hireDate: new Date('2026-05-01T00:00:00'),
    isActive: true,
    monthlyDays: {},
    ...overrides
  };
}

test('report aggregation excludes TL and QA from shop data and keeps them as roles', () => {
  const agents = [
    makeAgent({
      fullName: 'Team Lead Agent',
      primaryTeam: 'TL Team Lead',
      monthlyDays: { '2026-05': ['8TL'] }
    }),
    makeAgent({
      fullName: 'QA Agent',
      primaryTeam: 'QA Quality Assurance',
      monthlyDays: { '2026-05': ['8QA'] }
    }),
    makeAgent({
      fullName: 'IT Agent',
      primaryTeam: 'IT zooplus',
      monthlyDays: { '2026-05': ['8IT'] }
    })
  ];

  const result = calculatePlannerReportData(
    agents,
    new Date('2026-05-01T00:00:00'),
    new Date('2026-05-01T00:00:00')
  );

  assert.equal(result.shopData['IT zooplus'].totalHours, 8);
  assert.equal(result.shopGrandTotal, 8);
  assert.equal(result.shopData['Team Lead'], undefined);
  assert.equal(result.shopData['QA'], undefined);
  assert.equal(result.roleData['Team Lead'].totalHours, 8);
  assert.equal(result.roleData['QA'].totalHours, 8);
});

test('report aggregation splits mixed shop and TL hours but keeps 2L in shop data', () => {
  const agents = [
    makeAgent({
      fullName: 'Mixed Agent',
      primaryTeam: 'IT zooplus',
      monthlyDays: { '2026-05': ['4IT+4TL'] }
    }),
    makeAgent({
      fullName: 'Second Level Agent',
      primaryTeam: '2L 2nd Level',
      monthlyDays: { '2026-05': ['82L'] }
    })
  ];

  const result = calculatePlannerReportData(
    agents,
    new Date('2026-05-01T00:00:00'),
    new Date('2026-05-01T00:00:00')
  );

  assert.equal(result.shopData['IT zooplus'].totalHours, 4);
  assert.equal(result.roleData['Team Lead'].totalHours, 4);
  assert.equal(result.shopData['2nd Level'].totalHours, 8);
  assert.equal(result.shopGrandTotal, 12);
});
