import { readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function auditStartup(root, { fallbackRoot = root, entry = 'js/main.js' } = {}) {
    const modules = new Map(), external = new Set();
    async function visit(path) {
        if (modules.has(path)) return;
        const source = await readFile(resolve(root, path), 'utf8').catch(error => {
            if (root !== fallbackRoot && path.startsWith('assets/')) return readFile(resolve(fallbackRoot, path), 'utf8');
            throw error;
        });
        modules.set(path, Buffer.byteLength(source));
        // Static imports/re-exports define the browser's entry evaluation graph.
        // Dynamic imports intentionally belong to a later interaction or idle task.
        const pattern = /\b(?:import\s+(?!\()(?:[\w\s{},*]+?\s+from\s+)?|export\s+[\w\s{},*]+?\s+from\s+)['"]([^'"]+)['"]/g;
        for (const match of source.matchAll(pattern)) {
            const specifier = match[1];
            if (specifier.startsWith('https:')) external.add(specifier);
            else if (specifier.startsWith('.')) await visit(posix.normalize(posix.join(posix.dirname(path), specifier.split('?')[0])));
        }
    }
    await visit(entry);
    return { localModules: modules.size, localBytes: [...modules.values()].reduce((sum, bytes) => sum + bytes, 0), modules: [...modules.keys()].sort(), external: [...external].sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const root = resolve(import.meta.dirname, '..');
    const baselineArgument = process.argv.find(value => value.startsWith('--baseline='))?.slice('--baseline='.length);
    const before = await auditStartup(resolve(root, baselineArgument || 'output/experience-polish-20261016/baseline'), { fallbackRoot: root })
        .catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    const after = await auditStartup(root);
    console.log(JSON.stringify({ before, after }, null, 2));
}
