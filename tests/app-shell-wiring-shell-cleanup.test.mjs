import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSource = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

test('main shell delegates app visibility and DOM lifecycle wiring to App Shell Wiring', () => {
  assert.match(mainSource, /from\s+'\.\/app-shell-wiring\.js';/);

  [
    'bindAppLifecycleEvents',
    'bindAppRefreshEvents',
    'bindAppShellInteractions',
    'showAuthenticatedShell',
    'showLoginScreen'
  ].forEach(name => {
    assert.match(mainSource, new RegExp(`\\b${name}\\b`));
  });

  [
    /function showLoginScreen\(/,
    /function showApp\(/,
    /function initializeUI\(/,
    /document\.querySelectorAll\('\.nav-item'\)/,
    /document\.querySelector\('\.theme-toggle'\)/,
    /document\.getElementById\('languageMenu'\)/,
    /document\.getElementById\('googleLoginBtn'\)/,
    /document\.addEventListener\('DOMContentLoaded'/,
    /window\.addEventListener\('beforeunload'/,
    /document\.addEventListener\('productivity-data-updated'/
  ].forEach(pattern => {
    assert.doesNotMatch(mainSource, pattern);
  });
});
