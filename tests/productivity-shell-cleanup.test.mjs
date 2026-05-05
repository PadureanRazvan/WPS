import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const productivitySource = readFileSync(new URL('../js/productivity.js', import.meta.url), 'utf8');

test('productivity shell has no legacy globals or shallow pass-through helpers', () => {
  [
    /window\.__/,
    /function normalizeName\(/,
    /function getEligibleHoursForRange\(/,
    /function getEligibleHoursForTeamInRange\(/,
    /function getDaysInRange\(/,
    /function formatDateKey\(/,
    /\bgetEligibleHoursForRange\b(?!\s*:)/,
    /\bgetEligibleHoursForTeamInRange\b(?!\s*:)/,
  ].forEach(pattern => {
    assert.doesNotMatch(productivitySource, pattern);
  });
});
