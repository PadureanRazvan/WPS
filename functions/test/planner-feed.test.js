const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createRequire } = require('node:module');

process.env.GCLOUD_PROJECT = 'demo-sherpa-backend-test';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';

const { getFirestore } = require('firebase-admin/firestore');
const { plannerFeed } = require('../index');
const {
  EXPORT_HEADERS,
  PlannerFeedError,
  buildPlannerExportCsv,
  buildPlannerExportRows,
  extractPresentedToken,
  getBucharestCalendarToday,
  normalizeCalendarDateKey,
  parseConfiguredTokens,
  resolveFeedRequest,
  verifyFeedToken
} = require('../planner-feed');

const db = getFirestore();
const fromFunctions = createRequire(require.resolve('firebase-functions'));
const express = fromFunctions('express');

const VALID_TOKEN = 'sherpa_feed_test_token_0123456789abcdef';
const ROTATION_TOKEN = 'sherpa_feed_next_token_fedcba9876543210';

function makeAgentFixture(overrides = {}) {
  return {
    id: 'agent-1',
    fullName: 'Ada Planner',
    username: 'ada.planner',
    contractHours: 8,
    contractType: 'Full-time',
    primaryTeam: 'RO zooplus',
    teams: ['RO'],
    // 2026-05-01 00:00 Europe/Bucharest (UTC+3) stored as UTC Firestore Timestamp
    hireDate: { toDate: () => new Date('2026-04-30T21:00:00.000Z') },
    isActive: true,
    monthlyDays: {
      '2026-05': [
        '8RO',
        '4RO+3.5IT',
        'Co',
        '',
        ...Array(27).fill('')
      ]
    },
    monthlyNotes: {
      '2026-05': {
        '1': 'Split shift, "urgent"'
      }
    },
    ...overrides
  };
}

function mockAgentsCollection(t, agents = [makeAgentFixture()], { failWith = null } = {}) {
  let reads = 0;
  const originalCollection = db.collection.bind(db);
  t.mock.method(db, 'collection', name => {
    assert.equal(name, 'agents');
    return {
      async get() {
        reads += 1;
        if (failWith) throw failWith;
        return {
          forEach(callback) {
            for (const agent of agents) {
              const { id, ...data } = agent;
              callback({ id, data: () => data });
            }
          }
        };
      }
    };
  });
  return { getReadCount: () => reads, originalCollection };
}

async function startFeedServer(t) {
  const app = express();
  app.all('/', plannerFeed);
  const server = http.createServer(app);
  t.after(() => new Promise(resolve => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return (method, path, headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      path,
      method,
      headers
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        buffer: Buffer.concat(chunks),
        text: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('Feed HTTP request timed out.')));
    req.on('error', reject);
    req.end();
  });
}

test('Bucharest calendar resolution handles UTC midnight boundary cleanly', () => {
  // 2026-11-30 22:30 UTC is already 2026-12-01 00:30 in Europe/Bucharest (UTC+2)
  const lateUtc = new Date('2026-11-30T22:30:00.000Z');
  const today = getBucharestCalendarToday(lateUtc);
  assert.equal(today.dateKey, '2026-12-01');
  assert.equal(today.monthKey, '2026-12');

  const reqCurrent = resolveFeedRequest({}, lateUtc);
  assert.equal(reqCurrent.from, '2026-12-01');
  assert.equal(reqCurrent.to, '2026-12-31');
  assert.equal(reqCurrent.filename, 'planner-2026-12.csv');

  const reqPrevNext = resolveFeedRequest({ month: 'prev,next', format: 'json' }, lateUtc);
  assert.deepEqual(reqPrevNext.monthKeys, ['2026-11', '2027-01']);
  assert.equal(reqPrevNext.filename, 'planner-2026-11-01-to-2027-01-31.json');
});

test('normalizeCalendarDateKey maps Firestore Timestamps in Europe/Bucharest without off-by-one shift', () => {
  // Midnight Bucharest summer time (+03:00) stored as 21:00 UTC previous day
  assert.equal(
    normalizeCalendarDateKey({ toDate: () => new Date('2026-04-30T21:00:00.000Z') }),
    '2026-05-01'
  );
  // Midnight Bucharest winter time (+02:00) stored as 22:00 UTC previous day
  assert.equal(
    normalizeCalendarDateKey({ toDate: () => new Date('2026-11-30T22:00:00.000Z') }),
    '2026-12-01'
  );
  // Plain YYYY-MM-DD stays literal
  assert.equal(normalizeCalendarDateKey('2026-05-15'), '2026-05-15');
});

test('resolveFeedRequest validates months, ranges, languages, and formats strictly', () => {
  assert.throws(() => resolveFeedRequest({ month: '2026-13' }), err => err instanceof PlannerFeedError && err.status === 400);
  assert.throws(() => resolveFeedRequest({ from: '2026-05-10', to: '2026-05-01' }), err => err.reason === 'INVALID_RANGE');
  assert.throws(() => resolveFeedRequest({ from: '2026-01-01', to: '2027-06-01' }), err => err.reason === 'INVALID_RANGE');
  assert.throws(() => resolveFeedRequest({ month: '2026-05', from: '2026-05-01', to: '2026-05-02' }), err => err.reason === 'AMBIGUOUS_RANGE');
  assert.throws(() => resolveFeedRequest({ lang: 'fr' }), err => err.reason === 'INVALID_LANG');
  assert.throws(() => resolveFeedRequest({ format: 'xml' }), err => err.reason === 'INVALID_FORMAT');
});

test('token parsing and constant-time verification support rotation and reject weak/missing keys', () => {
  assert.deepEqual(parseConfiguredTokens('short'), []);
  assert.deepEqual(parseConfiguredTokens(`${VALID_TOKEN}, ${ROTATION_TOKEN}\n`), [VALID_TOKEN, ROTATION_TOKEN]);

  assert.equal(extractPresentedToken({ 'X-Sherpa-Feed-Key': VALID_TOKEN }), VALID_TOKEN);
  assert.equal(extractPresentedToken({ Authorization: `Bearer ${ROTATION_TOKEN}` }), ROTATION_TOKEN);
  assert.equal(extractPresentedToken({}), '');

  assert.equal(verifyFeedToken(VALID_TOKEN, [VALID_TOKEN, ROTATION_TOKEN]), true);
  assert.equal(verifyFeedToken(ROTATION_TOKEN, [VALID_TOKEN, ROTATION_TOKEN]), true);
  assert.equal(verifyFeedToken('wrong-token-of-different-len', [VALID_TOKEN]), false);
  assert.equal(verifyFeedToken('', [VALID_TOKEN]), false);
});

test('plannerFeed fails closed when secret is missing and rejects unauthenticated or query-string token calls', async t => {
  const prevSecret = process.env.SHERPA_PLANNER_FEED_TOKEN;
  t.after(() => {
    if (prevSecret === undefined) delete process.env.SHERPA_PLANNER_FEED_TOKEN;
    else process.env.SHERPA_PLANNER_FEED_TOKEN = prevSecret;
  });

  const fixture = mockAgentsCollection(t);
  const request = await startFeedServer(t);

  delete process.env.SHERPA_PLANNER_FEED_TOKEN;
  const unconfigured = await request('GET', '/?month=2026-05', { 'x-sherpa-feed-key': VALID_TOKEN });
  assert.equal(unconfigured.status, 503);
  assert.equal(JSON.parse(unconfigured.text).error.reason, 'FEED_NOT_CONFIGURED');

  process.env.SHERPA_PLANNER_FEED_TOKEN = `${VALID_TOKEN},${ROTATION_TOKEN}`;

  const missingHeader = await request('GET', '/?month=2026-05');
  assert.equal(missingHeader.status, 401);

  const queryStringAttempt = await request('GET', `/?month=2026-05&key=${VALID_TOKEN}`);
  assert.equal(queryStringAttempt.status, 401);

  const wrongMethod = await request('POST', '/?month=2026-05', { 'x-sherpa-feed-key': VALID_TOKEN });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.allow, 'GET, HEAD');

  assert.equal(fixture.getReadCount(), 0);
});

test('plannerFeed serves UTF-8 BOM CSV and JSON matching Export CSV schema, supports rotation and fresh bypass', async t => {
  const prevSecret = process.env.SHERPA_PLANNER_FEED_TOKEN;
  process.env.SHERPA_PLANNER_FEED_TOKEN = `${VALID_TOKEN},${ROTATION_TOKEN}`;
  t.after(() => {
    if (prevSecret === undefined) delete process.env.SHERPA_PLANNER_FEED_TOKEN;
    else process.env.SHERPA_PLANNER_FEED_TOKEN = prevSecret;
  });

  const agents = [
    makeAgentFixture({
      id: 'agent-2',
      fullName: 'Zoe Second',
      username: 'zoe',
      primaryTeam: 'IT zooplus',
      teams: ['IT'],
      monthlyDays: { '2026-05': ['8IT', ...Array(30).fill('')] },
      monthlyNotes: {}
    }),
    makeAgentFixture()
  ];
  const fixture = mockAgentsCollection(t, agents);
  const request = await startFeedServer(t);

  const csvRes = await request('GET', '/?from=2026-05-01&to=2026-05-04&fresh=1', {
    'X-Sherpa-Feed-Key': VALID_TOKEN
  });
  assert.equal(csvRes.status, 200);
  assert.equal(csvRes.headers['content-type'], 'text/csv; charset=utf-8');
  assert.equal(csvRes.headers['cache-control'], 'private, no-store');
  assert.equal(csvRes.headers['x-content-type-options'], 'nosniff');
  assert.equal(csvRes.headers['x-sherpa-row-count'], '5');
  // Must start with UTF-8 BOM so Excel displays Romanian diacritics cleanly
  assert.deepEqual([...csvRes.buffer.subarray(0, 3)], [0xef, 0xbb, 0xbf]);

  const lines = csvRes.text.slice(1).split('\n');
  assert.equal(lines[0], EXPORT_HEADERS.join(','));
  assert.equal(lines[1], '2026-05,2026-05-01,VIN,Ada Planner,ada.planner,Full-time,8,RO zooplus,RO,8,8RO,');
  assert.equal(lines[2], '2026-05,2026-05-02,SÂM,Ada Planner,ada.planner,Full-time,8,RO zooplus,RO,4,4RO+3.5IT,"Split shift, ""urgent"""');
  assert.equal(lines[3], '2026-05,2026-05-02,SÂM,Ada Planner,ada.planner,Full-time,8,RO zooplus,IT,3.5,4RO+3.5IT,"Split shift, ""urgent"""');
  assert.equal(lines[4], '2026-05,2026-05-03,DUM,Ada Planner,ada.planner,Full-time,8,RO zooplus,Co,0,Co,');
  assert.equal(lines[5], '2026-05,2026-05-01,VIN,Zoe Second,zoe,Full-time,8,IT zooplus,IT,8,8IT,');
  assert.equal(fixture.getReadCount(), 1);

  // Within burst cache window, Bearer rotation token + team filter + JSON reuses cached agents snapshot
  const jsonRes = await request('GET', '/?from=2026-05-01&to=2026-05-04&team=IT&lang=en&format=json', {
    Authorization: `Bearer ${ROTATION_TOKEN}`
  });
  assert.equal(jsonRes.status, 200);
  assert.equal(fixture.getReadCount(), 1);
  const payload = JSON.parse(jsonRes.text);
  assert.equal(payload.rowCount, 1);
  assert.equal(payload.rows[0].name, 'Zoe Second');
  assert.equal(payload.rows[0].day, 'FRI');

  // HEAD request returns headers and empty body
  const headRes = await request('HEAD', '/?month=2026-05', { 'X-Sherpa-Feed-Key': VALID_TOKEN });
  assert.equal(headRes.status, 200);
  assert.equal(headRes.text, '');
});

test('plannerFeed hides internal Firestore error details', async t => {
  const prevSecret = process.env.SHERPA_PLANNER_FEED_TOKEN;
  process.env.SHERPA_PLANNER_FEED_TOKEN = VALID_TOKEN;
  t.after(() => {
    if (prevSecret === undefined) delete process.env.SHERPA_PLANNER_FEED_TOKEN;
    else process.env.SHERPA_PLANNER_FEED_TOKEN = prevSecret;
  });

  mockAgentsCollection(t, [], { failWith: new Error('secret-internal-firestore-detail') });
  const request = await startFeedServer(t);
  const res = await request('GET', '/?month=2026-05&fresh=1', { 'X-Sherpa-Feed-Key': VALID_TOKEN });
  assert.equal(res.status, 503);
  assert.doesNotMatch(res.text, /secret-internal-firestore-detail/);
  assert.equal(JSON.parse(res.text).error.reason, 'FEED_UNAVAILABLE');
});
