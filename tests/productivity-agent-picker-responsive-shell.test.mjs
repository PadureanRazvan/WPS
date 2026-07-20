import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('productivity per-agent picker uses combobox, listbox, and top-layer semantics', async () => {
  const html = await read('../index.html');
  const pickerMarkup = html.match(/<div id="agentSelectorSection"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] || '';

  assert.match(pickerMarkup, /role="combobox"/);
  assert.match(pickerMarkup, /aria-autocomplete="list"/);
  assert.match(pickerMarkup, /aria-controls="agentChipsContainer"/);
  assert.match(pickerMarkup, /aria-expanded="false"/);
  assert.match(pickerMarkup, /popover="auto"/);
  assert.match(pickerMarkup, /role="listbox"/);
  assert.match(pickerMarkup, /aria-live="polite"/);
  assert.doesNotMatch(pickerMarkup, /style=/);
  assert.doesNotMatch(pickerMarkup, /chart-container/);
});

test('productivity agent picker has responsive fallback and progressive anchor positioning', async () => {
  const css = await read('../css/components.css');
  const comboboxSource = await read('../js/productivity-agent-combobox.js');

  assert.match(css, /container:\s*productivity-agent-picker\s*\/\s*inline-size/);
  assert.match(css, /@container productivity-agent-picker \(max-width:\s*420px\)/);
  assert.match(css, /max-height:\s*min\(24rem,\s*calc\(100dvh/);
  assert.match(css, /var\(--safe-area-left\)/);
  assert.match(css, /@supports \(anchor-name:\s*--productivity-agent-search\) and \(position-area:\s*block-end\)/);
  assert.match(css, /position-anchor:\s*--productivity-agent-search/);
  assert.match(css, /position-try-fallbacks:\s*flip-block,\s*flip-inline/);
  assert.match(css, /@media \(prefers-reduced-transparency:\s*reduce\)/);
  assert.match(comboboxSource, /getBoundingClientRect/);
  assert.match(comboboxSource, /aria-activedescendant/);
  assert.match(comboboxSource, /ArrowDown/);
  assert.match(comboboxSource, /Escape/);
});

test('Human Touch cache-busts the productivity picker and shared shell', async () => {
  const [html, productivitySource, versionSource] = await Promise.all([
    read('../index.html'),
    read('../js/productivity.js'),
    read('../js/version.js')
  ]);

  assert.match(versionSource, /number:\s*'2026\.07\.20\.1'/);
  assert.match(versionSource, /codename:\s*'Human Touch'/);
  assert.match(productivitySource, /config\.js\?v=2026\.07\.20\.1/);
  assert.match(productivitySource, /productivity-controls\.js\?v=2026\.07\.20\.1/);
  assert.match(productivitySource, /productivity-agent-actions\.js\?v=2026\.07\.20\.1/);
  assert.match(productivitySource, /productivity-agent-selection-view\.js\?v=2026\.07\.20\.1/);
  assert.match(productivitySource, /productivity-agent-combobox\.js\?v=2026\.07\.20\.1/);
  assert.match(html, /components\.css\?v=2026\.07\.20\.1/);
  assert.match(html, /main\.js\?v=2026\.07\.20\.1/);
  assert.doesNotMatch(html, /<script src="js\/(?:config|ui|charts|planner|dashboard|users|productivity|logo-animation)\.js/);
});
