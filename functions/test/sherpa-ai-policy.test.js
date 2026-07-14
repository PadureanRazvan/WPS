const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PolicyError,
  buildGeminiRequest,
  getBucharestDateContext,
  isAuthorizedEmail,
  mapGeminiError,
  sanitizeConversationRequest
} = require('../sherpa-ai-policy');

test('authorizes verified company accounts and the temporary support account', () => {
  assert.equal(isAuthorizedEmail('fspsherpa@fspglobal.com', true), true);
  assert.equal(isAuthorizedEmail('REIZVANMAIL@gmail.com', true), true);
  assert.equal(isAuthorizedEmail('someone@gmail.com', true), false);
  assert.equal(isAuthorizedEmail('fspsherpa@fspglobal.com', false), false);
});

test('sanitizes a valid function-calling conversation', () => {
  const result = sanitizeConversationRequest({
    language: 'en',
    contents: [
      { role: 'user', parts: [{ text: 'Who works today?' }] },
      { role: 'model', parts: [{ functionCall: { name: 'get_today_status', args: {} } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'get_today_status', response: { result: '{}' } } }] }
    ]
  });

  assert.equal(result.language, 'en');
  assert.equal(result.contents.length, 3);
});

test('rejects unknown tools and oversized requests', () => {
  assert.throws(
    () => sanitizeConversationRequest({
      language: 'en',
      contents: [{ role: 'model', parts: [{ functionCall: { name: 'read_secret', args: {} } }] }]
    }),
    PolicyError
  );

  assert.throws(
    () => sanitizeConversationRequest({
      language: 'en',
      contents: [{ role: 'user', parts: [{ text: 'x'.repeat(121_000) }] }]
    }),
    error => error instanceof PolicyError && error.reason === 'REQUEST_TOO_LARGE'
  );
});

test('builds the system prompt on the Bucharest calendar date', () => {
  const instant = new Date('2026-06-30T22:30:00.000Z');
  assert.deepEqual(getBucharestDateContext(instant), {
    isoDate: '2026-07-01',
    weekday: 'Wednesday',
    day: 1,
    daysInMonth: 31
  });

  const request = buildGeminiRequest({
    language: 'en',
    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
  }, instant);
  assert.match(request.system_instruction.parts[0].text, /Date: 2026-07-01/);
  assert.equal(request.tools[0].functionDeclarations.length, 7);
});

test('distinguishes denied projects from invalid and rate-limited credentials', () => {
  assert.equal(
    mapGeminiError(403, { error: { message: 'Your project has been denied access. Please contact support.' } }).reason,
    'AI_PROJECT_DENIED'
  );
  assert.equal(mapGeminiError(401, { error: { message: 'Bad key' } }).reason, 'AI_CREDENTIAL_INVALID');
  assert.equal(mapGeminiError(429, { error: { message: 'Quota' } }).reason, 'AI_RATE_LIMITED');
});
