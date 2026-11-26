const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { defineSecret, defineString } = require('firebase-functions/params');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
const {
  PolicyError,
  isAuthorizedEmail,
  sanitizeConversationRequest
} = require('./sherpa-ai-policy');
const { CodexGatewayError, createCodexGateway } = require('./sherpa-codex-gateway');
const {
  EXPORT_HEADERS,
  PlannerFeedError,
  buildPlannerExportCsv,
  buildPlannerExportRows,
  extractPresentedToken,
  parseConfiguredTokens,
  resolveFeedRequest,
  verifyFeedToken
} = require('./planner-feed');

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
const SHERPA_PLANNER_FEED_SERVICE_ACCOUNT = defineString('SHERPA_PLANNER_FEED_SERVICE_ACCOUNT', {
  default: 'sherpa-planner-feed@wps-sherpa-database.iam.gserviceaccount.com',
  description: 'Dedicated read-only identity for the Monthly Planner Excel feed.'
});
const SHERPA_PLANNER_FEED_TOKEN = defineSecret('SHERPA_PLANNER_FEED_TOKEN');
const invokeCodexWorker = createCodexGateway();

const PLANNER_FEED_CACHE_TTL_MS = 5_000;
let cachedAgentsSnapshot = { agents: null, fetchedAt: 0 };

async function loadPlannerAgents({ bypassCache = false, nowMs = Date.now() } = {}) {
  if (
    !bypassCache &&
    cachedAgentsSnapshot.agents &&
    nowMs - cachedAgentsSnapshot.fetchedAt < PLANNER_FEED_CACHE_TTL_MS
  ) {
    return cachedAgentsSnapshot.agents;
  }

  const snapshot = await db.collection('agents').get();
  const agents = [];
  snapshot.forEach(doc => {
    agents.push({ ...doc.data(), id: doc.id });
  });
  cachedAgentsSnapshot = { agents, fetchedAt: nowMs };
  return agents;
}

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

exports.plannerFeed = onRequest({
  region: 'europe-west8',
  cors: false,
  invoker: 'public',
  serviceAccount: SHERPA_PLANNER_FEED_SERVICE_ACCOUNT,
  secrets: [SHERPA_PLANNER_FEED_TOKEN],
  timeoutSeconds: 60,
  memory: '256MiB',
  maxInstances: 5,
  concurrency: 40
}, async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.set('Allow', 'GET, HEAD');
    res.status(405).json({ error: { reason: 'METHOD_NOT_ALLOWED', message: 'Use GET or HEAD.' } });
    return;
  }

  let configuredRaw = '';
  try {
    configuredRaw = SHERPA_PLANNER_FEED_TOKEN.value();
  } catch {
    configuredRaw = '';
  }
  const validTokens = parseConfiguredTokens(configuredRaw);
  if (validTokens.length === 0) {
    logger.error('Sherpa planner feed secret is missing or too short.');
    res.status(503).json({
      error: { reason: 'FEED_NOT_CONFIGURED', message: 'Planner feed is not configured.' }
    });
    return;
  }

  const presentedToken = extractPresentedToken(req.headers);
  if (!verifyFeedToken(presentedToken, validTokens)) {
    res.set('WWW-Authenticate', 'Bearer realm="Sherpa Planner Feed"');
    res.status(401).json({
      error: { reason: 'UNAUTHORIZED', message: 'Valid feed key header required.' }
    });
    return;
  }

  let feedRequest;
  const now = new Date();
  try {
    feedRequest = resolveFeedRequest(req.query, now);
  } catch (error) {
    if (error instanceof PlannerFeedError) {
      res.status(error.status).json({
        error: { reason: error.reason, message: error.message }
      });
      return;
    }
    throw error;
  }

  let agents;
  try {
    agents = await loadPlannerAgents({
      bypassCache: feedRequest.bypassCache,
      nowMs: now.getTime()
    });
  } catch (error) {
    logger.error('Failed to read planner agents for Excel feed.', {
      code: error?.code || 'UNKNOWN'
    });
    res.status(503).json({
      error: { reason: 'FEED_UNAVAILABLE', message: 'Unable to load planner data.' }
    });
    return;
  }

  const rows = buildPlannerExportRows(agents, feedRequest.dates, {
    dayNames: feedRequest.dayNames,
    selectedTeams: feedRequest.selectedTeams
  });
  const generatedAt = now.toISOString();

  res.set('X-Sherpa-Generated-At', generatedAt);
  res.set('X-Sherpa-Row-Count', String(rows.length));
  res.set('X-Sherpa-Range', `${feedRequest.from}..${feedRequest.to}`);

  if (feedRequest.format === 'json') {
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Content-Disposition', `inline; filename="${feedRequest.filename}"`);
    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }
    res.status(200).json({
      month: feedRequest.monthKeys.length === 1 ? feedRequest.monthKeys[0] : null,
      months: feedRequest.monthKeys,
      from: feedRequest.from,
      to: feedRequest.to,
      lang: feedRequest.lang,
      generatedAt,
      rowCount: rows.length,
      headers: EXPORT_HEADERS,
      rows
    });
    return;
  }

  const csv = `\uFEFF${buildPlannerExportCsv(rows)}`;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `inline; filename="${feedRequest.filename}"`);
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }
  res.status(200).send(csv);
});
