// Keep browser module URLs on one release, including otherwise unversioned imports.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SHERPA_VERSION } from '../js/version.js';

const root = new URL('../', import.meta.url);
const version = SHERPA_VERSION.number;
const names = (await readdir(new URL('js/', root))).filter(name => name.endsWith('.js')).sort();
const updates = new Map();
const importPattern = /((?:from\s+|import\s*\(?\s*)['"])(\.\.?\/[^'"\s]+\.js(?:\?[^'"\s]*)?)(['"])/g;
const imports = Object.fromEntries(names.map(name => [`./js/${name}`, `./js/${name}?v=${version}`]));

function addAlias(specifier, parent) {
    const url = new URL(specifier, parent);
    if (url.origin !== 'https://sherpa.invalid' || !url.pathname.startsWith('/js/')) return;
    const canonical = imports['.' + url.pathname];
    if (canonical && '.' + url.pathname + url.search !== canonical) imports['.' + url.pathname + url.search] = canonical;
}

for (const name of names) {
    const path = `js/${name}`;
    const original = await readFile(new URL(path, root), 'utf8');
    const next = original.replace(importPattern, (_match, start, specifier, end) => {
        const refreshed = specifier.replace(/([?&]v=)[^&]+/, `$1${version}`);
        addAlias(refreshed, `https://sherpa.invalid/js/${name}`);
        return start + refreshed + end;
    });
    if (next !== original) updates.set(path, next);
}

const originalHtml = await readFile(new URL('index.html', root), 'utf8');
let html = originalHtml.replace(/<!-- SHERPA_IMPORT_MAP_START -->[\s\S]*?<!-- SHERPA_IMPORT_MAP_END -->\r?\n\r?\n[ \t]*/, '');
html = html.replace(/((?:href|src)=["])((?:js|css)\/[^"?]+\.(?:js|css))(\?[^" ]*)?(["])/g, (_match, start, path, query, end) => {
    const params = new URLSearchParams((query || '').replace(/^\?/, '').replaceAll('&amp;', '&'));
    params.set('v', version);
    if (path === 'js/main.js') params.delete('fsp');
    const specifier = path + '?' + params;
    if (path.startsWith('js/')) addAlias(specifier, 'https://sherpa.invalid/');
    return start + specifier.replaceAll('&', '&amp;') + end;
});
const map = JSON.stringify({ imports: Object.fromEntries(Object.entries(imports).sort(([a], [b]) => a.localeCompare(b))) }, null, 4);
const block = `<!-- SHERPA_IMPORT_MAP_START -->\n    <script type="importmap" id="sherpa-module-map">\n${map}\n    </script>\n    <!-- SHERPA_IMPORT_MAP_END -->\n\n    `;
html = html.replace('<!-- CSS Files -->', block + '<!-- CSS Files -->');
if (html !== originalHtml) updates.set('index.html', html);

if (process.argv.includes('--check')) {
    if (updates.size) throw new Error(`Release assets need refreshing: ${[...updates.keys()].join(', ')}`);
} else {
    for (const [path, content] of updates) await writeFile(new URL(path, root), content);
}
console.log(`${process.argv.includes('--check') ? 'Verified' : 'Updated'} release ${version}: ${names.length} local modules, ${updates.size} changed files (${fileURLToPath(root)}).`);
