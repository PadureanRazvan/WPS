import test from 'node:test';
import assert from 'node:assert/strict';

async function loadReportReadModelModule() {
  try {
    return await import('../js/report-read-model.js');
  } catch (error) {
    assert.fail(`report-read-model.js should be importable: ${error.message}`);
  }
}

function makeAgent(overrides = {}) {
  return {
    fullName: 'Report Agent',
    username: 'report.agent',
    primaryTeam: 'IT zooplus',
    contractHours: 8,
    hireDate: new Date('2026-05-01T00:00:00'),
    isActive: true,
    monthlyDays: {},
    ...overrides
  };
}

test('builds sorted shop and Report Role buckets for a selected date range', async () => {
  const { buildReportReadModel } = await loadReportReadModelModule();
  const agents = [
    makeAgent({
      fullName: 'IT Agent',
      primaryTeam: 'IT zooplus',
      monthlyDays: { '2026-05': ['8IT', '4IT+4TL'] }
    }),
    makeAgent({
      fullName: 'RO Agent',
      primaryTeam: 'RO zooplus',
      monthlyDays: { '2026-05': ['8RO', '8RO'] }
    }),
    makeAgent({
      fullName: 'QA Agent',
      primaryTeam: 'QA Quality Assurance',
      monthlyDays: { '2026-05': ['8RO', '8QA'] }
    }),
    makeAgent({
      fullName: 'Second Level Agent',
      primaryTeam: '2L 2nd Level',
      monthlyDays: { '2026-05': ['82L', '82L'] }
    })
  ];

  const model = buildReportReadModel(
    agents,
    new Date('2026-05-01T00:00:00'),
    new Date('2026-05-02T00:00:00')
  );

  assert.equal(model.hasData, true);
  assert.equal(model.range.label, '01.05.2026 - 02.05.2026');
  assert.equal(model.shop.grandTotal, 44);
  assert.equal(model.roles.grandTotal, 20);
  assert.deepEqual(
    model.shop.buckets.map(bucket => [bucket.name, bucket.totalHours, bucket.agentCount]),
    [
      ['RO zooplus', 16, 1],
      ['2nd Level', 16, 1],
      ['IT zooplus', 12, 1]
    ]
  );
  assert.deepEqual(
    model.roles.buckets.map(bucket => [bucket.name, bucket.totalHours, bucket.agentCount]),
    [
      ['QA', 16, 1],
      ['Team Lead', 4, 1]
    ]
  );
  assert.deepEqual(model.roles.buckets[0].agents, [{ name: 'QA Agent', hours: 16 }]);
});

test('uses Primary Team History and inactive dates when aggregating reports', async () => {
  const { calculatePlannerReportData } = await loadReportReadModelModule();
  const agents = [
    makeAgent({
      fullName: 'Future Team Lead',
      primaryTeam: 'TL Team Lead',
      primaryTeamHistory: [
        { from: '2026-05-01', primaryTeam: 'CS zooplus' },
        { from: '2026-05-03', primaryTeam: 'TL Team Lead' }
      ],
      monthlyDays: { '2026-05': ['8CS', '8CS', '8CS'] }
    }),
    makeAgent({
      fullName: 'Inactive Agent',
      primaryTeam: 'RO zooplus',
      isActive: false,
      inactiveFrom: new Date('2026-05-02T00:00:00'),
      inactiveTo: new Date('2026-05-03T00:00:00'),
      monthlyDays: { '2026-05': ['8RO', '8RO', '8RO'] }
    })
  ];

  const data = calculatePlannerReportData(
    agents,
    new Date('2026-05-01T00:00:00'),
    new Date('2026-05-03T00:00:00')
  );

  assert.equal(data.shopData['CS zooplus'].totalHours, 16);
  assert.equal(data.roleData['Team Lead'].totalHours, 8);
  assert.equal(data.shopData['RO zooplus'].totalHours, 8);
  assert.equal(data.shopGrandTotal, 24);
  assert.equal(data.roleGrandTotal, 8);
});

test('returns an empty read model for missing or invalid report ranges', async () => {
  const { buildReportReadModel } = await loadReportReadModelModule();

  const model = buildReportReadModel(
    [makeAgent({ monthlyDays: { '2026-05': ['8IT'] } })],
    null,
    new Date('2026-05-01T00:00:00')
  );

  assert.equal(model.hasData, false);
  assert.equal(model.range.label, '');
  assert.deepEqual(model.shop.buckets, []);
  assert.deepEqual(model.roles.buckets, []);
  assert.equal(model.shop.grandTotal, 0);
  assert.equal(model.roles.grandTotal, 0);
});
