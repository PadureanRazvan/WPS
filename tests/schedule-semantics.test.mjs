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
