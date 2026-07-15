import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const componentsSource = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const logsSource = await readFile(new URL('../js/logs.js', import.meta.url), 'utf8');

test('activity log content announces asynchronous state without exposing a wide table', () => {
    assert.match(indexSource, /class="content logs-content"[^>]*id="logsContent"[^>]*aria-live="polite"[^>]*aria-busy="false"/);
    assert.doesNotMatch(logsSource, /<table class="users-table"/);
    assert.match(logsSource, /container\.setAttribute\('aria-busy', 'true'\)/);
    assert.match(logsSource, /container\.setAttribute\('aria-busy', 'false'\)/);
});

test('activity timeline reflows by component width and preserves compact field labels', () => {
    assert.match(componentsSource, /\.logs-content\s*\{[^}]*container:\s*activity-log\s*\/\s*inline-size/s);
    assert.match(componentsSource, /@container activity-log \(max-width: 760px\)/);
    assert.match(componentsSource, /\.activity-entry-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s);
    assert.match(componentsSource, /\.activity-field-label\s*\{[^}]*position:\s*static/s);
});

test('activity timeline motion is restrained and covered by the global reduced-motion policy', () => {
    assert.match(componentsSource, /@keyframes activity-entry-reveal/);
    assert.match(componentsSource, /animation-delay:\s*calc\(var\(--activity-index\) \* 34ms\)/);
});
