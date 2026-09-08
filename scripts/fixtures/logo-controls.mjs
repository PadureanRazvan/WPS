import assert from 'node:assert/strict';

export async function verifyControls(page) {
  const read = () => page.evaluate(() => window.logoStudio.controllers[0].getDiagnostics());
  const step = ms => page.evaluate(ms => window.stepLogo(ms), ms);
  const shape = () => page.locator('#sherpaLogo').getAttribute('data-logo-shape');
  const checks = [];
  await page.evaluate(() => {
    const controller = window.logoStudio.controllers[0];
    controller.pause();
    for (let i = 0; i < 6 && (controller.getDiagnostics().shape !== 'fsp' || controller.getDiagnostics().transitioning); i++) controller.next();
    window.stepLogo(1);
  });
  await page.evaluate(() => document.getElementById('sherpaLogo').focus());
  let before = await read();
  await step(3000);
  assert.equal((await read()).frame, before.frame, 'paused logo must not keep drawing');
  await page.keyboard.press('p');
  await step(250);
  assert.ok((await read()).frame > before.frame);
  await page.keyboard.press('p');
  await step(1);
  before = await read();
  await step(2000);
  assert.equal((await read()).frame, before.frame);
  checks.push('P pauses/resumes; paused frames stop drawing');

  await page.keyboard.press('Enter');
  await step(1);
  assert.equal(await shape(), 'globe', 'native Enter must advance exactly once');
  await page.keyboard.press('Space');
  await step(1);
  assert.equal(await shape(), 'heart', 'native Space must advance exactly once');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sherpa:navigation')));
  await step(1);
  assert.equal(await shape(), 'heart', 'navigation must not override pause');
  checks.push('native Enter/Space advance once; navigation respects pause');

  await page.keyboard.press('p');
  await page.evaluate(() => window.logoStudio.controllers[0].next());
  await step(1000);
  assert.equal((await read()).transitioning, true);
  await step(1500);
  assert.equal((await read()).transitioning, false);
  assert.equal(await shape(), 'summit');
  checks.push('animated morph reaches its target');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.logoStudio.controllers[0].getDiagnostics().reducedMotion, null, {polling:50});
  await step(1);
  assert.equal(await shape(), 'fsp');
  const frozen = await page.locator('#sherpaLogo canvas').evaluate(canvas => canvas.toDataURL());
  before = await read();
  await step(8000);
  assert.equal((await read()).frame, before.frame);
  assert.equal(await page.locator('#sherpaLogo canvas').evaluate(canvas => canvas.toDataURL()), frozen);
  await page.keyboard.press('Enter');
  await step(1);
  assert.equal(await shape(), 'globe');
  assert.equal((await read()).transitioning, false);
  checks.push('reduced motion is static; keyboard shape selection still works');

  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(() => document.getElementById('sherpaLogo').dataset.logoVariant === 'compact', null, {polling:50});
  await step(1);
  assert.equal(await page.locator('#sherpaLogo').evaluate(el => el.getBoundingClientRect().width), 44);
  await page.evaluate(() => { for(let i=0;i<4;i++) window.logoStudio.controllers[0].next(); });
  await step(1);
  assert.equal(await shape(), 'fsp');
  await page.setViewportSize({width:1280,height:900});
  await page.waitForFunction(() => document.getElementById('sherpaLogo').dataset.logoVariant === 'full', null, {polling:50});
  await step(1);
  checks.push('compact/full FSP swap survives viewport changes');

  await page.evaluate(() => { document.documentElement.lang = 'en'; });
  await page.waitForFunction(() => document.getElementById('sherpaLogo').getAttribute('aria-label').includes('Activate for the next shape'), null, {polling:50});
  await page.evaluate(() => { document.getElementById('appContainer').style.display = 'none'; });
  await page.waitForFunction(() => !window.logoStudio.controllers[0].getDiagnostics().visible, null, {polling:50});
  before = await read();
  await step(3000);
  assert.equal((await read()).frame, before.frame);
  await page.evaluate(() => { document.getElementById('appContainer').style.display = ''; });
  await page.waitForFunction(() => window.logoStudio.controllers[0].getDiagnostics().visible, null, {polling:50});
  await step(1);
  checks.push('language labels update; hidden logo stops drawing');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => !window.logoStudio.controllers[0].getDiagnostics().reducedMotion, null, {polling:50});
  await page.evaluate(() => {
    const controller = window.logoStudio.controllers[0];
    controller.pause(); controller.next(); controller.next(); window.stepLogo(1);
  });
  assert.equal(await shape(), 'heart');
  const beforeRestore = await page.locator('#sherpaLogo canvas').evaluate(canvas => canvas.toDataURL());
  await page.evaluate(() => {
    const canvas = document.querySelector('#sherpaLogo canvas');
    window.logoContextExtension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!window.logoContextExtension) throw Error('Context-loss test requires WEBGL_lose_context');
    window.logoContextExtension.loseContext();
  });
  await page.waitForFunction(() => window.logoStudio.controllers[0].getDiagnostics().contextLost, null, {polling:50});
  assert.equal(await page.locator('#sherpaLogo').getAttribute('data-logo-renderer'), 'context-lost');
  assert.equal((await read()).running, false);
  assert.equal(await page.locator('#sherpaLogo img').first().evaluate(img => getComputedStyle(img).visibility), 'visible');
  await page.evaluate(() => window.logoContextExtension.restoreContext());
  await page.waitForFunction(() => !window.logoStudio.controllers[0].getDiagnostics().contextLost, null, {polling:50});
  await step(1);
  assert.equal(await shape(), 'heart');
  assert.equal((await read()).running, true);
  assert.equal((await read()).paused, true);
  assert.equal(await page.locator('#sherpaLogo canvas').evaluate(canvas => canvas.toDataURL()), beforeRestore, 'restored sculpture and lighting must match the paused image');
  checks.push('graphics-context recovery restores the selected sculpture, studio lighting and pause state');

  await page.evaluate(() => { const controller = window.logoStudio.controllers[0]; controller.resume(); controller.next(); });
  await step(1500);
  await page.evaluate(() => window.logoStudio.controllers[0].pause());
  await step(1);
  assert.equal(await shape(), 'heart-to-summit');
  const morphImage = await page.locator('#sherpaLogo canvas').evaluate(canvas => canvas.toDataURL());
  await page.evaluate(() => window.logoContextExtension.loseContext());
  await page.waitForFunction(() => window.logoStudio.controllers[0].getDiagnostics().contextLost, null, {polling:50});
  await page.evaluate(() => window.logoContextExtension.restoreContext());
  await page.waitForFunction(() => !window.logoStudio.controllers[0].getDiagnostics().contextLost, null, {polling:50});
  await step(1);
  assert.equal(await shape(), 'heart-to-summit');
  assert.equal(await page.locator('#sherpaLogo canvas').evaluate(canvas => canvas.toDataURL()), morphImage);
  await page.evaluate(() => window.logoStudio.controllers[0].resume());
  await step(450);
  assert.equal(await shape(), 'summit');
  checks.push('graphics recovery preserves a paused morph, then completes the ascent reveal');

  const cycles = await page.evaluate(() => {
    const controller = window.logoStudio.controllers[0], resources = [];
    controller.pause();
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let shape = 0; shape < 5; shape++) { controller.next(); window.stepLogo(1); }
      const { geometries, textures } = controller.getDiagnostics();
      resources.push({ geometries, textures });
    }
    return resources;
  });
  assert.deepEqual(cycles[1], cycles[0]);
  assert.deepEqual(cycles[2], cycles[0]);
  checks.push('repeated full figure cycles keep geometry and texture counts stable');

  const disposal = await page.evaluate(async () => {
    const old = window.logoStudio.controllers[0];
    old.dispose();
    const removed = !document.querySelector('#sherpaLogo canvas');
    const stopped = !old.getDiagnostics().running;
    const { initLogoAnimation } = await import('/js/logo-animation.js');
    const next = await initLogoAnimation('sherpaLogo');
    window.logoStudio.controllers[0] = next;
    window.stepLogo(1);
    return {removed,stopped,fresh:next !== old, canvases:document.querySelectorAll('#sherpaLogo canvas').length,renderer:document.getElementById('sherpaLogo').dataset.logoRenderer};
  });
  assert.deepEqual(disposal,{removed:true,stopped:true,fresh:true,canvases:1,renderer:'three'});
  checks.push('dispose/reinitialize leaves exactly one working canvas');

  const interrupted = await page.evaluate(async () => {
    const { initLogoAnimation } = await import('/js/logo-animation.js');
    const control = document.createElement('button');
    control.id = 'temporary-sculpture'; control.dataset.fspLogo = '';
    control.style.cssText = 'position:fixed;width:44px;height:44px;left:0;bottom:0';
    document.body.append(control);
    const pending = initLogoAnimation(control.id);
    control.remove();
    const abandoned = await pending;
    const clean = control.querySelectorAll('canvas').length === 0;
    document.body.append(control);
    const fresh = await initLogoAnimation(control.id);
    const recovered = Boolean(fresh?.getDiagnostics?.().running) && control.querySelectorAll('canvas').length === 1;
    fresh.dispose(); control.remove();
    return { abandoned: abandoned === null, clean, recovered };
  });
  assert.deepEqual(interrupted, { abandoned: true, clean: true, recovered: true });
  checks.push('removing a logo during startup clears its pending instance and permits reinitialization');
  return checks;
}
