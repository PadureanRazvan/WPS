import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const baseSource = await readFile(new URL('../css/base.css', import.meta.url), 'utf8');
const componentsSource = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
const chartSource = await readFile(new URL('../js/charts.js', import.meta.url), 'utf8');

test('dashboard exposes the complete accessible theme selector', () => {
  for (const id of ['dark', 'aurora', 'light', 'coral']) {
    assert.match(indexSource, new RegExp(`data-theme-choice="${id}"`));
  }
  assert.match(indexSource, /id="themeToggle"[^>]*[\s\S]*?aria-haspopup="true"/);
  assert.match(indexSource, /id="themeMenu"[^>]*role="menu"/);
  assert.match(componentsSource, /\.theme-swatch--aurora/);
});

test('all palettes define distinct interface tokens', () => {
  assert.match(baseSource, /\[data-theme="light"\]/);
  assert.match(baseSource, /\[data-theme="aurora"\]/);
  assert.match(baseSource, /\[data-theme="coral"\]/);
  assert.match(baseSource, /--theme-secondary:/);
  assert.match(baseSource, /--surface-glass:/);
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
