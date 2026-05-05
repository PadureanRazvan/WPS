import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const usersSource = readFileSync(new URL('../js/users.js', import.meta.url), 'utf8');

test('Users shell delegates Agent form and lifecycle payload rules to the Users Command module', () => {
  assert.match(usersSource, /from\s+'\.\/users-command\.js';/);

  [
    'buildCreateAgentCommand',
    'buildContractChangeCommand',
    'buildPrimaryTeamChangeCommand',
    'buildDeactivateAgentCommand',
    'buildReactivateAgentCommand',
    'buildInlineUserEditCommand',
    'getComparableUserInlineFieldState'
  ].forEach(name => {
    assert.match(usersSource, new RegExp(`\\b${name}\\b`));
  });

  [
    /function normalizeInlineDateValue\(/,
    /function normalizeInlineFieldValue\(/,
    /function getComparableInlineFieldState\(/,
    /function getComparableInlineDraftState\(/,
    /generateDefaultSchedule\(/,
    /buildContractMonthDaysFromDate\(/,
    /buildPrimaryTeamHistoryForChange\(/,
    /rewriteMonthlyDaysForPrimaryTeamChange\(/,
    /applyInactiveCodeToMonth\(/,
    /clearInactiveCodeFromMonth\(/
  ].forEach(pattern => {
    assert.doesNotMatch(usersSource, pattern);
  });
});
