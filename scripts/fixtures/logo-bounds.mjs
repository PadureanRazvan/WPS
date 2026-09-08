import assert from 'node:assert/strict';

/** Inspect opaque border pixels through a complete cycle at real shell sizes. */
export async function verifySilhouettes(page) {
    const initialViewport = page.viewportSize(), checks = [];
    try {
        for (const {compact, hovered} of [
            {compact:false,hovered:false}, {compact:false,hovered:true},
            {compact:true,hovered:false}, {compact:true,hovered:true}
        ]) {
            await page.setViewportSize(compact ? {width:390,height:844} : {width:1280,height:900});
            await page.waitForFunction(compact => {
                const control = document.getElementById('sherpaLogo'), canvas = control.querySelector('canvas');
                const width = compact ? 44 : 150;
                return control.dataset.logoVariant === (compact ? 'compact' : 'full')
                    && control.getBoundingClientRect().width === width
                    && canvas.width === width * Math.min(devicePixelRatio, 2);
            }, compact, {polling:50});
            const result = await page.evaluate(hovered => {
                const controller = window.logoStudio.controllers[0];
                controller.pause(); controller.next();
                for (let i = 0; i < 6 && (controller.getDiagnostics().shape !== 'fsp' || controller.getDiagnostics().transitioning); i++) controller.next();
                controller.setAutoCycle(true); controller.resume();
                const source = document.querySelector('#sherpaLogo canvas');
                const control = source.parentElement, bounds = control.getBoundingClientRect();
                control.dispatchEvent(hovered
                    ? new PointerEvent('pointermove', {clientX:bounds.right-1,clientY:bounds.bottom-1,pointerType:'mouse'})
                    : new PointerEvent('pointerleave'));
                const sample = document.createElement('canvas');
                sample.width = source.width; sample.height = source.height;
                const context = sample.getContext('2d', {willReadFrequently:true});
                const states = new Set();
                let clipped = null, maximumBorderAlpha = 0;
                for (let time = 0; time <= 52000; time += 160) {
                    window.stepLogo(160);
                    states.add(source.parentElement.dataset.logoShape);
                    context.clearRect(0, 0, sample.width, sample.height);
                    context.drawImage(source, 0, 0);
                    const {data} = context.getImageData(0, 0, sample.width, sample.height);
                    for (let y = 0; y < sample.height; y++) for (let x = 0; x < sample.width; x++) {
                        if (x > 0 && x < sample.width - 1 && y > 0 && y < sample.height - 1) continue;
                        const alpha = data[(y * sample.width + x) * 4 + 3];
                        maximumBorderAlpha = Math.max(maximumBorderAlpha, alpha);
                        if (alpha > 240) clipped = {time,shape:source.parentElement.dataset.logoShape,x,y,alpha};
                    }
                    if (clipped) break;
                }
                controller.pause();
                return {states:[...states],clipped,maximumBorderAlpha,width:sample.width,height:sample.height};
            }, hovered);
            assert.equal(result.clipped, null, `opaque silhouette reached the ${compact ? 'compact' : 'full'} canvas edge: ${JSON.stringify(result.clipped)}`);
            for (const shape of ['fsp','globe','heart','summit','infinity','infinity-to-fsp']) assert.ok(result.states.includes(shape), `bounds review missed ${shape}`);
            checks.push(`${compact ? '44 px compact' : '150 px sidebar'} silhouettes stay inside the canvas throughout a full cycle${hovered ? ' with pointer tilt' : ''}`);
        }
    } finally {
        await page.setViewportSize(initialViewport);
    }
    return checks;
}
