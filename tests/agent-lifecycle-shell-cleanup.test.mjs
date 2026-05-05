import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scheduleSource = readFileSync(new URL('../js/schedule-semantics.js', import.meta.url), 'utf8');
const usersSource = readFileSync(new URL('../js/users.js', import.meta.url), 'utf8');
const productivityMetricsSource = readFileSync(new URL('../js/productivity-metrics.js', import.meta.url), 'utf8');

test('Schedule Semantics delegates Agent Lifecycle rules to the Agent Lifecycle module', () => {
  assert.match(scheduleSource, /from\s+'\.\/agent-lifecycle\.js';/);
  assert.match(scheduleSource, /\bgetAgentLifecycleState\(\s*agent\s*,\s*date\s*\)/);

  [
    /function normalizeScheduleBoundaryDate/,
    /function getNormalizedPrimaryTeamHistory/,
    /function isDateBeforeAgentHire/,
    /function isAgentInactiveOnDate/,
    /function normalizePrimaryTeamHistoryEntry/,
    /export function getEffectivePrimaryTeam\(/,
    /export function buildPrimaryTeamHistoryForChange\(/,
    /export function getEffectiveReportRoleCode\(/
  ].forEach(pattern => {
    assert.doesNotMatch(scheduleSource, pattern);
  });
});

test('Users shell delegates lifecycle month rules to the Agent Lifecycle module', () => {
  assert.match(usersSource, /from\s+'\.\/agent-lifecycle\.js';/);
  assert.match(usersSource, /\bbuildContractMonthDaysFromDate\(/);
  assert.match(usersSource, /\bapplyInactiveCodeToMonth\(/);
  assert.match(usersSource, /\bclearInactiveCodeFromMonth\(/);
  assert.match(usersSource, /\bnormalizeAgentLifecycleDate\(/);

  [
    /function normalizePlannerDate/,
    /function isDateWithinInclusiveRange/,
    /function applyInactiveCodeToMonth/,
    /function clearInactiveCodeFromMonth/,
    /function generateDaysFromDate/
  ].forEach(pattern => {
    assert.doesNotMatch(usersSource, pattern);
  });
});

test('Productivity metrics delegates per-Agent role eligibility to Agent Lifecycle', () => {
  assert.match(productivityMetricsSource, /from\s+'\.\/agent-lifecycle\.js';/);

  [
    /function normalizeBoundaryDate/,
    /export function isPerAgentProductivityRoleExcluded\([^)]*\)\s*\{\s*return Boolean\(getEffectiveReportRoleCode/,
    /export function hasPerAgentProductivityEligibleDate\([^)]*\)\s*\{[\s\S]*while \(current <= endDate\)/
  ].forEach(pattern => {
    assert.doesNotMatch(productivityMetricsSource, pattern);
  });
});
