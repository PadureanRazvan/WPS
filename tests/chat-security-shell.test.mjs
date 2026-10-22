import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readWorkspaceFile = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('chat shell has no browser API-key controls or Firestore credential path', async () => {
  const [html, chat] = await Promise.all([
    readWorkspaceFile('index.html'),
    readWorkspaceFile('js/chat.js')
  ]);

  assert.doesNotMatch(html, /chatApiKey|chatSettingsBtn|Gemini API Key/i);
  assert.doesNotMatch(chat, /config['"],\s*['"]gemini|generativelanguage[.]googleapis[.]com|apiKey/i);
  assert.match(chat, /httpsCallable\(functions, 'generateSherpaChat', \{ timeout: 330_000 \}\)/);
});

test('Firebase gateway keeps authentication and rate limits without model credentials', async () => {
  const backend = await readWorkspaceFile('functions/index.js');

  assert.doesNotMatch(backend, /GEMINI_API_KEY|auth[.]json|OPENAI_API_KEY/);
  assert.match(backend, /SHERPA_CODEX_WORKER_URL/);
  assert.match(backend, /serviceAccount: SHERPA_GATEWAY_SERVICE_ACCOUNT/);
  assert.match(backend, /isAuthorizedEmail/);
  assert.match(backend, /enforceRateLimit/);
});
