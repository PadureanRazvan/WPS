import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('deployment docs record the backup, smoke, and rollback flow', () => {
  const deploymentDoc = readFileSync(new URL('../docs/deployment.md', import.meta.url), 'utf8');

  assert.match(deploymentDoc, /Firestore backup/i);
  assert.match(deploymentDoc, /node scripts\/production-smoke\.mjs --version <commit>/);
  assert.match(deploymentDoc, /single external Chrome/i);
  assert.match(deploymentDoc, /no Firestore writes/i);
  assert.match(deploymentDoc, /Rollback/i);
  assert.match(deploymentDoc, /revert the merge commit/i);
});

test('context documents Runtime Deploy Hardening as an architecture term', () => {
  const context = readFileSync(new URL('../CONTEXT.md', import.meta.url), 'utf8');

  assert.match(context, /\*\*Runtime Deploy Hardening\*\*/);
  assert.match(context, /one external Chrome session/);
});
