import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('productivity refresh button is a true circular icon button', () => {
  const css = readFileSync(new URL('../css/components.css', import.meta.url), 'utf8');
  const rule = css.match(/\.productivity-refresh-btn,\s*\.reports-refresh-btn\s*\{(?<body>[^}]+)\}/);

  assert.ok(rule?.groups?.body, 'expected shared refresh button rule');
  assert.match(rule.groups.body, /width:\s*40px;/);
  assert.match(rule.groups.body, /height:\s*40px;/);
  assert.match(rule.groups.body, /flex:\s*0 0 40px;/);
  assert.match(rule.groups.body, /border-radius:\s*50%;/);
});
