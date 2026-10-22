import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthStateRunner } from '../src/auth-state.js';

const SECRET = 'projects/test-project/secrets/sherpa-codex-auth';
const credentials = suffix => ({ auth_mode: 'chatgpt', OPENAI_API_KEY: null,
  tokens: { access_token: `test-access-${suffix}`, refresh_token: `test-refresh-${suffix}`, id_token: `test-id-${suffix}`, account_id: 'test-account' } });

async function fixture(t, { initial = credentials('before'), saveFails = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sherpa-auth-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const saved = [];
  const controller = new AbortController();
  const lease = { signal: controller.signal,
    async assertHeld() { calls.push('assert'); if (controller.signal.aborted) throw Object.assign(new Error('Lost'), { reason: 'AI_LEASE_LOST' }); },
    async markAuthInUse() { calls.push('begin'); }, async markAuthSettled() { calls.push('settled'); },
    async quarantine() { calls.push('quarantine'); } };
  const secretClient = {
    async accessSecretVersion({ name }) { assert.equal(name, `${SECRET}/versions/latest`); calls.push('read'); return [{ payload: { data: Buffer.from(JSON.stringify(initial)) } }]; },
    async addSecretVersion({ parent, payload }) { assert.equal(parent, SECRET); calls.push('save'); if (saveFails) throw new Error('Sensitive provider detail'); saved.push(Buffer.from(payload.data)); return [{ name: `${SECRET}/versions/2` }]; }
  };
  return { root, calls, saved, lease, controller, runner: createAuthStateRunner({ secretClient, secretName: SECRET, tempRoot: root }) };
}

test('restores dedicated auth in isolated home, saves refreshed credentials, then removes home', async t => {
  const f = await fixture(t);
  const result = await f.runner.run({ lease: f.lease, execute: async home => {
    assert.deepEqual(JSON.parse(await readFile(join(home, 'auth.json'), 'utf8')), credentials('before'));
    await writeFile(join(home, 'auth.json'), JSON.stringify(credentials('after')));
    return { reply: 'ok' };
  } });
  assert.deepEqual(result, { reply: 'ok' });
  assert.deepEqual(JSON.parse(f.saved[0]), credentials('after'));
  assert.ok(f.calls.indexOf('assert') < f.calls.indexOf('read'));
  assert.ok(f.calls.indexOf('begin') < f.calls.indexOf('save'));
  assert.ok(f.calls.indexOf('save') < f.calls.indexOf('settled'));
  assert.deepEqual(await readdir(f.root), []);
});

test('refresh is persisted even when model generation fails', async t => {
  const f = await fixture(t);
  const originalError = Object.assign(new Error('Model failed'), { reason: 'AI_TIMEOUT' });
  await assert.rejects(f.runner.run({ lease: f.lease, execute: async home => {
    await writeFile(join(home, 'auth.json'), JSON.stringify(credentials('after')));
    throw originalError;
  } }), error => error === originalError);
  assert.equal(f.saved.length, 1);
  assert.ok(f.calls.includes('settled'));
  assert.deepEqual(await readdir(f.root), []);
});

test('unchanged credentials do not create redundant secret versions', async t => {
  const f = await fixture(t);
  await f.runner.run({ lease: f.lease, execute: async () => 'ok' });
  assert.equal(f.saved.length, 0);
  assert.ok(f.calls.includes('settled'));
});

test('forced child termination quarantines unchanged valid credentials instead of settling', async t => {
  const f = await fixture(t);
  await assert.rejects(f.runner.run({ lease: f.lease, execute: async () => {
    throw Object.assign(new Error('Child was killed'), { reason: 'AI_CANCELLED', authStateUncertain: true });
  } }), { reason: 'AI_AUTH_RECOVERY_REQUIRED' });
  assert.equal(f.saved.length, 0);
  assert.ok(f.calls.includes('quarantine'));
  assert.equal(f.calls.includes('settled'), false);
  assert.deepEqual(await readdir(f.root), []);
});

test('forced child termination saves observed refresh then quarantines without settling', async t => {
  const f = await fixture(t);
  await assert.rejects(f.runner.run({ lease: f.lease, execute: async home => {
    await writeFile(join(home, 'auth.json'), JSON.stringify(credentials('after')));
    throw Object.assign(new Error('Child was killed'), { reason: 'AI_TIMEOUT', authStateUncertain: true });
  } }), { reason: 'AI_AUTH_RECOVERY_REQUIRED' });
  assert.deepEqual(JSON.parse(f.saved[0]), credentials('after'));
  assert.ok(f.calls.indexOf('save') < f.calls.indexOf('quarantine'));
  assert.equal(f.calls.includes('settled'), false);
  assert.deepEqual(await readdir(f.root), []);
});

test('API key or incomplete ChatGPT auth is rejected before execution', async t => {
  const f = await fixture(t, { initial: { ...credentials('before'), OPENAI_API_KEY: 'not-a-real-key' } });
  await assert.rejects(f.runner.run({ lease: f.lease, execute: async () => assert.fail('Must not execute') }), { reason: 'AI_AUTH_INVALID' });
  assert.deepEqual(await readdir(f.root), []);
  assert.equal(f.calls.includes('begin'), false);
});

test('persistence failure quarantines account, suppresses model result, and removes credentials', async t => {
  const f = await fixture(t, { saveFails: true });
  await assert.rejects(f.runner.run({ lease: f.lease, execute: async home => {
    await writeFile(join(home, 'auth.json'), JSON.stringify(credentials('after')));
    return 'Result must not escape';
  } }), error => error.reason === 'AI_AUTH_PERSIST_FAILED' && !error.message.includes('Sensitive'));
  assert.ok(f.calls.includes('quarantine'));
  assert.equal(f.calls.includes('settled'), false);
  assert.deepEqual(await readdir(f.root), []);
});

test('lease loss prevents stale owner from saving auth over a newer owner', async t => {
  const f = await fixture(t);
  await assert.rejects(f.runner.run({ lease: f.lease, execute: async home => {
    await writeFile(join(home, 'auth.json'), JSON.stringify(credentials('after')));
    f.controller.abort();
    return 'Result must not escape';
  } }), { reason: 'AI_LEASE_LOST' });
  assert.equal(f.saved.length, 0);
  assert.equal(f.calls.includes('settled'), false);
});

test('invalid auth written by child fails closed and quarantines rather than saving corrupted state', async t => {
  const f = await fixture(t);
  await assert.rejects(f.runner.run({ lease: f.lease, execute: async home => {
    await writeFile(join(home, 'auth.json'), '{}');
  } }), { reason: 'AI_AUTH_PERSIST_FAILED' });
  assert.equal(f.saved.length, 0);
  assert.ok(f.calls.includes('quarantine'));
});

test('cooperative cancellation without uncertain termination saves auth and settles before cleanup', async t => {
  const f = await fixture(t);
  const lifecycle = new AbortController();
  await assert.rejects(f.runner.run({ lease: f.lease, signal: lifecycle.signal, execute: async home => {
    await writeFile(join(home, 'auth.json'), JSON.stringify(credentials('after')));
    lifecycle.abort(Object.assign(new Error('Shutdown'), { reason: 'AI_CANCELLED' }));
    throw lifecycle.signal.reason;
  } }), { reason: 'AI_CANCELLED' });
  assert.equal(f.saved.length, 1);
  assert.ok(f.calls.includes('settled'));
  assert.deepEqual(await readdir(f.root), []);
});
