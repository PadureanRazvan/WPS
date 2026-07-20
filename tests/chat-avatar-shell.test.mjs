import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [indexSource, chatSource, chatStyles, avatarSource] = await Promise.all([
  read('index.html'),
  read('js/chat.js'),
  read('css/chat.css'),
  read('assets/sherpa-ai-avatar.svg')
]);

test('Sherpa AI uses the vector headset avatar in the bubble and chat header', () => {
  assert.match(indexSource, /id="chatBubble"[^>]*aria-label="Open Sherpa AI"/);
  assert.equal(
    (indexSource.match(/assets\/sherpa-ai-avatar\.svg\?v=2026\.07\.20\.1/g) || []).length,
    2
  );
  assert.doesNotMatch(indexSource, /chatBubbleCanvas|chatHeaderCanvas/);
  assert.doesNotMatch(chatSource, /initChatParticles|createMiniSphere|requestAnimationFrame/);
});

test('avatar is a true animated SVG without an embedded portrait', () => {
  assert.match(avatarSource, /viewBox="0 0 128 128"/);
  assert.match(avatarSource, /class="avatar-eyes"/);
  assert.match(avatarSource, /class="avatar-mic-light"/);
  assert.match(avatarSource, /@keyframes avatar-blink/);
  assert.match(avatarSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(avatarSource, /<image\b|data:image\//);
});

test('avatar treatment includes a theme-aware listening halo and compact mobile size', () => {
  assert.match(chatStyles, /\.chat-bubble::before\s*\{[^}]*conic-gradient/s);
  assert.match(chatStyles, /@keyframes chat-avatar-listening-wave/);
  assert.match(chatStyles, /\.chat-bubble:hover \.chat-avatar/);
  assert.match(chatStyles, /@media \(max-width: 768px\)[\s\S]*\.chat-avatar-frame--bubble\s*\{[^}]*width:\s*42px/s);
});

test('avatar switches into a speaking state for AI replies', () => {
  assert.match(avatarSource, /id="talking"/);
  assert.match(avatarSource, /class="avatar-mouth"/);
  assert.match(avatarSource, /#talking:target ~ \.avatar-portrait \.avatar-mouth/);
  assert.match(avatarSource, /@keyframes avatar-talk-mouth/);
  assert.match(chatSource, /function playAvatarSpeech\(text\)/);
  assert.match(chatSource, /baseSrc \+ '#talking'/);
  assert.match(chatSource, /setAvatarThinking\(show\)/);
  assert.match(chatStyles, /\.chat-avatar-frame\.is-speaking \.chat-avatar/);
  assert.match(chatStyles, /@keyframes chat-avatar-speaking-glow/);
});
