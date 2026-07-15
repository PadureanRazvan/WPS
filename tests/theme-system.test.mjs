import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHERPA_THEME_IDS,
  getNextTheme,
  getThemeMeta,
  getThemeRevealRadius,
  normalizeTheme
} from '../js/theme-system.js';

test('theme registry exposes four distinct named themes', () => {
  assert.deepEqual(SHERPA_THEME_IDS, ['dark', 'aurora', 'light', 'coral']);
  assert.equal(getThemeMeta('aurora').name, 'Aurora');
  assert.equal(getThemeMeta('coral').accent, '#d44f68');
});

test('legacy and invalid theme values normalize safely', () => {
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('unknown'), 'dark');
  assert.equal(normalizeTheme(null), 'dark');
});

test('theme cycling wraps through every palette', () => {
  assert.equal(getNextTheme('dark'), 'aurora');
  assert.equal(getNextTheme('aurora'), 'light');
  assert.equal(getNextTheme('light'), 'coral');
  assert.equal(getNextTheme('coral'), 'dark');
});

test('theme reveal radius reaches the furthest viewport corner', () => {
  assert.equal(getThemeRevealRadius({ x: 0, y: 0, width: 100, height: 50 }), Math.hypot(100, 50));
  assert.equal(getThemeRevealRadius({ x: 50, y: 50, width: 100, height: 100 }), Math.hypot(50, 50));
});
