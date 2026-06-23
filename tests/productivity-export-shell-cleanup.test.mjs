import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const productivitySource = readFileSync(new URL('../js/productivity.js', import.meta.url), 'utf8');
const controlsSource = readFileSync(new URL('../js/productivity-controls.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../css/components.css', import.meta.url), 'utf8');

test('productivity shell exposes a selection export button in the header', () => {
  assert.match(indexSource, /id="productivityExportBtn"/);
  assert.match(indexSource, /class="[^"]*\bproductivity-export-btn\b[^"]*"/);
  assert.match(indexSource, /data-translate="prod-export-selection"/);
  assert.match(indexSource, /data-translate-title="prod-export-selection-title"/);
});

test('productivity shell wires current selection export through controls', () => {
  assert.match(productivitySource, /from\s+'\.\/productivity-export-command\.js';/);
  assert.match(productivitySource, /exportCurrentSelection:\s*exportCurrentSelection/);
  assert.match(controlsSource, /productivityExportBtn/);
});

test('productivity export button has its own polished header styling hook', () => {
  assert.match(cssSource, /\.productivity-export-btn\s*\{/);
  assert.match(cssSource, /\.productivity-export-btn:hover\s*\{/);
  assert.match(cssSource, /\.productivity-export-icon\s*\{/);
});
