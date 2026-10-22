import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rulesPath = new URL('../firestore.rules', import.meta.url);

test('Firestore rules restrict access to every verified approved Sherpa identity', async () => {
  const rules = await readFile(rulesPath, 'utf8');

  assert.match(rules, /request[.]auth[.]token[.]email_verified == true/);
  assert.match(rules, /fspglobal\[\.\]com/);
  assert.match(rules, /fsp-global\[\.\]com/);
  assert.match(rules, /sharpmindsglobal\[\.\]com/);
  assert.match(rules, /rahela231091@gmail[.]com/);
  assert.match(rules, /rahela[.]vlasa@gmail[.]com/);
  assert.match(rules, /reizvanmail@gmail[.]com/);
  assert.doesNotMatch(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if request[.]auth != null/);
});

test('Firestore rules deny client access to secrets and server rate limits', async () => {
  const rules = await readFile(rulesPath, 'utf8');

  assert.match(rules, /match \/config\/\{configId\}[\s\S]*allow read, write: if false;/);
  assert.match(rules, /match \/_server_ai_rate_limits\/\{userId\}[\s\S]*allow read, write: if false;/);
});

test('Firestore rules enumerate every client-side application collection', async () => {
  const rules = await readFile(rulesPath, 'utf8');

  for (const collection of ['agents', 'productivity', 'schedules', 'activity_logs', 'companion_preferences']) {
    assert.match(rules, new RegExp(`match /${collection}/`));
  }
});

test('companion settings are owner-only, boolean-only, and cannot be listed or deleted by clients', async () => {
  const rules = await readFile(rulesPath, 'utf8');
  const block = rules.match(/match \/companion_preferences\/\{userId\} \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(block);
  assert.match(block, /allow get: if isAuthorizedStaff\(\) && request.auth.uid == userId;/);
  assert.match(block, /allow create, update: if isAuthorizedStaff\(\)\s*&& request.auth.uid == userId/);
  assert.match(block, /keys\(\).hasOnly\(\['ragdollEnabled'\]\)/);
  assert.match(block, /request.resource.data.ragdollEnabled is bool/);
  assert.match(block, /allow list, delete: if false;/);
});
