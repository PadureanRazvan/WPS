import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPlannerFilterSelection,
  applyPlannerPresetRange,
  clearPlannerAgentAndTeamSelections,
  clearPlannerMonths,
  createPlannerViewState,
  resetPlannerFilters,
  selectPlannerMonths,
  setPlannerAgentSearchTerm,
  setPlannerDateRange,
  setPlannerFilterType,
  setPlannerRangeType,
  setPlannerViewOption,
  togglePlannerMonth,
  togglePlannerTeam
} from '../js/planner-view-state.js';

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

test('Planner View State starts with the production planner defaults', () => {
  const state = createPlannerViewState();

  assert.deepEqual(state.selectedMonths, []);
  assert.deepEqual(state.selectedTeams, ['all']);
  assert.deepEqual(state.selectedAgents, []);
  assert.deepEqual(state.dateRange, { start: null, end: null });
  assert.equal(state.rangeType, 'preset');
  assert.equal(state.presetRange, 'current-month');
  assert.equal(state.agentSearchTerm, '');
  assert.equal(state.filterType, 'agent');
  assert.deepEqual(state.viewOptions, {
    showWeekTotals: false,
    highlightWeekends: true,
    compactView: false
  });
});

test('month selection toggles, selects all, and clears without mutating the previous state', () => {
  const initial = createPlannerViewState();
  const may = togglePlannerMonth(initial, '2026-05');
  const mayJune = togglePlannerMonth(may, '2026-06');
  const june = togglePlannerMonth(mayJune, '2026-05');

  assert.deepEqual(may.selectedMonths, ['2026-05']);
  assert.deepEqual(mayJune.selectedMonths, ['2026-05', '2026-06']);
  assert.deepEqual(june.selectedMonths, ['2026-06']);
  assert.deepEqual(initial.selectedMonths, []);

  const allMonths = selectPlannerMonths(june, ['2026-07', '2026-05', '2026-07']);
  assert.deepEqual(allMonths.selectedMonths, ['2026-07', '2026-05']);
  assert.deepEqual(clearPlannerMonths(allMonths).selectedMonths, []);
});

test('team selection keeps all-team fallback and avoids duplicate teams', () => {
  const initial = createPlannerViewState();
  const ro = togglePlannerTeam(initial, 'RO');
  const roAgain = togglePlannerTeam(ro, 'RO');
  const it = togglePlannerTeam(ro, 'IT');
  const all = togglePlannerTeam(it, 'all');

  assert.deepEqual(ro.selectedTeams, ['RO']);
  assert.deepEqual(roAgain.selectedTeams, ['all']);
  assert.deepEqual(it.selectedTeams, ['RO', 'IT']);
  assert.deepEqual(all.selectedTeams, ['all']);
  assert.deepEqual(initial.selectedTeams, ['all']);
});

test('filter dropdown selection updates teams or agents by active filter type', () => {
  const teamFilter = setPlannerFilterType(createPlannerViewState(), 'team');
  const roChecked = applyPlannerFilterSelection(teamFilter, { value: 'RO', checked: true });
  const roCheckedAgain = applyPlannerFilterSelection(roChecked, { value: 'RO', checked: true });
  const roUnchecked = applyPlannerFilterSelection(roCheckedAgain, { value: 'RO', checked: false });

  assert.deepEqual(roChecked.selectedTeams, ['RO']);
  assert.deepEqual(roCheckedAgain.selectedTeams, ['RO']);
  assert.deepEqual(roUnchecked.selectedTeams, ['all']);

  const agentFilter = setPlannerFilterType(createPlannerViewState(), 'agent');
  const adaChecked = applyPlannerFilterSelection(agentFilter, { value: 'agent-ada', checked: true });
  const adaCheckedAgain = applyPlannerFilterSelection(adaChecked, { value: 'agent-ada', checked: true });
  const adaUnchecked = applyPlannerFilterSelection(adaCheckedAgain, { value: 'agent-ada', checked: false });

  assert.deepEqual(adaChecked.selectedAgents, ['agent-ada']);
  assert.deepEqual(adaCheckedAgain.selectedAgents, ['agent-ada']);
  assert.deepEqual(adaUnchecked.selectedAgents, []);
});

test('date ranges, presets, search terms, and view options are updated through focused helpers', () => {
  const today = new Date('2026-05-05T12:00:00');
  const customStart = new Date('2026-04-10T00:00:00');
  const customEnd = new Date('2026-04-12T00:00:00');

  const custom = setPlannerDateRange(createPlannerViewState(), customStart, customEnd);
  assert.equal(custom.dateRange.start, customStart);
  assert.equal(custom.dateRange.end, customEnd);

  const nextMonth = applyPlannerPresetRange(custom, 'next-month', today);
  assert.equal(nextMonth.presetRange, 'next-month');
  assert.equal(dateKey(nextMonth.dateRange.start), '2026-06-01');
  assert.equal(dateKey(nextMonth.dateRange.end), '2026-06-30');

  const tomorrow = applyPlannerPresetRange(nextMonth, 'tomorrow', today);
  assert.equal(dateKey(tomorrow.dateRange.start), '2026-05-06');
  assert.equal(dateKey(tomorrow.dateRange.end), '2026-05-06');

  const searched = setPlannerAgentSearchTerm(tomorrow, 'ada');
  const compact = setPlannerViewOption(searched, 'compactView', true);
  const multiMonth = setPlannerRangeType(compact, 'multi-month');

  assert.equal(searched.agentSearchTerm, 'ada');
  assert.equal(compact.viewOptions.compactView, true);
  assert.equal(tomorrow.viewOptions.compactView, false);
  assert.equal(multiMonth.rangeType, 'multi-month');
});

test('clear and reset helpers preserve planner defaults expected by the shell', () => {
  const today = new Date('2026-05-05T12:00:00');
  const dirty = createPlannerViewState({
    selectedTeams: ['RO'],
    selectedAgents: ['agent-ada'],
    agentSearchTerm: 'ada',
    presetRange: 'next-month',
    viewOptions: { showWeekTotals: true, highlightWeekends: false, compactView: true }
  });

  const cleared = clearPlannerAgentAndTeamSelections(dirty);
  assert.deepEqual(cleared.selectedTeams, ['all']);
  assert.deepEqual(cleared.selectedAgents, []);
  assert.equal(cleared.agentSearchTerm, '');
  assert.equal(cleared.viewOptions.compactView, true);

  const reset = resetPlannerFilters(dirty, { today });
  assert.deepEqual(reset.selectedTeams, ['all']);
  assert.deepEqual(reset.selectedAgents, []);
  assert.equal(reset.agentSearchTerm, '');
  assert.equal(reset.presetRange, 'current-month');
  assert.equal(dateKey(reset.dateRange.start), '2026-05-01');
  assert.equal(dateKey(reset.dateRange.end), '2026-05-31');
  assert.equal(reset.viewOptions.showWeekTotals, true);
});
