import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { translations } from '../js/config.js';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const baseSource = await readFile(new URL('../css/base.css', import.meta.url), 'utf8');
const componentsSource = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const toastSource = await readFile(new URL('../js/toast-notifications.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
const versionSource = await readFile(new URL('../js/version.js', import.meta.url), 'utf8');

test('application shell owns persistent polite and assertive notification announcers', () => {
  assert.match(indexSource, /id="toastPoliteAnnouncer"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(indexSource, /id="toastAssertiveAnnouncer"[^>]*role="alert"[^>]*aria-live="assertive"/);
  assert.match(indexSource, /id="toastPoliteAnnouncer"[^>]*class="visually-hidden"/);
  assert.match(indexSource, /id="toastAssertiveAnnouncer"[^>]*class="visually-hidden"/);
  assert.match(indexSource, /id="toastViewport"[^>]*class="toast-viewport"[^>]*popover="manual"/);
});

test('notification stack uses top-layer entry motion and safe-area responsive placement', () => {
  assert.match(componentsSource, /\.toast-viewport\[popover\][\s\S]*var\(--safe-area-top\)[\s\S]*var\(--safe-area-right\)/);
  assert.match(componentsSource, /\.toast-viewport:popover-open/);
  assert.match(componentsSource, /allow-discrete/);
  assert.match(componentsSource, /@starting-style[\s\S]*\.toast-notice/);
  assert.match(componentsSource, /@media \(max-width:\s*560px\)[\s\S]*\.toast-viewport\[popover\]/);
  assert.match(componentsSource, /@media \(prefers-reduced-transparency:\s*reduce\)[\s\S]*\.toast-notice/);
  assert.equal((baseSource.match(/--info:\s*#[0-9a-f]{6}/gi) || []).length, 5);
  assert.match(componentsSource, /\.toast-notice--info\s*\{[^}]*var\(--info,/s);
});

test('notifications pause for reading, support dismissal, and avoid message HTML injection', () => {
  assert.match(toastSource, /showPopover/);
  assert.match(toastSource, /hidePopover/);
  assert.match(toastSource, /pausedByPointer/);
  assert.match(toastSource, /pausedByFocus/);
  assert.match(toastSource, /resumeWhenReadable/);
  assert.match(toastSource, /messageElement\.textContent = model\.message/);
  assert.match(toastSource, /toast-notice__dismiss/);
  assert.match(toastSource, /toast-notice__progress/);
});

test('legacy temporary messages delegate to the shared translated notification stack', () => {
  assert.match(uiSource, /showToastNotification\(message,\s*\{[\s\S]*type,[\s\S]*duration,/);
  assert.doesNotMatch(uiSource, /temporary-message|slideIn|slideOut|messageDiv\.style/);

  for (const language of ['ro', 'en', 'it']) {
    for (const key of ['toast-notifications', 'toast-dismiss', 'toast-success', 'toast-error', 'toast-info']) {
      assert.equal(typeof translations[language][key], 'string');
      assert.ok(translations[language][key].length > 0);
    }
  }
});

test('Steady Passage cache-busts the notification module and browser shell', () => {
  assert.match(versionSource, /number:\s*'2026\.07\.16'/);
  assert.match(versionSource, /codename:\s*'Steady Passage'/);
  assert.match(mainSource, /ui\.js\?v=2026\.07\.16/);
  assert.match(uiSource, /toast-notifications\.js\?v=2026\.07\.16/);
});
