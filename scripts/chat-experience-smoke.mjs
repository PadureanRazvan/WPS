import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Run only against scripts/experience-studio.mjs. Its local Firebase fixture and
// restrictive CSP isolate this real-DOM review from accounts, AI and Firestore.
// SHERPA_PLAYWRIGHT_PATH may name an existing Playwright package directory.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SHERPA_PLAYWRIGHT_PATH || 'playwright');
const base = process.argv.find(value => value.startsWith('--url='))?.slice(6) || 'http://127.0.0.1:4173';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use the offline preview only.');
const output = resolve(import.meta.dirname, '../output/chat-experience');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], errors = [];
const fixtureAgent = {
    fullName: 'Alex Preview', username: 'alex.preview', primaryTeam: 'RO',
    contractType: 'Full-time', contractHours: 8, isActive: true,
    monthlyDays: {}, monthlyNotes: {}, hireDate: null
};

async function setup(page) {
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        window.chatSmoke = { calls: [], pending: [], writes: [] };
    });
    await page.route('**/scripts/fixtures/firebase-preview.js', async route => {
        const response = await route.fetch();
        let source = await response.text();
        assert.ok(source.includes('Offline preview does not call AI'), 'Expected the offline Firebase fixture.');
        source += `\nconst smokeAgent = ${JSON.stringify(fixtureAgent)};
const smokeDoc = { id: 'preview-agent', exists: () => true, data: () => structuredClone(smokeAgent) };
function smokeSnapshot(target) {
    if (target?.path !== 'agents') return emptySnapshot();
    return { docs: [smokeDoc], size: 1, empty: false, forEach(callback) { callback(smokeDoc); } };
}\n`;
        source = source.replace('export const getDocs = async () => emptySnapshot();', 'export const getDocs = async target => smokeSnapshot(target);');
        source = source.replace('const deliver = () => { if (active) next(emptySnapshot()); };', 'const deliver = () => { if (active) next(smokeSnapshot(target)); };');
        source = source.replace('export const deleteDoc = setDoc, updateDoc = setDoc, runTransaction = setDoc;', `export const deleteDoc = setDoc, updateDoc = setDoc;
export const runTransaction = async (_db, work) => work({
    get: async () => smokeDoc,
    update: (ref, data) => window.chatSmoke.writes.push({ kind: 'update', id: ref.id, data }),
    delete: ref => window.chatSmoke.writes.push({ kind: 'delete', id: ref.id }),
    set: (ref, data) => window.chatSmoke.writes.push({ kind: 'set', id: ref.id, data })
});`);
        source = source.replace("export const httpsCallable = () => async () => { throw new Error('Offline preview does not call AI'); };", `export const httpsCallable = () => async request => new Promise((resolve, reject) => {
    window.chatSmoke.calls.push(structuredClone(request));
    window.chatSmoke.pending.push({ resolve, reject });
});`);
        await route.fulfill({ response, body: source });
    });
    await page.goto(`${base}/?session=ready&boss=dashboard&language=en`);
    await page.locator('#chatBubble').waitFor({ state: 'visible' });
    await page.locator('#chatBubble').focus();
    await page.keyboard.press('Enter');
    await page.locator('#chatPanel.open').waitFor();
}

async function assertBounds(page, label) {
    // Reflow is event-driven; wait for settled dimensions rather than a fixed delay.
    await page.waitForFunction(() => {
        const panel = document.getElementById('chatPanel').getBoundingClientRect();
        const viewport = window.visualViewport;
        const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
        const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
        return panel.left >= x - 1 && panel.top >= y - 1 && panel.right <= x + width + 1 && panel.bottom <= y + height + 1;
    }, null, { timeout: 3000 });
    const panel = await page.locator('#chatPanel').boundingBox();
    const header = await page.locator('#chatDragHandle').boundingBox();
    assert.ok(header.height > 25 && header.y >= panel.y - 1, `${label}: header is reachable`);
    assert.equal(await page.locator('#chatInput').isVisible(), true, `${label}: composer visible`);
    const input = await page.locator('#chatInput').boundingBox();
    assert.ok(input.y >= header.y + header.height - 1 && input.y + input.height <= panel.y + panel.height + 1,
        `${label}: composer remains inside the panel`);
    for (const selector of ['#chatResetBtn', '#chatCloseBtn']) {
        const button = await page.locator(selector).boundingBox();
        assert.ok(button.x >= panel.x && button.x + button.width <= panel.x + panel.width + 1,
            `${label}: ${selector} remains inside the header`);
    }
    return panel;
}

async function answer(page, parts) {
    await page.waitForFunction(() => window.chatSmoke.pending.length > 0);
    await page.evaluate(value => {
        window.chatSmoke.pending.shift().resolve({ data: { response: { candidates: [{ content: { parts: value } }] } } });
    }, typeof parts === 'string' ? [{ text: parts }] : parts);
}

async function send(page, text) {
    // Existing anti-double-send guard is two seconds. Drive the UI normally.
    await page.locator('#chatInput').fill(text);
    await page.waitForFunction(() => !document.getElementById('chatSendBtn').disabled);
    await page.locator('#chatSendBtn').click();
    await page.waitForFunction(() => window.chatSmoke.pending.length > 0);
}

try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await setup(page);
    await assertBounds(page, 'Open desktop');
    await page.screenshot({ path: resolve(output, 'chat-desktop.png') });

    const handle = await page.locator('#chatDragHandle').boundingBox();
    await page.mouse.move(handle.x + 90, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(1400, 970, { steps: 10 });
    await page.mouse.up();
    await assertBounds(page, 'Edge drag');
    await page.setViewportSize({ width: 900, height: 500 });
    await assertBounds(page, 'Smaller monitor');
    await page.screenshot({ path: resolve(output, 'chat-small-monitor.png') });
    await page.locator('#chatDragHandle').focus();
    const beforeMove = await page.locator('#chatPanel').boundingBox();
    await page.keyboard.press('ArrowLeft');
    const afterMove = await page.locator('#chatPanel').boundingBox();
    assert.ok(afterMove.x < beforeMove.x, 'Keyboard moves focused handle');
    await page.keyboard.press('Home');
    await assertBounds(page, 'Keyboard reset');
    await page.locator('#chatResetBtn').click();
    await assertBounds(page, 'Reset control');
    results.push('Pointer drag clamps every edge; 1440×1000 → 900×500 keeps header/composer visible; keyboard move/Home and reset control');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#chatResetBtn').click();
    await send(page, 'Who is working today?');
    assert.equal(await page.locator('#chatActivity').getAttribute('data-state'), 'working');
    assert.equal(await page.locator('#chatStopBtn').isVisible(), true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('#chatCloseBtn').click();
    for (const selector of ['.chat-activity-indicator', '#chatPanel .chat-avatar']) {
        assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).animationPlayState), 'paused',
            `${selector}: pending work must not animate in a closed panel`);
    }
    await page.locator('#chatBubble').focus();
    await page.keyboard.press('Enter');
    await page.locator('#chatPanel.open').waitFor();
    assert.equal(await page.locator('.chat-activity-indicator').evaluate(el => getComputedStyle(el).animationPlayState), 'running');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const selector of ['.chat-activity-indicator', '#chatPanel .chat-avatar']) {
        assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).animationName), 'none',
            `${selector}: reduced motion disables animation`);
    }
    results.push('Closed pending chat pauses CSS animations; reopening resumes status; reduced motion disables indicator and avatar animation');
    await answer(page, [{ functionCall: { name: 'get_agent_list', args: {} } }, { functionCall: { name: 'get_today_status', args: {} } }]);
    await page.waitForFunction(() => window.chatSmoke.calls.length === 2);
    await page.locator('#chatActivity summary').click();
    assert.match(await page.locator('#chatActivity').innerText(), /Checking team members/);
    assert.match(await page.locator('#chatActivity').innerText(), /Checking today’s schedule/);
    const toolResponses = await page.evaluate(() => window.chatSmoke.calls[1].contents.at(-1).parts);
    assert.equal(toolResponses[0].functionResponse.name, 'get_agent_list');
    assert.match(toolResponses[0].functionResponse.response.result, /Alex Preview/);
    await page.screenshot({ path: resolve(output, 'chat-live-activity.png') });
    await answer(page, '**Alex Preview** is in the RO team.\n- The current planner has no shifts entered today.');
    await page.waitForFunction(() => document.getElementById('chatActivity').dataset.state === 'done');
    assert.equal(await page.locator('#chatStopBtn').isVisible(), false);
    assert.equal(await page.locator('#chatActivity details').getAttribute('open'), '');
    await page.screenshot({ path: resolve(output, 'chat-response.png') });
    results.push('Real callable/tool rounds drive visible activity trace; disclosure stays open; response ends busy state');

    await page.locator('#chatClearBtn').click();
    await send(page, 'Wait for a response');
    await page.locator('#chatStopBtn').click();
    await page.waitForFunction(() => document.getElementById('chatActivity').dataset.state === 'stopped');
    await answer(page, 'STALE_RESPONSE_MUST_NOT_APPEAR');
    assert.equal(await page.locator('#chatInput').isDisabled(), false);
    assert.ok(!(await page.locator('#chatMessages').innerText()).includes('STALE_RESPONSE_MUST_NOT_APPEAR'));
    results.push('Stop releases composer and suppresses an already-running response');

    await page.locator('#chatClearBtn').click();
    await send(page, 'Delete Alex Preview');
    await answer(page, 'Review this deletion. [[ACTION:DELETE_AGENT|preview-agent]]');
    await page.locator('.chat-action-confirmation').waitFor();
    assert.equal((await page.evaluate(() => window.chatSmoke.writes)).length, 0);
    await page.locator('.chat-confirmation-controls .btn-secondary').click();
    assert.equal((await page.evaluate(() => window.chatSmoke.writes)).length, 0);
    await page.locator('#chatClearBtn').click();
    await send(page, 'Delete Alex Preview');
    await answer(page, 'Review this deletion. [[ACTION:DELETE_AGENT|preview-agent]]');
    await page.locator('.chat-confirmation-controls .btn-primary').click();
    await page.waitForFunction(() => window.chatSmoke.writes.length === 1);
    assert.deepEqual(await page.evaluate(() => window.chatSmoke.writes), [{ kind: 'delete', id: 'preview-agent' }]);
    results.push('Proposed change writes nothing; cancel writes nothing; explicit Apply commits fake transaction once');

    await page.locator('#chatClearBtn').click();
    await send(page, 'Return a long answer');
    await answer(page, Array.from({ length: 55 }, (_, index) => `Line ${index + 1}: A readable planner explanation.`).join('\n'));
    await page.waitForFunction(() => document.getElementById('chatActivity').dataset.state === 'done');
    await page.waitForTimeout(2100);
    await send(page, 'Keep my reading position');
    await page.locator('#chatMessages').evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
    await answer(page, 'This response should wait below your reading position.');
    await page.locator('#chatJumpBtn').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#chatMessages').evaluate(el => el.scrollTop < el.scrollHeight - el.clientHeight - 100));
    await page.locator('#chatJumpBtn').click();
    await page.waitForFunction(() => { const el = document.getElementById('chatMessages'); return el.scrollHeight - el.scrollTop - el.clientHeight < 5; });
    results.push('Reading older messages survives reply; jump-to-latest restores bottom');

    await page.locator('#chatClearBtn').click();
    await send(page, 'Wait while clearing');
    await page.locator('#chatClearBtn').click();
    await answer(page, 'CLEARED_RESPONSE_MUST_NOT_APPEAR');
    assert.ok(!(await page.locator('#chatMessages').innerText()).includes('CLEARED_RESPONSE_MUST_NOT_APPEAR'));
    assert.equal(await page.locator('#chatActivity').isVisible(), false);
    results.push('Clear hides activity and invalidates a pending request');

    await page.locator('#logoutBtn').click();
    await page.locator('html[data-auth-state="signed-out"]').waitFor();
    assert.equal(await page.locator('#chatPanel').isVisible(), false);
    await page.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await setup(mobile);
    await assertBounds(mobile, 'Touch viewport');
    const touchHandle = await mobile.locator('#chatDragHandle').boundingBox();
    const touchStart = { x: touchHandle.x + 90, y: touchHandle.y + touchHandle.height / 2 };
    const cdp = await mobile.context().newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchStart] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchStart.x, y: touchStart.y - 100 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await assertBounds(mobile, 'Touch drag');
    assert.ok((await mobile.locator('#chatDragHandle').boundingBox()).y < touchHandle.y, 'Touch moves the header');
    await mobile.screenshot({ path: resolve(output, 'chat-mobile.png') });
    await mobile.setViewportSize({ width: 390, height: 360 });
    await assertBounds(mobile, 'Keyboard-sized viewport');
    await mobile.screenshot({ path: resolve(output, 'chat-keyboard-height.png') });
    await mobile.setViewportSize({ width: 320, height: 480 });
    await assertBounds(mobile, 'Narrow viewport');
    await mobile.screenshot({ path: resolve(output, 'chat-320px.png') });
    assert.ok(await mobile.locator('#chatPanel').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    results.push('Touch drag; 390px mobile, 360px keyboard-height and 320px narrow viewport; no horizontal overflow');

    await mobile.setViewportSize({ width: 390, height: 360 });
    await send(mobile, 'Check team members');
    await answer(mobile, [{ functionCall: { name: 'get_agent_list', args: {} } }]);
    await mobile.waitForFunction(() => window.chatSmoke.calls.length === 2);
    await mobile.locator('#chatActivity summary').click();
    await assertBounds(mobile, 'Expanded activity with short viewport');
    await mobile.screenshot({ path: resolve(output, 'chat-short-active.png') });
    await answer(mobile, 'Team checked.');
    await mobile.waitForFunction(() => document.getElementById('chatActivity').dataset.state === 'done');
    await mobile.locator('#chatInput').fill('First line\nSecond line\nThird line\nFourth line');
    await assertBounds(mobile, 'Expanded activity and multiline composer');
    await mobile.screenshot({ path: resolve(output, 'chat-short-multiline.png') });
    await mobile.setViewportSize({ width: 390, height: 844 });
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.4 });
    await assertBounds(mobile, 'Zoomed visual viewport');
    await mobile.screenshot({ path: resolve(output, 'chat-visual-viewport-zoom.png') });
    results.push('Expanded activity and multiline composer fit short screen; visualViewport zoom repairs window bounds');
    await mobile.close();
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    await writeFile(resolve(output, 'browser-results.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
    await browser.close();
}
