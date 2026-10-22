import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createWorkerHandler, createGoogleCallerVerifier, createGenerate } from '../src/server.js';

const envelope = { uid: 'staff-user', requestId: 'test-request-00001', language: 'en', contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] };
const answer = { candidates: [{ content: { role: 'model', parts: [{ text: 'Hello' }] } }] };
async function serve(t, deps) {
  const server = createServer(createWorkerHandler(deps));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (url, body = envelope, headers = {}) => fetch(`${url}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('health contains no account/config data and does not authenticate or generate', async t => {
  const url = await serve(t, { generate: () => assert.fail(), verifyCaller: () => assert.fail() });
  const response = await fetch(`${url}/healthz`);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('generation requires authenticated caller before reading data or invoking runner', async t => {
  const url = await serve(t, { generate: () => assert.fail(), verifyCaller: async () => { throw Object.assign(new Error('Private diagnostic'), { reason: 'AUTH_REQUIRED' }); } });
  const response = await post(url);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.reason, 'AUTH_REQUIRED');
});

test('trusted caller envelope is sanitized and response preserves existing browser contract', async t => {
  const url = await serve(t, { verifyCaller: async () => {}, generate: async request => {
    assert.equal(request.uid, envelope.uid);
    assert.equal(request.requestId, envelope.requestId);
    assert.deepEqual(request.chatRequest, { language: envelope.language, contents: envelope.contents });
    assert.ok(request.signal instanceof AbortSignal);
    return answer;
  } });
  const response = await post(url);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { response: answer });
});

test('oversized request and unknown tools fail before generation', async t => {
  const url = await serve(t, { verifyCaller: async () => {}, generate: () => assert.fail() });
  const large = await post(url, { ...envelope, contents: 'x'.repeat(130000) });
  assert.equal(large.status, 413);
  const unsafeTool = await post(url, { ...envelope, contents: [{ role: 'model', parts: [{ functionCall: { name: 'run_shell', args: {} } }] }] });
  assert.equal(unsafeTool.status, 400);
});

test('oversized output and raw upstream errors are suppressed', async t => {
  let call = 0;
  const url = await serve(t, { verifyCaller: async () => {}, generate: async () => {
    if (call++ === 0) return { candidates: [{ content: { parts: [{ text: 'x'.repeat(130000) }] } }] };
    throw new Error('TOKEN=secret-token PROMPT=staff-data');
  } });
  assert.equal((await post(url)).status, 503);
  const result = await (await post(url)).text();
  assert.equal(result.includes('secret-token'), false);
  assert.equal(result.includes('staff-data'), false);
});

test('independent Google token verification checks audience and exact service-account identity', async () => {
  const audience = 'https://worker.example.run.app';
  const account = 'sherpa-caller@test.iam.gserviceaccount.com';
  const verifier = createGoogleCallerVerifier({ audience, serviceAccount: account, client: { async verifyIdToken(options) {
    assert.deepEqual(options, { audience, idToken: 'test.signed.token' });
    return { getPayload: () => ({ email: account, email_verified: true, iss: 'https://accounts.google.com', sub: '123' }) };
  } } });
  await verifier({ authorization: 'Bearer test.signed.token' });
  await assert.rejects(verifier({}), { reason: 'AUTH_REQUIRED' });
  const wrongAccount = createGoogleCallerVerifier({ audience, serviceAccount: account, client: { async verifyIdToken() {
    return { getPayload: () => ({ email: 'someone@example.com', email_verified: true, iss: 'https://accounts.google.com', sub: '123' }) };
  } } });
  await assert.rejects(wrongAccount({ authorization: 'Bearer test.signed.token' }), { reason: 'AUTH_DOMAIN_DENIED' });
});

test('generation lease spans auth load, model, persistence, and only then release', async () => {
  const calls = [];
  const lease = { signal: new AbortController().signal, async assertHeld() { calls.push('assert'); }, async release() { calls.push('release'); } };
  const generate = createGenerate({ leaseManager: { async acquire() { calls.push('acquire'); return lease; } },
    authState: { async run({ execute }) { calls.push('load'); const result = await execute('/isolated-home'); calls.push('persist'); return result; } },
    runner: async ({ codexHome }) => { assert.equal(codexHome, '/isolated-home'); calls.push('model'); return answer; } });
  assert.deepEqual(await generate({ chatRequest: envelope }), answer);
  assert.deepEqual(calls, ['acquire', 'load', 'model', 'persist', 'assert', 'release']);
});

test('timeout aborts runner, waits for auth cleanup, and releases lease', async () => {
  const calls = [];
  const lease = { signal: new AbortController().signal, async assertHeld() {}, async release() { calls.push('release'); } };
  const generate = createGenerate({ timeoutMs: 10, leaseManager: { async acquire() { return lease; } },
    authState: { async run({ execute }) { try { return await execute('/isolated-home'); } finally { calls.push('cleanup'); } } },
    runner: async ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  // Hold an event-loop handle so the intentionally unref'ed production timeout can fire in this isolated test.
  const keepAlive = setInterval(() => {}, 100);
  try { await assert.rejects(generate({ chatRequest: envelope }), { reason: 'AI_TIMEOUT' }); }
  finally { clearInterval(keepAlive); }
  assert.deepEqual(calls, ['cleanup', 'release']);
});

test('service shutdown aborts active child, waits for auth persistence, and rejects new work', async () => {
  const lifecycle = new AbortController();
  const calls = [];
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const lease = { signal: new AbortController().signal, async assertHeld() {}, async release() { calls.push('release'); } };
  const generate = createGenerate({ lifecycleSignal: lifecycle.signal,
    leaseManager: { async acquire() { calls.push('acquire'); return lease; } },
    authState: { async run({ execute }) {
      try { return await execute('/isolated-home'); }
      finally { await new Promise(setImmediate); calls.push('persist-and-cleanup'); }
    } },
    runner: async ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { calls.push('child-aborted'); reject(Object.assign(new Error('Cancelled'), { reason: 'AI_ABORTED' })); }, { once: true });
      started();
    }) });
  const running = generate({ chatRequest: envelope });
  await ready;
  lifecycle.abort(Object.assign(new Error('Shutdown'), { reason: 'AI_CANCELLED' }));
  await assert.rejects(running, { reason: 'AI_CANCELLED' });
  await assert.rejects(generate({ chatRequest: envelope }), { reason: 'AI_CANCELLED' });
  assert.deepEqual(calls, ['acquire', 'child-aborted', 'persist-and-cleanup', 'release']);
});

test('auth recovery requirement survives cancellation and lease release', async () => {
  const lifecycle = new AbortController();
  let released = false;
  const lease = { signal: new AbortController().signal, async assertHeld() {}, async release() { released = true; } };
  const generate = createGenerate({ lifecycleSignal: lifecycle.signal,
    leaseManager: { async acquire() { return lease; } },
    authState: { async run({ execute }) {
      try { return await execute('/isolated-home'); }
      catch { throw Object.assign(new Error('Account recovery required'), { reason: 'AI_AUTH_RECOVERY_REQUIRED' }); }
    } },
    runner: async () => {
      lifecycle.abort(Object.assign(new Error('Shutdown'), { reason: 'AI_CANCELLED' }));
      throw Object.assign(new Error('Child killed'), { reason: 'AI_CANCELLED', authStateUncertain: true });
    } });
  await assert.rejects(generate({ chatRequest: envelope }), { reason: 'AI_AUTH_RECOVERY_REQUIRED' });
  assert.equal(released, true);
});
