import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/planner.js', import.meta.url), 'utf8');

function assertImports(modulePath, expectedNames) {
  const escapedPath = modulePath.replaceAll('.', '\\.');
  const importMatch = source.match(new RegExp(`import\\s+\\{([^}]+)\\}\\s+from\\s+'${escapedPath}';`, 's'));
  assert.ok(importMatch, `missing import from ${modulePath}`);

  expectedNames.forEach(name => {
    assert.match(importMatch[1], new RegExp(`\\b${name}\\b`));
  });
}

test('planner shell delegates Planner Selection State instead of mutating cell selection rules inline', () => {
  assertImports('./planner-selection-state.js', [
    'addPlannerDragSelectionCell',
    'clearPlannerCellSelection',
    'createPlannerSelectionState',
    'getPlannerCellSelectionKey',
    'getPlannerSelectionCount',
    'isPlannerSelectionDragActive',
    'stopPlannerCellSelection',
    'togglePlannerCellSelection'
  ]);

  [
    /selectionState\s*=\s*createPlannerSelectionState\(\)/,
    /togglePlannerCellSelection\(selectionState,\s*getPlannerCellSelectionKey\(cell\.dataset\)\)/,
    /addPlannerDragSelectionCell\(selectionState,\s*getPlannerCellSelectionKey\(cell\.dataset\)\)/,
    /selectionState\s*=\s*stopPlannerCellSelection\(selectionState\)/,
    /selectionState\s*=\s*clearPlannerCellSelection\(selectionState\)/,
    /getPlannerSelectionCount\(selectionState\)/
  ].forEach(pattern => {
    assert.match(source, pattern);
  });

  [
    /selectionState\.selectedCells\.(add|delete|clear)\(/,
    /selectionState\.selectionStarted\s*=/
  ].forEach(pattern => {
    assert.doesNotMatch(source, pattern);
  });
});

test('planner shell delegates Planner View State instead of mutating filter and view rules inline', () => {
  assertImports('./planner-view-state.js', [
    'applyPlannerFilterSelection',
    'applyPlannerPresetRange',
    'clearPlannerAgentAndTeamSelections',
    'clearPlannerMonths',
    'createPlannerViewState',
    'resetPlannerFilters',
    'selectPlannerMonths',
    'setPlannerAgentSearchTerm',
    'setPlannerDateRange',
    'setPlannerFilterType',
    'setPlannerRangeType',
    'setPlannerViewOption',
    'togglePlannerMonth',
    'togglePlannerTeam'
  ]);

  [
    /let plannerState\s*=\s*createPlannerViewState\(\)/,
    /plannerState\s*=\s*setPlannerDateRange\(plannerState,/,
    /plannerState\s*=\s*setPlannerFilterType\(plannerState,/,
    /plannerState\s*=\s*applyPlannerFilterSelection\(plannerState,/,
    /plannerState\s*=\s*clearPlannerAgentAndTeamSelections\(plannerState\)/,
    /plannerState\s*=\s*togglePlannerMonth\(plannerState,\s*monthKey\)/,
    /plannerState\s*=\s*selectPlannerMonths\(plannerState,/,
    /plannerState\s*=\s*clearPlannerMonths\(plannerState\)/,
    /plannerState\s*=\s*togglePlannerTeam\(plannerState,\s*teamId\)/,
    /plannerState\s*=\s*setPlannerRangeType\(plannerState,\s*type\)/,
    /plannerState\s*=\s*applyPlannerPresetRange\(plannerState,/,
    /plannerState\s*=\s*resetPlannerFilters\(plannerState,/,
    /plannerState\s*=\s*setPlannerAgentSearchTerm\(plannerState,\s*term\)/,
    /plannerState\s*=\s*setPlannerViewOption\(plannerState,\s*option,\s*value\)/
  ].forEach(pattern => {
    assert.match(source, pattern);
  });

  [
    /plannerState\.selectedTeams\s*=(?!=)/,
    /plannerState\.selectedTeams\.(push|splice)\(/,
    /plannerState\.selectedTeams\.filter\(/,
    /plannerState\.selectedAgents\s*=(?!=)/,
    /plannerState\.selectedAgents\.(push|splice)\(/,
    /plannerState\.selectedAgents\.filter\(/,
    /plannerState\.selectedMonths\s*=(?!=)/,
    /plannerState\.selectedMonths\.(push|splice|sort)\(/,
    /plannerState\.dateRange\.(start|end)\s*=(?!=)/,
    /plannerState\.rangeType\s*=(?!=)/,
    /plannerState\.presetRange\s*=(?!=)/,
    /plannerState\.agentSearchTerm\s*=(?!=)/,
    /plannerState\.viewOptions\[[^\]]+\]\s*=(?!=)/,
    /plannerState\.viewOptions\.compactView\s*=(?!=)/
  ].forEach(pattern => {
    assert.doesNotMatch(source, pattern);
  });
});
