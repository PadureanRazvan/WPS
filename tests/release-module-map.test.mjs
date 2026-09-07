import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { SHERPA_VERSION } from '../js/version.js';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const mapMatch = html.match(/<script type="importmap" id="sherpa-module-map">([\s\S]*?)<\/script>/);

test('the complete local module graph resolves to one current release URL per module', async () => {
    assert.ok(mapMatch, 'the release map must precede module execution');
    assert.ok(mapMatch.index < html.indexOf('src="js/main.js'));
    const { imports } = JSON.parse(mapMatch[1]);
    const names = (await readdir(new URL('js/', root))).filter(name => name.endsWith('.js'));
    for (const name of names) {
        const canonical = `./js/${name}?v=${SHERPA_VERSION.number}`;
        assert.equal(imports[`./js/${name}`], canonical, name);
        const source = await readFile(new URL(`js/${name}`, root), 'utf8');
        for (const match of source.matchAll(/(?:from\s+|import\s*\(?\s*)['"](\.\.?\/[^'"\s]+\.js(?:\?[^'"\s]*)?)['"]/g)) {
            const url = new URL(match[1], `https://sherpa.invalid/js/${name}`);
            if (!url.pathname.startsWith('/js/')) continue;
            const key = '.' + url.pathname + url.search;
            assert.equal(imports[key] || key, '.' + url.pathname + `?v=${SHERPA_VERSION.number}`, `${name} imports ${match[1]}`);
        }
    }
});

test('entry script and CSS use the current release cache key', () => {
    for (const match of html.matchAll(/(?:href|src)="((?:js|css)\/[^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)) {
        const url = new URL(match[1].replaceAll('&amp;', '&'), 'https://sherpa.invalid/');
        assert.equal(url.searchParams.get('v'), SHERPA_VERSION.number, match[1]);
    }
});
