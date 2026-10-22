const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createRequire } = require('node:module');

// Each test file runs in its own process. No real credentials, database or model calls.
process.env.GCLOUD_PROJECT = 'demo-sherpa-backend-test';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';
process.env.SHERPA_CODEX_WORKER_URL = 'https://sherpa-fixture-test.a.run.app';
const { GoogleAuth } = require('google-auth-library');
const { generateSherpaChat } = require('../index');
const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore();
const fromFunctions = createRequire(require.resolve('firebase-functions'));
const express = fromFunctions('express');

const validRequest = () => ({
  auth: { uid: 'fixture-user', token: { email: 'fixture@fspglobal.com', email_verified: true } },
  data: { language: 'en', contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] }
});

function isolateServices(t, { status = 200, body = { response: { candidates: [{ content: { parts: [{ text: 'Ready' }] } }] } }, networkError } = {}) {
  const records = new Map();
  const requests = [];
  const transactions = t.mock.method(db, 'runTransaction', async work => work({
    async get(ref) {
      assert.match(ref.path, /^_server_ai_rate_limits\/fixture-/);
      return { exists: records.has(ref.path), data: () => records.get(ref.path) };
    },
    set(ref, value) { records.set(ref.path, value); }
  }));
  t.mock.method(GoogleAuth.prototype, 'getIdTokenClient', async audience => {
    assert.equal(audience, process.env.SHERPA_CODEX_WORKER_URL);
    return { getRequestHeaders: async () => new Headers({ authorization: 'Bearer fixture-identity-token' }) };
  });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).hostname, 'sherpa-fixture-test.a.run.app');
    requests.push({ url, options });
    if (networkError) throw networkError;
    return new Response(JSON.stringify(body), { status });
  });
  return { records, requests, transactions };
}

test('real callable HTTP wrapper rejects unsigned and malformed requests and keeps CORS behavior', async t => {
  const fixtures = isolateServices(t);
  const app = express();
  app.use(express.json());
  app.post('/', generateSherpaChat);
  app.options('/', generateSherpaChat);
  const server = http.createServer(app);
  t.after(() => new Promise(resolve => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const request = (method, origin, body) => new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: server.address().port, path: '/', method,
      headers: { 'content-type': 'application/json', origin, 'access-control-request-method': 'POST' }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('Local callable HTTP request timed out.')));
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  for (const origin of ['https://padureanrazvan.github.io', 'http://127.0.0.1:8766']) {
    const response = await request('OPTIONS', origin);
    assert.equal(response.status, 204);
    assert.equal(response.headers['access-control-allow-origin'], origin);
  }
  const foreign = await request('OPTIONS', 'https://untrusted.invalid');
  assert.equal(foreign.headers['access-control-allow-origin'], undefined);
  const unsigned = await request('POST', 'https://padureanrazvan.github.io', { data: validRequest().data });
  assert.equal(unsigned.status, 401);
  assert.equal(JSON.parse(unsigned.text).error.status, 'UNAUTHENTICATED');
  const malformed = await request('POST', 'https://padureanrazvan.github.io', { unexpected: true });
  assert.equal(malformed.status, 400);
  assert.equal(JSON.parse(malformed.text).error.status, 'INVALID_ARGUMENT');
  assert.equal(fixtures.transactions.mock.callCount(), 0);
  assert.equal(fixtures.requests.length, 0);
});

test('callable rejects unauthorized identities and invalid data before touching services', async t => {
  const fixtures = isolateServices(t);
  for (const auth of [
    undefined,
    { uid: 'fixture-user', token: { email: 'fixture@fspglobal.com', email_verified: false } },
    { uid: 'fixture-user', token: { email: 'fixture@untrusted.invalid', email_verified: true } }
  ]) {
    await assert.rejects(generateSherpaChat.run({ ...validRequest(), auth }), error => {
      assert.equal(error.code, auth ? 'permission-denied' : 'unauthenticated');
      return true;
    });
  }
  await assert.rejects(generateSherpaChat.run({ ...validRequest(), data: { contents: [] } }), { code: 'invalid-argument' });
  assert.equal(fixtures.transactions.mock.callCount(), 0);
  assert.equal(fixtures.requests.length, 0);
});

test('callable preserves the model request and response contract with installed Firebase SDKs', async t => {
  const fixtures = isolateServices(t);
  const result = await generateSherpaChat.run(validRequest());
  assert.equal(result.response.candidates[0].content.parts[0].text, 'Ready');
  assert.equal(fixtures.records.get('_server_ai_rate_limits/fixture-user').count, 1);
  assert.equal(fixtures.requests.length, 1);
  const { url, options } = fixtures.requests[0];
  assert.equal(new URL(url).pathname, '/generate');
  assert.equal(options.method, 'POST');
  const request = JSON.parse(options.body);
  assert.deepEqual(request.contents, validRequest().data.contents);
  assert.equal(request.uid, validRequest().auth.uid);
  assert.match(request.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(options.headers.Authorization, 'Bearer fixture-identity-token');
  assert.equal(options.headers['X-Serverless-Authorization'], options.headers.Authorization);
  assert.equal(options.redirect, 'error');
  assert.equal(request.system_instruction, undefined);
});

test('callable enforces per-user rate limits and opens the next window', async t => {
  const fixtures = isolateServices(t);
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  for (let count = 0; count < 30; count++) await generateSherpaChat.run(validRequest());
  await assert.rejects(generateSherpaChat.run(validRequest()), error => {
    assert.equal(error.code, 'resource-exhausted');
    assert.equal(error.details.reason, 'AI_RATE_LIMITED');
    return true;
  });
  assert.equal(fixtures.requests.length, 30);
  assert.equal(fixtures.records.get('_server_ai_rate_limits/fixture-user').count, 30);
  const otherUser = validRequest();
  otherUser.auth.uid = 'fixture-other-user';
  await generateSherpaChat.run(otherUser);
  assert.equal(fixtures.records.get('_server_ai_rate_limits/fixture-other-user').count, 1);
  now += 60_000;
  await generateSherpaChat.run(validRequest());
  assert.equal(fixtures.records.get('_server_ai_rate_limits/fixture-user').count, 1);
});

test('callable preserves upstream error mapping without making external requests', async t => {
  for (const [status, reason] of [[412, 'AI_AUTH_INVALID'], [429, 'AI_BUSY'], [503, 'AI_UNAVAILABLE']]) {
    await t.test(`HTTP ${status}`, async child => {
      isolateServices(child, { status, body: { error: { reason, message: 'Fixture rejection' } } });
      await assert.rejects(generateSherpaChat.run(validRequest()), error => error.details.reason === reason);
    });
  }
  await t.test('network failure', async child => {
    isolateServices(child, { networkError: new Error('Fixture network failure') });
    await assert.rejects(generateSherpaChat.run(validRequest()), error => error.code === 'unavailable' && error.details.reason === 'AI_UNAVAILABLE');
  });
});
