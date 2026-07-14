import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rulesPath = new URL('../firestore.rules', import.meta.url);

test('Firestore rules restrict access to verified FSP Global identities', async () => {
  const rules = await readFile(rulesPath, 'utf8');

  assert.match(rules, /request[.]auth[.]token[.]email_verified == true/);
  assert.match(rules, /@fspglobal\[\.\]com/);
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

  for (const collection of ['agents', 'productivity', 'schedules', 'activity_logs']) {
    assert.match(rules, new RegExp(`match /${collection}/`));
  }
});
