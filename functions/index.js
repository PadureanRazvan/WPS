const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { defineSecret, defineString } = require('firebase-functions/params');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const {
  PolicyError,
  buildGeminiRequest,
  isAuthorizedEmail,
  mapGeminiError,
  sanitizeConversationRequest
} = require('./sherpa-ai-policy');

if (getApps().length === 0) initializeApp();

const db = getFirestore();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const SHERPA_GEMINI_MODEL = defineString('SHERPA_GEMINI_MODEL', {
  default: 'gemini-2.5-flash',
  description: 'Gemini model used by the Sherpa AI callable function.'
});

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

function toHttpsError(mappedError) {
  return new HttpsError(mappedError.code, 'Sherpa AI service error.', {
    reason: mappedError.reason,
    upstreamMessage: mappedError.message
  });
}

exports.generateSherpaChat = onCall({
  region: 'europe-west8',
  cors: [
    'https://padureanrazvan.github.io',
    /^http:\/\/(localhost|127[.]0[.]0[.]1)(:[0-9]+)?$/
  ],
  secrets: [GEMINI_API_KEY],
  enforceAppCheck: false,
  timeoutSeconds: 60,
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

  const model = SHERPA_GEMINI_MODEL.value();
  const key = GEMINI_API_KEY.value();
  if (!key) {
    throw new HttpsError('failed-precondition', 'Sherpa AI has not been configured yet.', {
      reason: 'AI_NOT_CONFIGURED'
    });
  }

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGeminiRequest(chatRequest))
      }
    );
  } catch (error) {
    logger.error('Sherpa AI upstream network request failed.', {
      uid: request.auth.uid,
      model,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new HttpsError('unavailable', 'Sherpa AI is temporarily unavailable.', {
      reason: 'AI_UNAVAILABLE'
    });
  }

  const responseText = await response.text();
  let responseBody;
  try {
    responseBody = responseText ? JSON.parse(responseText) : {};
  } catch {
    responseBody = {};
  }

  if (!response.ok) {
    const mappedError = mapGeminiError(response.status, responseBody);
    logger.warn('Sherpa AI upstream request failed.', {
      uid: request.auth.uid,
      model,
      status: response.status,
      reason: mappedError.reason
    });
    throw toHttpsError(mappedError);
  }

  return { response: responseBody };
});
