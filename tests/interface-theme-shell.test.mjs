import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const baseSource = await readFile(new URL('../css/base.css', import.meta.url), 'utf8');
const componentsSource = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const layoutSource = await readFile(new URL('../css/layout.css', import.meta.url), 'utf8');
const responsiveSource = await readFile(new URL('../css/responsive.css', import.meta.url), 'utf8');
const chatSource = await readFile(new URL('../css/chat.css', import.meta.url), 'utf8');
const infoSource = await readFile(new URL('../css/info.css', import.meta.url), 'utf8');
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
  assert.match(indexSource, /class="sidebar-utilities"[^>]*aria-label="Interface preferences"/);
  assert.match(indexSource, /<aside class="sidebar"[\s\S]*?id="themeToggle"[\s\S]*?<main class="main-content">/);
  assert.doesNotMatch(indexSource, /<section id="dashboard"[\s\S]*?id="themeToggle"/);
});

test('all palettes define distinct interface tokens', () => {
  assert.match(baseSource, /\[data-theme="light"\]/);
  assert.match(baseSource, /\[data-theme="aurora"\]/);
  assert.match(baseSource, /\[data-theme="coral"\]/);
  assert.match(baseSource, /\[data-theme="fsp"\]/);
  assert.match(baseSource, /--theme-secondary:/);
  assert.match(baseSource, /--surface-glass:/);
  assert.match(baseSource, /accent-color:\s*var\(--accent\)/);
  assert.match(baseSource, /caret-color:\s*var\(--accent\)/);
  assert.doesNotMatch(componentsSource, /\[data-theme="light"\]\s+select option/);
  assert.match(componentsSource, /select option\s*\{[^}]*background:\s*var\(--primary-light\)[^}]*color:\s*var\(--text-primary\)/s);
});

test('header menus use native popovers with anchored entry motion', () => {
  assert.match(indexSource, /id="languageToggle"[^>]*popovertarget="languageMenu"/);
  assert.match(indexSource, /id="languageMenu"[^>]*popover="auto"/);
  assert.match(componentsSource, /@supports selector\(:popover-open\)/);
  assert.match(componentsSource, /position-anchor:\s*--sherpa-theme-toggle/);
  assert.match(componentsSource, /@starting-style/);
  assert.match(componentsSource, /\.sidebar-utilities \.theme-menu\[popover\]\s*\{[^}]*bottom:\s*anchor\(bottom\)/s);
});

test('closed preference popovers cannot cover sibling controls', () => {
  assert.match(
    componentsSource,
    /\.theme-menu\[popover\]:not\(:popover-open\),\s*\.language-menu\[popover\]:not\(:popover-open\)\s*\{[^}]*visibility:\s*hidden[^}]*pointer-events:\s*none/s
  );
  assert.match(
    componentsSource,
    /\.theme-menu\[popover\]:popover-open,\s*\.language-menu\[popover\]:popover-open\s*\{[^}]*visibility:\s*visible[^}]*pointer-events:\s*auto/s
  );
});

test('language control has matching hover and expanded feedback', () => {
  assert.match(
    componentsSource,
    /\.language-dropdown:hover,\s*\.language-dropdown\[aria-expanded="true"\]\s*\{[^}]*border-color:\s*var\(--accent\)[^}]*color:\s*var\(--accent\)/s
  );
  assert.match(componentsSource, /\.language-text\s*\{[^}]*color:\s*inherit/s);
  assert.match(componentsSource, /\.dropdown-arrow\s*\{[^}]*fill:\s*currentColor/s);
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

test('glass surfaces honor the operating system reduced-transparency preference', () => {
  assert.match(baseSource, /@media \(prefers-reduced-transparency:\s*reduce\)/);
  assert.match(baseSource, /--surface-glass:\s*var\(--surface-elevated\)/);
  assert.match(baseSource, /--header-surface:\s*var\(--primary-light\)/);
  assert.match(baseSource, /\.theme-menu,[\s\S]*?backdrop-filter:\s*none\s*!important/);
});

test('charts read live theme tokens and replace old instances', () => {
  assert.match(chartSource, /getThemeChartColors/);
  assert.match(chartSource, /getPropertyValue/);
  assert.match(chartSource, /hoursChartInstance\?\.destroy\(\)/);
});

test('Chat uses semantic theme surfaces instead of Cloud-only overrides', () => {
  assert.doesNotMatch(chatSource, /\[data-theme=/);
  assert.match(chatSource, /background:\s*var\(--primary-light\)/);
  assert.match(chatSource, /background:\s*var\(--surface-elevated\)/);
  assert.match(chatSource, /color:\s*var\(--accent-contrast\)/);
  assert.match(chatSource, /box-shadow:\s*var\(--overlay-shadow\)/);
  assert.match(chatSource, /rgba\(var\(--theme-accent-rgb\),\s*0\.12\)/);
});

test('liquid Info scene is driven by per-palette scene tokens', () => {
  assert.ok((baseSource.match(/--overlay-shadow:/g) || []).length >= 5);
  assert.ok((baseSource.match(/--liquid-opacity:/g) || []).length >= 4);
  assert.ok((baseSource.match(/--liquid-blend-mode:/g) || []).length >= 4);
  assert.match(infoSource, /opacity:\s*var\(--liquid-opacity\)/);
  assert.match(infoSource, /mix-blend-mode:\s*var\(--liquid-blend-mode\)/);
  assert.match(infoSource, /filter:\s*var\(--liquid-hero-shadow\)/);
  assert.doesNotMatch(infoSource, /\[data-theme=/);
});
