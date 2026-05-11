import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadAgentSelectionModelModule() {
  try {
    return await import('../js/productivity-agent-selection-model.js');
  } catch (error) {
    assert.fail(`productivity-agent-selection-model.js should be importable: ${error.message}`);
  }
}

function makeAgent(fullName, primaryTeam = 'CS zooplus', overrides = {}) {
  return {
    fullName,
    username: `${fullName.replaceAll(' ', '.')}_fsp`,
    primaryTeam,
    ...overrides
  };
}

function uploadedEntry(originalName, teams) {
  return {
    originalName,
    teams: new Map(Object.entries(teams))
  };
}

test('agent selection options for all teams come from registered users without scanning uploads', async () => {
  const { buildProductivityAgentSelectionOptions } = await loadAgentSelectionModelModule();
  const agents = [
    makeAgent('Ana Pop', 'IT zooplus'),
    makeAgent('Mihai Popescu', 'CS zooplus')
  ];
  const dataByDate = new Map([
    ['2026-05-11', {
      ticketsData: new Map([
        ['ana pop', uploadedEntry('Ana.Pop_fsp', { IT: 5 })]
      ]),
      callsData: new Map([
        ['ana pop', uploadedEntry('Ana.Pop_fsp', { IT: 2 })]
      ])
    }]
  ]);

  const options = buildProductivityAgentSelectionOptions({
    dataByDate,
    agents,
    start: new Date('2026-05-11T00:00:00'),
    end: new Date('2026-05-11T00:00:00'),
    teamFilter: 'all',
    findAgent: () => assert.fail('all-team selection should not scan uploaded rows'),
    hasEligibleDate: () => true
  });

  assert.deepEqual(options.map(([key]) => key), ['ana pop', 'mihai popescu']);
});

test('team-filtered agent selection scans only the range and memoizes uploaded name matching', async () => {
  const { buildProductivityAgentSelectionOptions } = await loadAgentSelectionModelModule();
  const ana = makeAgent('Ana Pop', 'IT zooplus');
  const mihai = makeAgent('Mihai Popescu', 'CS zooplus');
  const agents = [ana, mihai];
  const matchedNames = [];
  const dataByDate = new Map([
    ['2026-05-10', {
      ticketsData: new Map([
        ['mihai popescu', uploadedEntry('Mihai.Popescu_fsp', { CS: 10 })]
      ]),
      callsData: null
    }],
    ['2026-05-11', {
      ticketsData: new Map([
        ['ana pop', uploadedEntry('Ana.Pop_fsp', { IT: 5 })]
      ]),
      callsData: new Map([
        ['ana pop', uploadedEntry('Ana.Pop_fsp', { IT: 2 })]
      ])
    }]
  ]);

  const options = buildProductivityAgentSelectionOptions({
    dataByDate,
    agents,
    start: new Date('2026-05-11T00:00:00'),
    end: new Date('2026-05-11T00:00:00'),
    teamFilter: 'IT',
    findAgent(originalName) {
      matchedNames.push(originalName);
      return originalName.includes('Ana') ? ana : null;
    },
    hasEligibleDate: () => true,
    isRoleExcluded: () => false
  });

  assert.deepEqual(options.map(([key]) => key), ['ana pop']);
  assert.deepEqual(matchedNames, ['Ana.Pop_fsp']);
});

test('agent selection pruning returns a clean selection from provided options', async () => {
  const { pruneProductivityAgentSelection } = await loadAgentSelectionModelModule();
  const selected = new Set(['ana pop', 'missing agent']);

  const pruned = pruneProductivityAgentSelection(selected, [
    ['ana pop', { fullName: 'Ana Pop' }]
  ]);

  assert.deepEqual([...pruned], ['ana pop']);
  assert.deepEqual([...selected].sort(), ['ana pop', 'missing agent']);
});

test('agent selection cache reuses options until the key changes or cache is cleared', async () => {
  const { createProductivityAgentSelectionCache } = await loadAgentSelectionModelModule();
  const cache = createProductivityAgentSelectionCache();
  const usersRef = [];
  let builds = 0;
  const build = () => {
    builds += 1;
    return [['ana pop', { fullName: 'Ana Pop' }]];
  };

  const first = cache.get({
    dataVersion: 1,
    startKey: '2026-05-11',
    endKey: '2026-05-11',
    teamFilter: 'all',
    usersRef
  }, build);
  const second = cache.get({
    dataVersion: 1,
    startKey: '2026-05-11',
    endKey: '2026-05-11',
    teamFilter: 'all',
    usersRef
  }, build);
  const third = cache.get({
    dataVersion: 2,
    startKey: '2026-05-11',
    endKey: '2026-05-11',
    teamFilter: 'all',
    usersRef
  }, build);
  cache.clear();
  cache.get({
    dataVersion: 2,
    startKey: '2026-05-11',
    endKey: '2026-05-11',
    teamFilter: 'all',
    usersRef
  }, build);

  assert.equal(first, second);
  assert.notEqual(second, third);
  assert.equal(builds, 3);
});
