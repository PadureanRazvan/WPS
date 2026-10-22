const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { defineString } = require('firebase-functions/params');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const {
  PolicyError,
  isAuthorizedEmail,
  sanitizeConversationRequest
} = require('./sherpa-ai-policy');
const { CodexGatewayError, createCodexGateway } = require('./sherpa-codex-gateway');

if (getApps().length === 0) initializeApp();

const db = getFirestore();
const SHERPA_CODEX_WORKER_URL = defineString('SHERPA_CODEX_WORKER_URL', {
  default: '',
  description: 'Private Cloud Run URL for the subscription-authenticated Sherpa Codex worker.'
});
const SHERPA_GATEWAY_SERVICE_ACCOUNT = defineString('SHERPA_GATEWAY_SERVICE_ACCOUNT', {
  default: 'sherpa-ai-gateway@wps-sherpa-database.iam.gserviceaccount.com',
  description: 'Dedicated callable identity allowed to invoke the private Codex worker.'
});
const invokeCodexWorker = createCodexGateway();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 30;
const RATE_LIMIT_COLLECTION = '_server_ai_rate_limits';

async function enforceRateLimit(uid, now = Date.now()) {
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(uid);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() : null;
    const windowStart = Number(current?.windowStart || 0);
    const count = Number(current?.count || 0);

    if (!windowStart || now - windowStart >= RATE_LIMIT_WINDOW_MS) {
      transaction.set(ref, { windowStart: now, count: 1, updatedAt: now });
      return;
    }
    if (count >= RATE_LIMIT_REQUESTS) {
      throw new HttpsError('resource-exhausted', 'Sherpa AI request limit reached.', {
        reason: 'AI_RATE_LIMITED'
      });
    }
    transaction.set(ref, { windowStart, count: count + 1, updatedAt: now });
  });
}

exports.generateSherpaChat = onCall({
  region: 'europe-west8',
  cors: [
    'https://padureanrazvan.github.io',
    /^http:\/\/(localhost|127[.]0[.]0[.]1)(:[0-9]+)?$/
  ],
  serviceAccount: SHERPA_GATEWAY_SERVICE_ACCOUNT,
  enforceAppCheck: false,
  timeoutSeconds: 300,
  memory: '256MiB',
  maxInstances: 10,
  concurrency: 40
}, async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before using Sherpa AI.', {
      reason: 'AUTH_REQUIRED'
    });
  }

  const token = request.auth.token || {};
  if (!isAuthorizedEmail(token.email, token.email_verified === true)) {
    throw new HttpsError('permission-denied', 'This account is not authorized for Sherpa AI.', {
      reason: 'AUTH_DOMAIN_DENIED'
    });
  }

  let chatRequest;
  try {
    chatRequest = sanitizeConversationRequest(request.data);
  } catch (error) {
    if (error instanceof PolicyError) {
      throw new HttpsError('invalid-argument', error.message, { reason: error.reason });
    }
    throw error;
  }

  await enforceRateLimit(request.auth.uid);

  try {
    return await invokeCodexWorker({
      workerUrl: SHERPA_CODEX_WORKER_URL.value(),
      uid: request.auth.uid,
      chatRequest
    });
  } catch (error) {
    const safeError = error instanceof CodexGatewayError ? error
      : new CodexGatewayError('unavailable', 'AI_UNAVAILABLE');
    logger.warn('Sherpa AI cloud worker request failed.', {
      uid: request.auth.uid,
      reason: safeError.reason
    });
    throw new HttpsError(safeError.code, 'Sherpa AI service error.', {
      reason: safeError.reason
    });
  }
});
