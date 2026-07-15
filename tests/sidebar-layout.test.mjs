import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SHERPA_VERSION } from '../js/version.js';

const layoutSource = await readFile(new URL('../css/layout.css', import.meta.url), 'utf8');
const componentsSource = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('expanded desktop sidebar keeps a compact shared width', () => {
  assert.match(layoutSource, /--sidebar-expanded-width:\s*208px/);
  assert.match(layoutSource, /\.sidebar\s*\{[^}]*width:\s*var\(--sidebar-expanded-width\)/s);
  assert.match(layoutSource, /\.main-content\s*\{[^}]*margin-left:\s*var\(--sidebar-expanded-width\)/s);
});

test('sidebar logo and navigation use compact desktop dimensions', () => {
  assert.match(layoutSource, /\.logo-canvas\s*\{[^}]*width:\s*88px[^}]*height:\s*88px/s);
  assert.match(layoutSource, /\.nav-item\s*\{[^}]*min-height:\s*42px[^}]*padding:\s*0\.72rem 0\.9rem/s);
  assert.match(componentsSource, /\.sidebar-user-info\s*\{[^}]*padding:\s*10px 12px/s);
});

test('sidebar styles use the current release number as their cache key', () => {
  const version = SHERPA_VERSION.number.replaceAll('.', '\\.');

  assert.match(indexSource, new RegExp(`css/layout\\.css\\?v=${version}`));
  assert.match(indexSource, new RegExp(`css/components\\.css\\?v=${version}`));
});
