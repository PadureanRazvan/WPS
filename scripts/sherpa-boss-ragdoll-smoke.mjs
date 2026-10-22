import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SHERPA_PLAYWRIGHT_PATH || 'playwright');
const base = 'http://127.0.0.1:4173', output = resolve('output/sherpa-boss-interactions');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
const snapshot = name => page.screenshot({ path: resolve(output, `${name}.png`) });
try {
    await page.goto(`${base}/?session=ready&boss=dashboard`);
    const boss = page.locator('#chatBubble');
    await page.waitForSelector('#chatBubble[data-boss-renderer="three"]');
    const reset = async () => {
        await page.mouse.move(40, 100); await boss.focus(); await page.keyboard.press('Home');
        await page.waitForTimeout(80);
        const r = await boss.boundingBox(), s = r.height / 4.1;
        return { r, s, x: r.x + r.width / 2, y: r.y + r.height / 2 + .31 * s };
    };
    const grip = async (part, x, y) => {
        const p = await reset();
        const offsets = { head: [0, -1.625], leftForearm: [-.55, .03], rightFoot: [.19, 1.41] };
        const [dx, dy] = offsets[part];
        await page.mouse.move(p.x + dx * p.s, p.y + dy * p.s);
        await page.mouse.down();
        await page.mouse.move(x, y, { steps: 12 });
        await page.waitForTimeout(220);
        return boss.getAttribute('data-boss-grab-part');
    };
    await reset(); await boss.hover();
    assert.equal(await boss.getAttribute('data-boss-action'), 'wave');
    results.push('Hover starts a greeting');
    for (const part of ['head', 'leftForearm', 'rightFoot']) {
        const grabbed = await grip(part, 700, 260);
        assert.ok(grabbed === part || part === 'leftForearm' && grabbed === 'leftHand' || part === 'rightFoot' && grabbed === 'rightShin', `${part}: picked ${grabbed}`);
        await page.waitForTimeout(800); await snapshot(`held-${part}`); await page.mouse.up();
        assert.equal(await page.locator('#chatPanel').evaluate(el => el.classList.contains('open')), false);
    }
    results.push('Mesh hits identify head, arm and foot; each body part carries the body');
    await grip('head', 650, 270);
    for (let n = 0; n < 10; n++) {
        await page.mouse.move(n % 2 ? 740 : 580, 270 + (n % 2 ? 12 : -12), { steps: 2 });
        await page.waitForTimeout(45);
    }
    assert.equal(await boss.getAttribute('data-boss-reaction'), 'shaken');
    await snapshot('shaking'); await page.mouse.up();
    results.push('Quick reversals trigger the uncomfortable face');
    for (const [side, x, y] of [['left', 1, 320], ['right', 1279, 320], ['top', 640, 1], ['bottom', 640, 899]]) {
        await grip('head', x, y);
        assert.equal(await boss.getAttribute('data-boss-impact'), side);
        assert.ok(Number(await boss.getAttribute('data-boss-impact-count')) > 0);
        await snapshot(`impact-${side}`); await page.mouse.up();
    }
    results.push('All four edges produce collision reactions during a drag');
    await grip('leftForearm', 700, 220);
    await page.mouse.move(560, 240, { steps: 3 }); await page.mouse.up();
    await page.waitForTimeout(260); await snapshot('thrown');
    await page.waitForTimeout(1400); await snapshot('landed');
    await page.waitForTimeout(4600);
    assert.equal(await boss.getAttribute('data-boss-reaction'), null, 'fallen body must recover');
    await snapshot('recovered');
    results.push('Throw, floor contact and bounded recovery');
    await page.locator('#bossMinimize').click();
    assert.equal(await boss.isVisible(), false); assert.equal(await page.locator('#bossDock').isVisible(), true);
    await snapshot('minimized'); await page.locator('#bossDock').click();
    assert.equal(await boss.isVisible(), true); assert.equal(await page.locator('#bossDock').isVisible(), false);
    await boss.focus(); await page.keyboard.press('h');
    assert.equal(await page.locator('#bossDock').isVisible(), true);
    await page.keyboard.press('Enter');
    assert.equal(await boss.isVisible(), true);
    results.push('Minimize leaves a small feet dock; pointer and keyboard restore');
    await boss.click(); await page.waitForSelector('#chatPanel.open');
    results.push('Ordinary click still opens chat');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ results, errors }, null, 2));
    await writeFile(resolve(output, 'results.json'), JSON.stringify({ results, errors }, null, 2));
} finally { await browser.close(); }
