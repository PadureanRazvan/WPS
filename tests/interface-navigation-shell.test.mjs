import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const componentsSource = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const layoutSource = await readFile(new URL('../css/layout.css', import.meta.url), 'utf8');
const responsiveSource = await readFile(new URL('../css/responsive.css', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
const productivitySource = await readFile(new URL('../js/productivity.js', import.meta.url), 'utf8');

test('main navigation uses native buttons and exposes the active page', () => {
  assert.equal(indexSource.match(/<button type="button" class="nav-item/g)?.length, 9);
  assert.doesNotMatch(indexSource, /<div class="nav-item/);
  assert.match(indexSource, /<nav class="nav-menu"[^>]*aria-label="Main navigation"/);
  assert.match(indexSource, /class="nav-item active"[^>]*aria-current="page"/);
  assert.match(uiSource, /removeAttribute\('aria-current'\)/);
  assert.match(uiSource, /setAttribute\('aria-current', 'page'\)/);
});

test('sidebar and icon-only controls have accessible names and state', () => {
  assert.match(indexSource, /class="sidebar-toggle"[^>]*aria-label="Collapse navigation"[^>]*aria-expanded="true"/);
  assert.match(uiSource, /setAttribute\('aria-expanded', String\(isExpanded\)\)/);
  assert.match(indexSource, /id="prevMonthBtn"[^>]*aria-label="Previous month"/);
  assert.match(indexSource, /id="nextMonthBtn"[^>]*aria-label="Next month"/);
  assert.match(indexSource, /id="chatCloseBtn"[^>]*aria-label="Close Sherpa AI"/);
  assert.match(indexSource, /id="chatSendBtn"[^>]*aria-label="Send message"/);
});

test('operational headers reflow their complete action sets by section width', () => {
  for (const className of ['orar-toolbar', 'productivity-toolbar', 'reports-toolbar', 'logs-toolbar']) {
    assert.match(indexSource, new RegExp(`class="header-actions ${className}"`));
  }
  assert.match(layoutSource, /\.header--adaptive \.header-actions/);
  assert.match(responsiveSource, /@container section-shell \(max-width: 900px\)/);
  assert.match(responsiveSource, /\.header--adaptive\s*\{[^}]*height:\s*auto/s);
  assert.match(responsiveSource, /\.productivity-toolbar\s*\{[^}]*grid-template-columns:/s);
  assert.match(layoutSource, /\.header--adaptive\s*\{[^}]*min-height:\s*80px/s);
  assert.match(componentsSource, /\.header-actions\.productivity-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(180px,/s);
  assert.match(responsiveSource, /\.productivity-date-range\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test('productivity view controls preserve theme contrast', () => {
  assert.match(indexSource, /class="segmented-control"[^>]*role="group"[^>]*aria-label="Productivity view"/);
  assert.match(productivitySource, /var\(--accent-contrast\)/);
  assert.doesNotMatch(productivitySource, /style\.color\s*=\s*view[^;]+\?\s*'#000'/);
});
