import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadUploadParsingModule() {
  try {
    return await import('../js/productivity-upload-parsing.js');
  } catch (error) {
    assert.fail(`productivity-upload-parsing.js should be importable: ${error.message}`);
  }
}

test('upload parsing maps queues and languages to productivity teams', async () => {
  const {
    languageToProductivityTeam,
    queueToProductivityTeam
  } = await loadUploadParsingModule();

  assert.equal(queueToProductivityTeam('CS zooplus Main Line'), 'CS');
  assert.equal(queueToProductivityTeam('sk bitiba overflow'), 'SK');
  assert.equal(queueToProductivityTeam('unknown queue'), 'OTHER');
  assert.equal(languageToProductivityTeam('sv-se'), 'SV-SE');
  assert.equal(languageToProductivityTeam('pt-pt'), 'OTHER');
});

test('upload parsing handles quoted CSV fields and answered calls only', async () => {
  const { parseCallsCSV } = await loadUploadParsingModule();
  const csv = [
    'Agent Name,Call Queue Name,Call Status',
    '"Jane.Agent_fsp","CS zooplus, priority","Answered"',
    '"Jane.Agent_fsp","IT zooplus","Missed"',
    '"Mihai Popescu_fsp","HU bitiba","Answered"'
  ].join('\n');

  const parsed = parseCallsCSV(csv);

  assert.equal(parsed.size, 2);
  assert.equal(parsed.get('jane agent').calls, 1);
  assert.equal(parsed.get('jane agent').teams.get('CS'), 1);
  assert.equal(parsed.get('mihai popescu').calls, 1);
  assert.equal(parsed.get('mihai popescu').teams.get('HU'), 1);
});

test('upload parsing reports missing required call columns clearly', async () => {
  const { parseCallsCSV } = await loadUploadParsingModule();

  assert.throws(
    () => parseCallsCSV('Agent Name,Queue\nJane,CS'),
    /Agent Name, Call Status/
  );
});
