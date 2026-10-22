const test = require('node:test');
const assert = require('node:assert/strict');
const { createCodexGateway, validateWorkerUrl } = require('../sherpa-codex-gateway');

const workerUrl = 'https://sherpa-test.europe-west8.run.app';
const input = { workerUrl, uid: 'user-1', chatRequest: {
  language: 'en', contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
} };

test('cloud destination rejects redirects, credentials, custom paths, and arbitrary hosts', () => {
  assert.equal(validateWorkerUrl(workerUrl + '/'), workerUrl);
  for (const url of ['', 'http://localhost', 'https://run.app.evil.test',
    'https://user:pass@sherpa.run.app', workerUrl + '/other', workerUrl + '?target=evil',
    workerUrl + '#fragment', 'https://sherpa.run.app:444']) {
    assert.throws(() => validateWorkerUrl(url), { reason: 'AI_NOT_CONFIGURED' });
  }
});

test('gateway authenticates the private service and preserves text and browser tool rounds', async () => {
  const response = { candidates: [{ content: { role: 'model', parts: [
    { functionCall: { name: 'get_today_status', args: {} } }
  ] } }] };
  const gateway = createCodexGateway({
    identityHeaders: async audience => {
      assert.equal(audience, workerUrl);
      return { Authorization: 'Bearer fixture', 'X-Serverless-Authorization': 'Bearer fixture' };
    },
    fetchImpl: async (url, options) => {
      assert.equal(url, workerUrl + '/generate');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, options.headers['X-Serverless-Authorization']);
      const payload = JSON.parse(options.body);
      assert.equal(payload.uid, input.uid);
      assert.deepEqual(payload.contents, input.chatRequest.contents);
      assert.ok(options.signal instanceof AbortSignal);
      return new Response(JSON.stringify({ response }), { status: 200 });
    }
  });
  assert.deepEqual(await gateway(input), { response });
});

test('gateway returns only safe error reasons and never passes raw worker errors', async () => {
  for (const [status, body, expected] of [
    [503, { error: { code: 'failed-precondition', reason: 'AI_AUTH_RECOVERY_REQUIRED', message: 'secret-sentinel' } }, 'AI_AUTH_RECOVERY_REQUIRED'],
    [429, { error: { code: 'resource-exhausted', reason: 'AI_BUSY' } }, 'AI_BUSY'],
    [500, { error: { code: 'unknown-code', reason: 'secret-sentinel', message: 'secret-sentinel' } }, 'AI_UNAVAILABLE'],
    [200, { response: {} }, 'AI_UNAVAILABLE']
  ]) {
    const gateway = createCodexGateway({ identityHeaders: async () => ({}),
      fetchImpl: async () => new Response(JSON.stringify(body), { status }) });
    await assert.rejects(gateway(input), error => {
      assert.equal(error.reason, expected);
      assert.doesNotMatch(JSON.stringify(error), /secret-sentinel/);
      assert.doesNotMatch(error.message, /secret-sentinel/);
      return true;
    });
  }
});

test('gateway fails closed on invalid JSON, oversized output, and upstream timeout', async () => {
  for (const fetchImpl of [
    async () => new Response('not-json'),
    async () => new Response('x'.repeat(160_001)),
    async () => { throw new DOMException('secret-sentinel', 'TimeoutError'); }
  ]) {
    const gateway = createCodexGateway({ identityHeaders: async () => ({}), fetchImpl });
    await assert.rejects(gateway(input), error => {
      assert.ok(['AI_UNAVAILABLE', 'AI_TIMEOUT'].includes(error.reason));
      assert.doesNotMatch(error.message, /secret-sentinel/);
      return true;
    });
  }
});
