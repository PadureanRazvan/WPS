// Isolated inspection of the actual app. Every Firebase SDK import is replaced
// by a local fixture. External connections are blocked by default; the optional
// real-calendar mode permits only the production calendar script and CSS CDN.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const baseline = process.argv.includes('--baseline');
const sourceRoot = baseline ? resolve(root, 'output/experience-polish-20261016/baseline') : root;
const portArgument = process.argv.find(value => value.startsWith('--port='));
const port = Number(portArgument?.split('=')[1] || 0);
if (!Number.isInteger(port) || (port !== 0 && port < 1024) || port > 65535) throw new Error('Invalid local preview port');
const entryFailure = process.argv.includes('--entry-failure');
const entryDelay = Number(process.argv.find(value => value.startsWith('--entry-delay='))?.split('=')[1] || 0);
if (!Number.isFinite(entryDelay) || entryDelay < 0 || entryDelay > 10000) throw new Error('Invalid local entry delay');

const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        const realCalendar = url.searchParams.get('real-calendar') === '1';
        const relative = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
        if (relative === 'js/main.js') {
            if (entryDelay) await new Promise(resolve => setTimeout(resolve, entryDelay));
            if (entryFailure) { response.writeHead(503, { 'Content-Type': 'text/javascript' }); response.end('/* Offline test: entry unavailable */'); return; }
        }
        const isReviewVideo = relative === 'sculpture-review.webm';
        const path = resolve(root, isReviewVideo ? 'output/experience-polish-20261016/sherpa-sculpture-cycle.webm' : relative);
        if (!path.startsWith(root + sep)) throw new Error('Invalid path');
        if (!isReviewVideo && !['index.html', 'favicon.ico'].includes(relative) && !['css/', 'js/', 'assets/', 'scripts/fixtures/'].some(prefix => relative.startsWith(prefix))) throw new Error('Not a preview file');
        const sharedFixture = relative.startsWith('scripts/fixtures/');
        let content = await readFile(sharedFixture || isReviewVideo ? path : resolve(sourceRoot, relative)).catch(error => {
            if (baseline && relative.startsWith('assets/')) return readFile(path);
            throw error;
        });
        if (relative === 'index.html') {
            content = content.toString()
                .replace(/<script\b[^>]*src="https:[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<link\b[^>]*href="https:[^>]*>/gi, '')
                .replace('<head>', '<head>' + (realCalendar ? '' : '<link id="sherpaCalendarStyles" rel="stylesheet" href="/css/base.css">') + '<script src="/scripts/fixtures/experience-globals.js"></script>')
                .replace('</body>', '<script type="module" src="/scripts/fixtures/experience-preview.mjs"></script></body>');
        } else if (extname(path) === '.js' && relative.startsWith('js/')) {
            content = content.toString().replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^'"\s]+/g, '/scripts/fixtures/firebase-preview.js');
        }
        if (isReviewVideo) {
            const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
            const start = range ? Number(range[1]) : 0;
            const end = range && range[2] ? Math.min(Number(range[2]), content.length - 1) : content.length - 1;
            if (start > end || start >= content.length) {
                response.writeHead(416, { 'Content-Range': `bytes */${content.length}` }); response.end(); return;
            }
            response.writeHead(range ? 206 : 200, {
                'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
                ...(range ? { 'Content-Range': `bytes ${start}-${end}/${content.length}` } : {}), 'Cache-Control': 'no-store'
            });
            response.end(content.subarray(start, end + 1)); return;
        }
        response.writeHead(200, {
            'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webm': 'video/webm' })[extname(path)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline'${realCalendar ? ' https://cdn.jsdelivr.net' : ''}; style-src 'self' 'unsafe-inline'${realCalendar ? ' https://cdn.jsdelivr.net' : ''}; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`
        });
        response.end(content);
    } catch (error) {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('Not a local preview asset');
    }
});
server.listen(port, '127.0.0.1', () => console.log(`Sherpa offline experience (${baseline ? 'baseline' : 'working tree'}): http://127.0.0.1:${server.address().port}/`));
