import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHERPA_THEME_CHOICES,
  SHERPA_THEME_IDS,
  getNextTheme,
  getThemeMeta,
  getThemeRevealRadius,
  normalizeTheme,
  normalizeThemePreference,
  resolveThemePreference
} from '../js/theme-system.js';

test('theme registry exposes five palettes plus the system preference', () => {
  assert.deepEqual(SHERPA_THEME_IDS, ['dark', 'aurora', 'light', 'coral', 'fsp']);
  assert.deepEqual(SHERPA_THEME_CHOICES, ['system', 'dark', 'aurora', 'light', 'coral', 'fsp']);
  assert.equal(getThemeMeta('aurora').name, 'Aurora');
  assert.equal(getThemeMeta('coral').accent, '#d44f68');
  assert.equal(getThemeMeta('fsp').name, 'FSP Global');
});

test('legacy and invalid theme values normalize safely', () => {
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('unknown'), 'dark');
  assert.equal(normalizeTheme(null), 'dark');
});

test('system preference follows the operating system color scheme', () => {
  assert.equal(normalizeThemePreference(null), 'system');
  assert.equal(normalizeThemePreference('fsp'), 'fsp');
  assert.equal(resolveThemePreference('system', true), 'dark');
  assert.equal(resolveThemePreference('system', false), 'light');
});

test('theme cycling wraps through every palette', () => {
  assert.equal(getNextTheme('system'), 'dark');
  assert.equal(getNextTheme('dark'), 'aurora');
  assert.equal(getNextTheme('aurora'), 'light');
  assert.equal(getNextTheme('light'), 'coral');
  assert.equal(getNextTheme('coral'), 'fsp');
  assert.equal(getNextTheme('fsp'), 'system');
});

test('theme reveal radius reaches the furthest viewport corner', () => {
  assert.equal(getThemeRevealRadius({ x: 0, y: 0, width: 100, height: 50 }), Math.hypot(100, 50));
  assert.equal(getThemeRevealRadius({ x: 50, y: 50, width: 100, height: 100 }), Math.hypot(50, 50));
});
