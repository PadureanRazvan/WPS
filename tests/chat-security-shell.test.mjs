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
  assert.match(chat, /httpsCallable\(functions, 'generateSherpaChat'\)/);
});

test('Gemini secret access exists only in the Firebase function', async () => {
  const backend = await readWorkspaceFile('functions/index.js');

  assert.match(backend, /defineSecret\('GEMINI_API_KEY'\)/);
  assert.match(backend, /secrets: \[GEMINI_API_KEY\]/);
  assert.match(backend, /isAuthorizedEmail/);
  assert.match(backend, /enforceRateLimit/);
});
