import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import policy from '../../../functions/sherpa-ai-policy.js';
import { createAuthStateRunner } from './auth-state.js';
import { createFirestoreLease } from './lease.js';

const SAFE_ERRORS = new Map([
  ['AUTH_REQUIRED', [401, 'unauthenticated']],
  ['AUTH_DOMAIN_DENIED', [403, 'permission-denied']],
  ['INVALID_REQUEST', [400, 'invalid-argument']],
  ['REQUEST_TOO_LARGE', [413, 'invalid-argument']],
  ['AI_BUSY', [429, 'resource-exhausted']],
  ['AI_RATE_LIMITED', [429, 'resource-exhausted']],
  ['AI_AUTH_INVALID', [503, 'failed-precondition']],
  ['AI_AUTH_PERSIST_FAILED', [503, 'failed-precondition']],
  ['AI_AUTH_RECOVERY_REQUIRED', [503, 'failed-precondition']],
  ['AI_LEASE_LOST', [503, 'unavailable']],
  ['AI_TIMEOUT', [504, 'deadline-exceeded']],
  ['AI_CANCELLED', [503, 'cancelled']],
  ['AI_UNAVAILABLE', [503, 'unavailable']]
]);

function fault(reason) { return Object.assign(new Error('Sherpa AI request failed.'), { reason }); }
function safeError(error) {
  const aliases = { AI_AUTH_REQUIRED: 'AI_AUTH_INVALID', AI_ABORTED: 'AI_CANCELLED', AI_INVALID_REQUEST: 'INVALID_REQUEST' };
  const requestedReason = aliases[error?.reason] || error?.reason;
  const reason = SAFE_ERRORS.has(requestedReason) ? requestedReason : 'AI_UNAVAILABLE';
  const [status, code] = SAFE_ERRORS.get(reason);
  return { status, body: { error: { code, reason, message: 'Sherpa AI request failed.' } } };
}
function send(response, status, value) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'close' });
  response.end(JSON.stringify(value));
}

function readBody(request, maxBytes) {
  return new Promise((resolveBody, reject) => {
    let bytes = 0;
    const chunks = [];
    const timer = setTimeout(() => fail(fault('INVALID_REQUEST')), 10_000);
    timer.unref?.();
    function cleanup() {
      clearTimeout(timer);
      request.off('data', data); request.off('end', end); request.off('error', fail); request.off('aborted', aborted);
    }
    function fail(error) { cleanup(); request.pause(); reject(error); }
    function aborted() { fail(fault('INVALID_REQUEST')); }
    function data(chunk) {
      bytes += chunk.length;
      if (bytes > maxBytes) return fail(fault('REQUEST_TOO_LARGE'));
      chunks.push(chunk);
    }
    function end() {
      cleanup();
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(fault('INVALID_REQUEST')); }
    }
    request.on('data', data); request.once('end', end); request.once('error', fail); request.once('aborted', aborted);
  });
}

function validateEnvelope(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !['uid', 'requestId', 'language', 'contents'].includes(key))
    || typeof body.uid !== 'string' || body.uid.length < 1 || body.uid.length > 128 || /[\x00-\x1f\x7f]/.test(body.uid)
    || typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{12,100}$/.test(body.requestId)) throw fault('INVALID_REQUEST');
  try {
    return { uid: body.uid, requestId: body.requestId, chatRequest: policy.sanitizeConversationRequest({ language: body.language, contents: body.contents }) };
  } catch (error) {
    throw fault(error?.reason === 'REQUEST_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_REQUEST');
  }
}

/** Caller injection is explicit and intended for offline tests; there is no environment bypass. */
export function createWorkerHandler({ generate, verifyCaller, maxRequestBytes = 124_000, maxResponseBytes = 120_000 } = {}) {
  if (typeof generate !== 'function' || typeof verifyCaller !== 'function') throw new TypeError('Worker dependencies are required.');
  return async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') return send(response, 200, { status: 'ok' });
    if (request.method !== 'POST' || request.url !== '/generate') return send(response, 404, { error: { code: 'not-found', message: 'Not found.' } });
    const cancelled = new AbortController();
    const closed = () => { if (!response.writableFinished) cancelled.abort(fault('AI_CANCELLED')); };
    response.once('close', closed);
    try {
      await verifyCaller(request.headers);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')
        || (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')) throw fault('INVALID_REQUEST');
      const declaredLength = request.headers['content-length'];
      if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxRequestBytes)) throw fault('REQUEST_TOO_LARGE');
      const envelope = validateEnvelope(await readBody(request, maxRequestBytes));
      const result = await generate({ ...envelope, signal: cancelled.signal });
      const encoded = JSON.stringify({ response: result });
      if (!result || typeof result !== 'object' || Array.isArray(result)
        || !Array.isArray(result.candidates?.[0]?.content?.parts) || Buffer.byteLength(encoded) > maxResponseBytes) throw fault('AI_UNAVAILABLE');
      send(response, 200, { response: result });
    } catch (error) {
      const mapped = safeError(error);
      send(response, mapped.status, mapped.body);
    } finally { response.off('close', closed); }
  };
}

export function createGoogleCallerVerifier({ client, audience, serviceAccount } = {}) {
  let url;
  try { url = new URL(audience); } catch { /* Reject below. */ }
  if (!client?.verifyIdToken || !url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com$/.test(serviceAccount || '')) throw new TypeError('Worker identity configuration is required.');
  return async headers => {
    // IAM consumes X-Serverless-Authorization; Authorization must retain its original signed token.
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(headers?.authorization || '');
    if (!match || match[1].length > 16_384) throw fault('AUTH_REQUIRED');
    let payload;
    try { payload = (await client.verifyIdToken({ idToken: match[1], audience })).getPayload(); }
    catch { throw fault('AUTH_REQUIRED'); }
    if (payload?.email !== serviceAccount || payload?.email_verified !== true
      || !['accounts.google.com', 'https://accounts.google.com'].includes(payload?.iss)
      || typeof payload?.sub !== 'string' || !payload.sub) throw fault('AUTH_DOMAIN_DENIED');
  };
}

export function createGenerate({ runner, authState, leaseManager, timeoutMs = 240_000, lifecycleSignal } = {}) {
  if (typeof runner !== 'function' || !authState?.run || !leaseManager?.acquire || timeoutMs < 1) throw new TypeError('Generation dependencies are required.');
  return async ({ chatRequest, signal }) => {
    if (signal?.aborted || lifecycleSignal?.aborted) throw fault('AI_CANCELLED');
    const lease = await leaseManager.acquire();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(fault('AI_TIMEOUT')), timeoutMs);
    timer.unref?.();
    const combined = AbortSignal.any([lease.signal, timeout.signal, ...(signal ? [signal] : []), ...(lifecycleSignal ? [lifecycleSignal] : [])]);
    try {
      const response = await authState.run({ lease, signal: combined, execute: codexHome => runner({ chatRequest, codexHome, signal: combined }) });
      if (combined.aborted) throw combined.reason;
      await lease.assertHeld();
      return response;
    } catch (error) {
      if (combined.aborted && !['AI_AUTH_PERSIST_FAILED', 'AI_AUTH_RECOVERY_REQUIRED'].includes(error?.reason)) throw combined.reason;
      throw error;
    } finally {
      clearTimeout(timer);
      await lease.release();
    }
  };
}

export async function startWorker({ env = process.env, lifecycleSignal } = {}) {
  const [{ SecretManagerServiceClient }, { OAuth2Client }, adminApp, adminStore, { createCodexRunner }] = await Promise.all([
    import('@google-cloud/secret-manager'), import('google-auth-library'), import('firebase-admin/app'), import('firebase-admin/firestore'), import('./codex-runner.js')
  ]);
  const verifyCaller = createGoogleCallerVerifier({ client: new OAuth2Client(), audience: env.SHERPA_WORKER_AUDIENCE, serviceAccount: env.SHERPA_CALLER_SERVICE_ACCOUNT });
  const authState = createAuthStateRunner({ secretClient: new SecretManagerServiceClient(), secretName: env.SHERPA_CODEX_AUTH_SECRET });
  if (!adminApp.getApps().length) adminApp.initializeApp();
  const leaseManager = createFirestoreLease({ db: adminStore.getFirestore() });
  const generate = createGenerate({ runner: createCodexRunner({ codexPath: env.SHERPA_CODEX_PATH, timeoutMs: 240_000 }), authState, leaseManager, lifecycleSignal });
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new TypeError('Invalid worker port.');
  const server = createServer(createWorkerHandler({ generate, verifyCaller }));
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolveListen); });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const lifecycle = new AbortController();
  startWorker({ lifecycleSignal: lifecycle.signal }).then(server => {
    process.once('SIGTERM', () => {
      lifecycle.abort(fault('AI_CANCELLED'));
      server.close();
    });
  }).catch(() => { process.stderr.write('Sherpa AI worker could not start.\n'); process.exitCode = 1; });
}
