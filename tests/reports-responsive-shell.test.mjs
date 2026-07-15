import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const componentsSource = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const responsiveSource = await readFile(new URL('../css/responsive.css', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
const reportsSource = await readFile(new URL('../js/reports.js', import.meta.url), 'utf8');

test('reports content exposes a live component workspace instead of inline placeholder styling', () => {
  assert.match(indexSource, /class="content reports-content"[^>]*id="reportsContent"[^>]*aria-live="polite"/);
  assert.match(indexSource, /class="reports-status" role="status"/);
  assert.doesNotMatch(indexSource, /id="reportsContent"[\s\S]{0,180}style="/);
});

test('reports workspace responds to its own width and stacks its comparison surfaces', () => {
  assert.match(componentsSource, /\.reports-content\s*\{[^}]*container:\s*reports-workspace\s*\/\s*inline-size/s);
  assert.match(componentsSource, /@container reports-workspace \(max-width: 900px\)/);
  assert.match(componentsSource, /\.report-domain-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(componentsSource, /@container reports-workspace \(max-width: 520px\)/);
  assert.match(componentsSource, /\.report-distribution-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
});

test('reports distribution avoids nested scrolling and stale viewport-only card overrides', () => {
  assert.doesNotMatch(componentsSource, /\.report-agent-list\s*\{[^}]*overflow-y/s);
  assert.doesNotMatch(responsiveSource, /\.report-team-card\s*\{[^}]*min-width:\s*100%/s);
  assert.match(componentsSource, /\.report-team-summary:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/s);
});

test('report atlas cache-busts the complete Reports renderer chain', () => {
  assert.match(mainSource, /from '\.\/reports\.js\?v=2026\.07\.16'/);
  assert.match(reportsSource, /from '\.\/report-read-model\.js\?v=2026\.07\.16'/);
  assert.match(reportsSource, /from '\.\/reports-view\.js\?v=2026\.07\.16'/);
});
