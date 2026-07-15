import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const baseSource = await readFile(new URL('../css/base.css', import.meta.url), 'utf8');
const componentsSource = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const layoutSource = await readFile(new URL('../css/layout.css', import.meta.url), 'utf8');
const responsiveSource = await readFile(new URL('../css/responsive.css', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
const chartSource = await readFile(new URL('../js/charts.js', import.meta.url), 'utf8');

test('dashboard exposes system, FSP, and the complete accessible theme selector', () => {
  for (const id of ['system', 'dark', 'aurora', 'light', 'coral', 'fsp']) {
    assert.match(indexSource, new RegExp(`data-theme-choice="${id}"`));
  }
  assert.match(indexSource, /id="themeToggle"[^>]*[\s\S]*?aria-haspopup="true"/);
  assert.match(indexSource, /id="themeToggle"[^>]*popovertarget="themeMenu"/);
  assert.match(indexSource, /id="themeMenu"[^>]*popover="auto"/);
  assert.match(componentsSource, /\.theme-swatch--aurora/);
  assert.match(componentsSource, /\.theme-swatch--fsp/);
});

test('all palettes define distinct interface tokens', () => {
  assert.match(baseSource, /\[data-theme="light"\]/);
  assert.match(baseSource, /\[data-theme="aurora"\]/);
  assert.match(baseSource, /\[data-theme="coral"\]/);
  assert.match(baseSource, /\[data-theme="fsp"\]/);
  assert.match(baseSource, /--theme-secondary:/);
  assert.match(baseSource, /--surface-glass:/);
});

test('header menus use native popovers with anchored entry motion', () => {
  assert.match(indexSource, /id="languageToggle"[^>]*popovertarget="languageMenu"/);
  assert.match(indexSource, /id="languageMenu"[^>]*popover="auto"/);
  assert.match(componentsSource, /@supports selector\(:popover-open\)/);
  assert.match(componentsSource, /position-anchor:\s*--sherpa-theme-toggle/);
  assert.match(componentsSource, /@starting-style/);
});

test('dashboard reflows by content width and mobile controls preserve usable targets', () => {
  assert.match(layoutSource, /container:\s*sherpa-content\s*\/\s*inline-size/);
  assert.match(componentsSource, /@container sherpa-content \(max-width: 560px\)/);
  assert.match(responsiveSource, /\.chart-month-btn\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/s);
  assert.match(responsiveSource, /\.sidebar \.logo h1\s*\{[^}]*display:\s*none/s);
});

test('motion is progressively enhanced and has a reduced-motion path', () => {
  assert.match(uiSource, /document\.startViewTransition/);
  assert.match(uiSource, /::view-transition-new\(root\)/);
  assert.match(baseSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(baseSource, /view-transition-name: sherpa-section/);
});

test('charts read live theme tokens and replace old instances', () => {
  assert.match(chartSource, /getThemeChartColors/);
  assert.match(chartSource, /getPropertyValue/);
  assert.match(chartSource, /hoursChartInstance\?\.destroy\(\)/);
});
