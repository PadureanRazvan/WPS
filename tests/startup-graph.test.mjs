import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { auditStartup } from '../scripts/audit-startup.mjs';

test('sign-in never evaluates workforce modules, Three or the Firestore/functions SDKs', async () => {
    const graph = await auditStartup(fileURLToPath(new URL('..', import.meta.url)));
    for (const forbidden of ['app-runtime.js', 'ui.js', 'planner.js', 'productivity.js', 'logo-animation.js', 'firebase-config.js']) {
        assert.ok(!graph.modules.includes(`js/${forbidden}`), forbidden);
    }
    assert.ok(graph.external.some(url => url.endsWith('/firebase-auth.js')));
    assert.ok(!graph.external.some(url => /firebase-(firestore|functions)\.js/.test(url)));
});

test('the document never waits for chart, calendar or archive scripts to paint sign-in', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr[^>]+(?:chart|litepicker|jszip)/);
    assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"[^>]+href="https:/);
});
