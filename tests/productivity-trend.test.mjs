import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateMatchedTeamTrendPoint } from '../js/productivity-metrics.js';

function entry(originalName, teams) {
  return {
    originalName,
    teams: new Map(Object.entries(teams))
  };
}

test('trend point matches productivity table by excluding unmatched uploaded agents', () => {
  const agents = [
    { fullName: 'Raluca Fabian', username: 'Raluca Fabian_fsp' },
    { fullName: 'Boglarka Vajda', username: 'Boglarka Vajda_fsp' },
    { fullName: 'Assote Essomesan', username: 'Assote Essomesan_fsp' },
    { fullName: 'Timea Szekely', username: 'Timea Szekely_fsp' },
    { fullName: 'Alexandra Morar-Botas', username: 'Alexandra Morar-Botas.fsp' },
    { fullName: 'Bianca Fit', username: 'Bianca Fit_fsp' }
  ];

  const ticketEntries = new Map([
    ['raluca fabian', entry('Raluca Fabian_fsp', { CS: 56 })],
    ['boglarka vajda', entry('Boglarka Vajda_fsp', { CS: 58 })],
    ['assote essomesan', entry('Assote Essomesan_fsp', { CS: 35 })],
    ['timea szekely', entry('Timea Szekely_fsp', { CS: 36 })],
    ['alexandra morar-botas', entry('Alexandra Morar-Botas.fsp', { CS: 11 })],
    ['bianca fit', entry('Bianca Fit_fsp', { CS: 50 })],
    ['katerina svobodova telus', entry('Katerina Svobodova telus', { CS: 30 })],
    ['daniela koycheva-florova telus', entry('Daniela Koycheva-Florova.telus', { CS: 33 })],
    ['gabriela kudlacova telus', entry('Gabriela Kudlacova_telus', { CS: 24 })],
    ['david hrachovina telus', entry('David Hrachovina.telus', { CS: 21 })],
    ['helena rajkova telus', entry('Helena Rajkova.telus', { CS: 11 })],
    ['katerina rigoova telus', entry('Katerina Rigoova telus', { CS: 14 })],
    ['miroslav hovezak telus', entry('Miroslav Hovezak telus', { CS: 12 })],
    ['angel angelov telus', entry('Angel Angelov_telus', { CS: 1 })]
  ]);

  const hoursByAgent = new Map([
    ['Raluca Fabian', 8],
    ['Boglarka Vajda', 9],
    ['Assote Essomesan', 8],
    ['Timea Szekely', 11],
    ['Alexandra Morar-Botas', 0],
    ['Bianca Fit', 0]
  ]);

  const point = calculateMatchedTeamTrendPoint({
    agents,
    team: 'CS',
    ticketEntries,
    callEntries: null,
    getEligibleHoursForTeam: agent => hoursByAgent.get(agent.fullName) || 0
  });

  assert.equal(point.items, 246);
  assert.equal(point.hours, 36);
  assert.equal(point.productivity, 246 / 36);
});
