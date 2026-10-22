const { randomUUID } = require('node:crypto');
const { GoogleAuth } = require('google-auth-library');

const SAFE_REASONS = new Set([
  'AI_BUSY', 'AI_AUTH_INVALID', 'AI_AUTH_PERSIST_FAILED', 'AI_AUTH_RECOVERY_REQUIRED',
  'AI_LEASE_LOST', 'AI_TIMEOUT', 'AI_RATE_LIMITED', 'AI_NOT_CONFIGURED',
  'INVALID_REQUEST', 'REQUEST_TOO_LARGE', 'AI_UNAVAILABLE'
]);
const SAFE_CODES = new Set([
  'invalid-argument', 'resource-exhausted', 'failed-precondition',
  'unavailable', 'deadline-exceeded', 'internal'
]);

class CodexGatewayError extends Error {
  constructor(code, reason) {
    super('Sherpa AI cloud worker could not complete the request.');
    this.name = 'CodexGatewayError';
    this.code = code;
    this.reason = reason;
  }
}

function validateWorkerUrl(value) {
  if (!value) throw new CodexGatewayError('failed-precondition', 'AI_NOT_CONFIGURED');
  let url;
  try { url = new URL(value); } catch {
    throw new CodexGatewayError('failed-precondition', 'AI_NOT_CONFIGURED');
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.run.app') ||
      url.username || url.password || url.port || url.search || url.hash ||
      !['', '/'].includes(url.pathname)) {
    throw new CodexGatewayError('failed-precondition', 'AI_NOT_CONFIGURED');
  }
  return url.origin;
}

async function getIdentityHeaders(audience) {
  const client = await new GoogleAuth().getIdTokenClient(audience);
  const headers = await client.getRequestHeaders();
  const authorization = typeof headers.get === 'function'
    ? headers.get('authorization') : headers.Authorization || headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    throw new CodexGatewayError('unavailable', 'AI_UNAVAILABLE');
  }
  // Cloud Run consumes the first header; the worker independently checks the second.
  return { 'X-Serverless-Authorization': authorization, Authorization: authorization };
}

function createCodexGateway({ fetchImpl = (...args) => fetch(...args), identityHeaders = getIdentityHeaders,
  timeoutMs = 280_000 } = {}) {
  return async ({ workerUrl, uid, chatRequest }) => {
    const audience = validateWorkerUrl(workerUrl);
    try {
      const response = await fetchImpl(`${audience}/generate`, {
        method: 'POST',
        redirect: 'error',
        headers: { ...await identityHeaders(audience), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...chatRequest, uid, requestId: randomUUID() }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > 160_000) {
        throw new CodexGatewayError('internal', 'AI_UNAVAILABLE');
      }
      let body;
      try { body = JSON.parse(text); } catch {
        throw new CodexGatewayError('unavailable', 'AI_UNAVAILABLE');
      }
      if (!response.ok) {
        const code = SAFE_CODES.has(body?.error?.code) ? body.error.code
          : response.status === 429 ? 'resource-exhausted' : 'unavailable';
        const reason = SAFE_REASONS.has(body?.error?.reason) ? body.error.reason : 'AI_UNAVAILABLE';
        throw new CodexGatewayError(code, reason);
      }
      if (!Array.isArray(body?.response?.candidates) || !body.response.candidates.length) {
        throw new CodexGatewayError('internal', 'AI_UNAVAILABLE');
      }
      return { response: body.response };
    } catch (error) {
      if (error instanceof CodexGatewayError) throw error;
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new CodexGatewayError('deadline-exceeded', 'AI_TIMEOUT');
      }
      throw new CodexGatewayError('unavailable', 'AI_UNAVAILABLE');
    }
  };
}

module.exports = { CodexGatewayError, createCodexGateway, validateWorkerUrl };
