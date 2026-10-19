import { signOut } from './firebase-preview.js';

const panel = document.createElement('aside');
panel.id = 'experience-preview';
panel.setAttribute('aria-label', 'Offline preview controls');
panel.innerHTML = `<style>
    #experience-preview { position: fixed; z-index: 20000; bottom: 10px; right: 10px; max-width: min(520px,calc(100vw - 20px)); max-height: calc(100dvh - 20px); overflow: auto; padding: 8px 12px; background: var(--surface-elevated); color: var(--text-primary); border: 1px solid var(--border); border-radius: 10px; font: 12px/1.5 system-ui,sans-serif; box-shadow: var(--card-shadow); }
    #experience-preview summary { cursor: pointer; color: var(--text-secondary); }
    #experience-preview .preview-controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
    #experience-preview select, #experience-preview button { color: var(--text-primary); background: var(--primary-dark); border: 1px solid var(--border); padding: 7px 9px; border-radius: 6px; font: inherit; }
    #experience-preview pre { white-space: pre-wrap; max-height: 230px; overflow: auto; font-size: 11px; margin-top: 12px; }
</style><details><summary>Offline preview · Original Sherpa</summary><div class="preview-controls"><label>Next sign-in <select id="previewScenario"><option value="cancel">Popup closed</option><option value="network">Network error</option><option value="success">Success</option></select></label><button type="button" id="previewSignOut">Return to sign-in</button><button type="button" id="previewMetrics">Read diagnostics</button><button type="button" id="previewIdle">Check paused logo</button></div><div class="preview-controls"><label>Inspect figure <select id="previewFigure"><option value="">Choose…</option><option value="fsp">FSP Global</option><option value="heart">Heart</option><option value="summit">Summit</option><option value="globe">Globe</option><option value="infinity">Infinity</option></select></label><button type="button" id="previewPlay">Resume motion</button><button type="button" id="previewRecovery">Test graphics recovery</button><button type="button" id="previewRecord">Record one sculpture cycle</button></div><pre id="previewDiagnostics" aria-live="polite"></pre><details><summary>Capture export</summary><label>Screenshot data<textarea id="previewScreenshot" rows="2" style="display:block;width:100%"></textarea></label><button type="button" id="previewSaveScreenshot">Save screenshot</button></details></details>`;
document.body.append(panel);
const lightingExport = document.createElement('button');
lightingExport.type = 'button';
lightingExport.textContent = 'Rebuild studio lighting asset';
panel.querySelector('details details').append(lightingExport);
lightingExport.addEventListener('click', async () => {
    lightingExport.disabled = true;
    let worker, timeout;
    try {
        const environment = await new Promise((resolve, reject) => {
            worker = new Worker('/js/logo-prepare.worker.js', { type: 'module' });
            timeout = setTimeout(() => reject(new Error('Studio lighting export timed out')), 15000);
            worker.onmessage = ({ data }) => data.environment ? resolve(data.environment) : reject(new Error(data.error || 'Studio lighting could not be generated'));
            worker.onerror = event => { event.preventDefault(); reject(new Error(event.message || 'Studio lighting worker failed')); };
            worker.postMessage({ prepare: true, lighting: true });
        });
        const metadata = new TextEncoder().encode(JSON.stringify({ version: 1, width: environment.width, height: environment.height, texture: environment.texture }));
        const header = new Uint8Array(4);
        new DataView(header.buffer).setUint32(0, metadata.length, true);
        const packed = new Blob([header, metadata, environment.pixels]);
        const compressed = await new Response(packed.stream().pipeThrough(new CompressionStream('gzip'))).blob();
        download(compressed, 'sherpa-studio-lighting-v1.bin.gz');
    } catch (error) { await report({ lightingExportError: error.message }); }
    finally { clearTimeout(timeout); worker?.terminate(); lightingExport.disabled = false; }
});
const dashboardReload = document.createElement('button');
dashboardReload.type = 'button';
dashboardReload.textContent = 'Reload signed-in preview';
panel.querySelector('.preview-controls').append(dashboardReload);
dashboardReload.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('session', 'ready');
    location.assign(url);
});
panel.querySelector('#previewScenario').addEventListener('change', event => { window.sherpaPreview.scenario = event.target.value; });
panel.querySelector('#previewSignOut').addEventListener('click', signOut);
function download(blob, name) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
panel.querySelector('#previewSaveScreenshot').addEventListener('click', () => {
    const encoded = panel.querySelector('#previewScreenshot').value;
    if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded)) return;
    download(new Blob([Uint8Array.from(atob(encoded), character => character.charCodeAt(0))], { type: 'image/jpeg' }), 'sherpa-original-polished.jpg');
    panel.querySelector('#previewScreenshot').value = '';
});
const diagnosticsExport = document.createElement('button');
diagnosticsExport.type = 'button';
diagnosticsExport.textContent = 'Save diagnostics';
panel.querySelector('details details').append(diagnosticsExport);
diagnosticsExport.addEventListener('click', async () => {
    await report();
    download(new Blob([panel.querySelector('#previewDiagnostics').textContent], { type: 'application/json' }), 'sherpa-startup-diagnostics.json');
});
async function getControllers() {
    const logos = [...document.querySelectorAll('[data-fsp-logo][data-logo-renderer="three"]')];
    if (!logos.length) return [];
    const { initLogoAnimation } = await import('/js/logo-animation.js');
    return Promise.all(logos.map(logo => initLogoAnimation(logo.id)));
}
async function report(extra = {}) {
    const metrics = window.sherpaPreview;
    const resources = performance.getEntriesByType('resource');
    panel.querySelector('#previewDiagnostics').textContent = JSON.stringify({
        elapsedMs: Math.round(performance.now() - metrics.startedAt),
        signInReadyMs: Math.round(metrics.signInReadyAt - metrics.startedAt),
        logoStartup: metrics.logoStartup,
        initialSignIn: metrics.initialSignIn,
        paint: performance.getEntriesByType('paint').map(entry => ({ name: entry.name, atMs: Math.round(entry.startTime) })),
        localModules: resources.filter(resource => resource.name.includes('/js/')).length,
        longestTaskMs: Math.round(Math.max(0, ...metrics.longTasks.map(task => task.duration))),
        longTasks: metrics.longTasks.map(task => Math.round(task.duration)),
        frameCallbacks: metrics.callbacks,
        unexpectedExternalResources: resources.filter(resource => new URL(resource.name).origin !== location.origin).map(resource => resource.name),
        events: metrics.events, navigationCommits: metrics.navigation, blockedWrites: metrics.writes,
        activeDataSubscriptions: metrics.activeSubscriptions, ...extra,
        controllers: (await getControllers()).map(controller => controller.getDiagnostics()),
        logos: [...document.querySelectorAll('[data-fsp-logo]')].map(logo => ({ id: logo.id, renderer: logo.dataset.logoRenderer, shape: logo.dataset.logoShape, motion: logo.dataset.logoMotion }))
    }, null, 2);
}
panel.querySelector('#previewFigure').addEventListener('change', async event => {
    const target = event.target.value;
    if (!target) return;
    const controllers = await getControllers();
    controllers.forEach(controller => {
        controller.pause();
        for (let step = 0; step < 6 && (controller.getDiagnostics().shape !== target || controller.getDiagnostics().transitioning); step++) controller.next();
    });
    await report();
});
panel.querySelector('#previewPlay').addEventListener('click', async () => {
    (await getControllers()).forEach(controller => controller.resume());
    await report();
});
panel.querySelector('#previewRecovery').addEventListener('click', async event => {
    event.target.disabled = true;
    const canvas = [...document.querySelectorAll('.fsp-logo-scene')].find(element => element.getBoundingClientRect().width > 0);
    const extension = canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) { await report({ graphicsRecovery: 'extension-unavailable' }); event.target.disabled = false; return; }
    extension.loseContext();
    await new Promise(resolve => setTimeout(resolve, 250));
    const lost = canvas.dataset.logoRenderer;
    extension.restoreContext();
    await new Promise(resolve => setTimeout(resolve, 750));
    await report({ graphicsRecovery: { lost, restored: canvas.dataset.logoRenderer } });
    event.target.disabled = false;
});
panel.querySelector('#previewRecord').addEventListener('click', async event => {
    const button = event.target;
    const controllers = await getControllers();
    const controller = controllers.find(value => value.getDiagnostics().visible);
    const canvas = [...document.querySelectorAll('.fsp-logo-scene')].find(element => element.getBoundingClientRect().width > 0);
    if (!controller || !canvas?.captureStream || !globalThis.MediaRecorder) return;
    controller.pause();
    for (let step = 0; step < 6 && (controller.getDiagnostics().shape !== 'fsp' || controller.getDiagnostics().transitioning); step++) controller.next();
    controller.setInspectionTime?.(0);
    controller.setAutoCycle(true); controller.resume();
    const stream = canvas.captureStream(30);
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { stream.getTracks().forEach(track => track.stop()); return; }
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1200000 });
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        download(new Blob(chunks, { type: mimeType }), 'sherpa-sculpture-cycle.webm');
        button.disabled = false; button.textContent = 'Record one sculpture cycle';
    };
    const duration = (controller.getDiagnostics().storyDurationMs || 50000) + 2000;
    button.disabled = true; button.textContent = `Recording ${Math.ceil(duration / 1000)} seconds…`;
    recorder.start(); setTimeout(() => recorder.stop(), duration);
});
panel.querySelector('#previewMetrics').addEventListener('click', () => report());
panel.querySelector('#previewIdle').addEventListener('click', async event => {
    event.target.disabled = true;
    const controllers = await getControllers();
    const saved = controllers.map(controller => controller.getDiagnostics().paused);
    controllers.forEach(controller => controller.pause());
    panel.querySelector('#previewDiagnostics').textContent = 'Checking paused logo…';
    await new Promise(resolve => setTimeout(resolve, 250));
    const callbacks = window.sherpaPreview.callbacks;
    await new Promise(resolve => setTimeout(resolve, 1500));
    await report({ pausedIdleFrameCallbacks: window.sherpaPreview.callbacks - callbacks });
    controllers.forEach((controller, i) => { if (!saved[i]) controller.resume(); });
    event.target.disabled = false;
});
