import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadScheduleSemanticsModule() {
  try {
    return await import('../js/schedule-semantics.js');
  } catch (error) {
    assert.fail(`schedule-semantics.js should be importable: ${error.message}`);
  }
}

test('schedule semantics parse 2L planner entries without inflating hours', async () => {
  const {
    extractHoursFromDay,
    normalizeTeamForDisplay,
    parseShiftEntry
  } = await loadScheduleSemanticsModule();

  assert.deepEqual(parseShiftEntry('82L'), { hours: 8, team: '2L' });
  assert.equal(extractHoursFromDay('82L'), 8);
  assert.equal(extractHoursFromDay('4RO+42L'), 8);
  assert.equal(normalizeTeamForDisplay('SK'), 'CS');
});

test('schedule semantics resolve primary-team history by date', async () => {
  const {
    getEffectivePrimaryTeam,
    getEffectivePrimaryTeamCode
  } = await loadScheduleSemanticsModule();
  const agent = {
    primaryTeam: 'RO zooplus',
    primaryTeamHistory: [
      { from: '2026-05-01', primaryTeam: 'RO zooplus' },
      { from: '2026-05-03', primaryTeam: 'TL Team Lead' }
    ]
  };

  assert.equal(getEffectivePrimaryTeam(agent, new Date('2026-05-02T00:00:00')), 'RO zooplus');
  assert.equal(getEffectivePrimaryTeam(agent, new Date('2026-05-04T00:00:00')), 'TL Team Lead');
  assert.equal(getEffectivePrimaryTeamCode(agent, new Date('2026-05-04T00:00:00')), 'TL');
});

test('schedule semantics report role hours separately from shop hours', async () => {
  const { calculatePlannerReportData } = await loadScheduleSemanticsModule();
  const agents = [{
    fullName: 'Mixed Role Agent',
    primaryTeam: 'CS zooplus',
    primaryTeamHistory: [
      { from: '2026-05-01', primaryTeam: 'CS zooplus' },
      { from: '2026-05-02', primaryTeam: 'QA Quality Assurance' }
    ],
    monthlyDays: {
      '2026-05': ['8CS', '8QA', '82L']
    }
  }];

  const result = calculatePlannerReportData(
    agents,
    new Date('2026-05-01T00:00:00'),
    new Date('2026-05-03T00:00:00')
  );

  assert.equal(result.shopGrandTotal, 8);
  assert.equal(result.roleGrandTotal, 16);
  assert.equal(result.shopData['CS zooplus'].totalHours, 8);
  assert.equal(result.roleData.QA.totalHours, 16);
});
