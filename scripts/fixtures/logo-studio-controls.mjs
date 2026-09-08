import assert from 'node:assert/strict';

export async function verifyControls(page) {
    const read = () => page.evaluate(() => window.logoStudio.controllers.map(controller => controller.getDiagnostics()));
    const step = (ms, frameMs = 1000 / 60) => page.evaluate(([ms, frameMs]) => window.stepLogo(ms, frameMs), [ms, frameMs]);
    const checks = [];
    const names = ['fsp', 'globe', 'heart', 'summit', 'infinity'];
    await page.evaluate(() => window.logoStudio.controllers.forEach(controller => controller.resume()));
    const initial = await read();
    await step(15000, 80);
    assert.deepEqual((await read()).map(state => state.shape), names);
    assert.ok((await read()).every((state, i) => !state.autoCycle && state.frame > initial[i].frame));
    checks.push('hold mode keeps each figure while its rotation continues');

    await page.evaluate(() => document.getElementById('cycle').click());
    await step(6500, 80);
    assert.ok((await read()).every(state => state.autoCycle));
    assert.ok((await read()).some((state, i) => state.transitioning || state.shape !== names[i]));
    await page.evaluate(() => { document.getElementById('cycle').click(); document.getElementById('reset').click(); });
    await step(1);
    assert.deepEqual((await read()).map(state => state.shape), names);
    assert.ok((await read()).every(state => !state.transitioning));
    checks.push('automatic cycling resumes on demand; reset restores all five figures');

    await page.evaluate(() => document.getElementById('pause').click());
    await step(1);
    const paused = await read();
    await step(1500);
    assert.ok((await read()).every((state, i) => state.paused && state.frame === paused[i].frame));
    await page.evaluate(() => document.getElementById('figure-0').focus());
    await page.keyboard.press('Enter');
    await step(1);
    assert.equal((await read())[0].shape, 'globe');
    await page.evaluate(() => document.getElementById('pause').click());
    await step(1);
    checks.push('global pause stops drawing; native keyboard selection advances once');

    const beforeTheme = (await read()).map(state => state.shape);
    await page.evaluate(() => { const theme = document.getElementById('theme'); theme.value = 'light'; theme.dispatchEvent(new Event('change')); });
    await step(250);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.deepEqual((await read()).map(state => state.shape), beforeTheme);
    assert.ok((await read()).every(state => !state.transitioning && !state.paused));
    checks.push('theme comparison preserves the selected figures and motion state');

    await page.evaluate(() => document.getElementById('pause').click());
    await step(1);
    const natural = await page.locator('#figure-2 canvas').evaluate(canvas => canvas.toDataURL());
    await page.evaluate(() => {
        const yaw = document.getElementById('yaw'), pitch = document.getElementById('pitch');
        yaw.value = '70'; pitch.value = '18'; yaw.dispatchEvent(new Event('input'));
    });
    await step(1);
    assert.ok((await read()).every(state => Math.abs(state.inspectionRotation[1] - 70 * Math.PI / 180) < 1e-9));
    assert.notEqual(await page.locator('#figure-2 canvas').evaluate(canvas => canvas.toDataURL()), natural);
    await page.evaluate(() => document.getElementById('natural').click());
    await step(1);
    assert.ok((await read()).every(state => state.inspectionRotation === null));
    assert.equal(await page.locator('#figure-2 canvas').evaluate(canvas => canvas.toDataURL()), natural);
    await page.evaluate(() => document.getElementById('pause').click());
    checks.push('turn/tilt inspection works while paused and restores the exact natural pose');

    await page.evaluate(() => {
        window.studioCanvases = [...document.querySelectorAll('[data-fsp-logo] canvas')];
        const view = document.getElementById('view'); view.value = 'compact'; view.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-fsp-logo]')].every(control => control.dataset.logoVariant === 'compact'), null, {polling:50});
    await step(1);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-fsp-logo]')].every(control => control.getBoundingClientRect().width === 44)), true);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-fsp-logo] canvas')].every((canvas, i) => canvas === window.studioCanvases[i])), true);
    checks.push('compact preview uses 44 px controls and retains the existing canvases');

    await page.evaluate(() => document.querySelector('[data-inspect="heart"]').click());
    await page.waitForFunction(() => window.logoStudio.controllers.every((controller, i) => controller.getDiagnostics().visible === (i === 2)), null, {polling:50});
    await step(1);
    const beforeInspect = await read();
    await step(500);
    assert.ok((await read()).every((state, i) => i === 2 ? state.frame > beforeInspect[i].frame : state.frame === beforeInspect[i].frame));
    checks.push('close inspection renders only the visible figure');
    return checks;
}
