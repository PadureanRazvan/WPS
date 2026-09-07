// Local-only UI regression check. No Firebase or model requests leave this process.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SHERPA_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, 'output/security-smoke');
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
    try {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const path = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
        if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error('Invalid path');
        let content = await readFile(path);
        if (extname(path) === '.html') content = content.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(path)] || 'application/octet-stream');
        response.end(content);
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await chromium.launch({ headless: true, ...(process.env.SHERPA_BROWSER_PATH ? { executablePath: process.env.SHERPA_BROWSER_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
        const config = await import('/js/config.js');
        const policy = await import('/js/chat-actions.js');
        const { escapeHtml } = await import('/js/html.js');
        const { buildProductivityOverviewView } = await import('/js/productivity-view.js');
        const loadShell = (source, dependencies, expose) => new Function(...Object.keys(dependencies),
            source.replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '') + '\n' + expose)(...Object.values(dependencies));
        const month = config.getMonthKey(policy.getChatCalendarDate());
        const roster = [{ id: 'a', fullName: 'Alice Example', username: 'alice.example', contractHours: 8,
            primaryTeam: 'RO zooplus', monthlyDays: { [month]: Array(31).fill('') }, monthlyNotes: {} }];
        window.auditCommits = [];
        window.auditResponse = '';
        localStorage.setItem('language', 'en');
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = '';
        window.auditChat = loadShell(await (await fetch('/js/chat.js')).text(), {
            ...config, ...policy,
            getPlannerData: () => roster,
            functions: {}, httpsCallable: () => () => {},
            createSherpaChatService: () => ({ generate: async () => ({ candidates: [{ content: { parts: [{ text: window.auditResponse }] } }] }) }),
            commitAgentChanges: async plan => window.auditCommits.push(plan),
            logActivity() {}, showSection() {}, getChatErrorTranslationKey: () => 'chat-error'
        }, 'initializeChat(); return { clearChat, resetCooldown: () => { lastSendTime = 0; } };');

        // Run the actual renderers in a browser; event-handler injection must remain inert text.
        window.sherpaAuditMarker = 0;
        const attack = '<img src=x onerror="window.sherpaAuditMarker=1">';
        const users = loadShell(await (await fetch('/js/users.js')).text(), {
            escapeHtml, t: key => key, filterUsersDirectory: users => users, getUsersDirectoryTeams: () => [],
            getComparableUserInlineFieldState: () => ''
        }, 'return { render: value => { usersData = value; renderUsersTable(); } };');
        users.render([{ ...roster[0], fullName: attack, username: attack, primaryTeam: '\" autofocus onfocus=\"window.sherpaAuditMarker=1' }]);
        const host = document.createElement('div');
        host.id = 'auditProductivity';
        host.innerHTML = buildProductivityOverviewView({ rows: [{ name: attack, teamsDisplay: attack,
            teams: new Map(), tickets: 1, calls: 0, total: 1, hours: 8, productivity: 0.125 }] }).contentHtml;
        document.body.appendChild(host);
    });
    assert.equal(await page.locator('#usersTableBody img, #auditProductivity img').count(), 0);
    assert.equal(await page.evaluate(() => window.sherpaAuditMarker), 0);
    await page.locator('#chatBubble').click();
    await page.evaluate(() => { window.auditResponse = 'Proposed deletion. [[ACTION:DELETE_AGENT|a]]'; });
    await page.locator('#chatInput').fill('Delete Alice');
    await page.locator('#chatSendBtn').click();
    await page.getByRole('button', { name: 'Apply changes', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.auditCommits.length), 0);
    await page.evaluate(() => { window.auditChat.resetCooldown(); window.auditResponse = 'Cancelled.'; });
    await page.locator('#chatInput').fill('No, do not delete this agent.');
    await page.locator('#chatSendBtn').click();
    await page.getByRole('button', { name: 'Apply changes', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.auditCommits.length), 0);

    await page.evaluate(() => {
        window.auditChat.clearChat();
        window.auditResponse = Array.from({ length: 11 }, (_, i) => `[[ACTION:SET_CELL|a|${i + 1}|8RO]]`).join('\n');
    });
    await page.locator('#chatInput').fill('Schedule these eleven days');
    await page.locator('#chatSendBtn').click();
    await page.getByRole('button', { name: 'Apply changes', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.auditCommits.length), 0);
    await page.screenshot({ path: resolve(output, 'confirmation-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Apply changes', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, 'confirmation-mobile.png') });
    const bounds = await page.getByRole('button', { name: 'Apply changes', exact: true }).boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.height >= 44);
    await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await page.getByText('Changes saved.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.auditCommits.length), 1);
    assert.equal(await page.evaluate(() => window.auditCommits[0].actions.length), 11);
    assert.deepEqual(errors, []);
    console.log('PASS: stored XSS, refusal, bulk confirmation, mobile controls; zero production requests.');
    console.log(`Screenshots: ${output}`);
} finally {
    try { await browser?.close(); }
    finally { await new Promise(done => server.close(done)); }
}
