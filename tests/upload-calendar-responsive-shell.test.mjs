import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const componentsSource = readFileSync(new URL('../css/components.css', import.meta.url), 'utf8');
const productivitySource = readFileSync(new URL('../js/productivity.js', import.meta.url), 'utf8');

test('upload calendar owns a reusable component layout instead of fixed inline sizing', () => {
  assert.match(htmlSource, /class="upload-calendar-layout"/);
  assert.match(htmlSource, /class="upload-calendar-intro"/);
  assert.doesNotMatch(htmlSource, /min-width:\s*220px/);
  assert.match(componentsSource, /\.upload-calendar-layout\s*\{[^}]*container:\s*upload-layout\s*\/\s*inline-size/s);
  assert.match(componentsSource, /\.upload-calendar-panel\s*\{[^}]*container:\s*upload-calendar\s*\/\s*inline-size[^}]*min-width:\s*0[^}]*max-width:\s*100%/s);
});

test('narrow upload calendars preserve seven usable columns and compact status markers', () => {
  assert.match(componentsSource, /@container upload-calendar \(max-width:\s*420px\)/);
  assert.match(componentsSource, /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(componentsSource, /\.upload-calendar-day\s*\{[^}]*min-height:\s*56px[^}]*align-items:\s*center/s);
  assert.match(componentsSource, /\.upload-calendar-marker\s*\{[^}]*width:\s*16px[^}]*font-size:\s*0/s);
  assert.match(componentsSource, /\.upload-calendar-marker\.marker-xlsx::before\s*\{\s*content:\s*"X"/s);
  assert.match(componentsSource, /\.upload-calendar-marker\.marker-csv::before\s*\{\s*content:\s*"C"/s);
});

test('compact calendar navigation and actions retain stable touch targets', () => {
  assert.match(componentsSource, /\.upload-calendar-nav\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/s);
  assert.match(componentsSource, /\.upload-calendar-actions\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(componentsSource, /\.upload-calendar-actions \.btn\s*\{[^}]*min-height:\s*40px/s);
});

test('current release cache-busts the upload calendar modules', () => {
  assert.match(productivitySource, /from '\.\/productivity-upload-calendar-view\.js\?v=2026\.07\.16'/);
  assert.match(productivitySource, /from '\.\/productivity-upload-calendar-actions\.js\?v=2026\.07\.16'/);
});
