import { installPreparedLogoGeometries } from './logo-geometry-cache.js?v=2026.10.23';

let preparation = null;

// The studio is fixed artwork. Reuse its original half-float pixels instead of
// compiling a second WebGL renderer/PMREM pipeline on every page entry.
export function decodeLogoStudioEnvironment(buffer) {
    if (buffer.byteLength < 8) throw new Error('Incomplete sculpture lighting asset');
    const metadataLength = new DataView(buffer).getUint32(0, true);
    if (metadataLength > 4096 || 4 + metadataLength >= buffer.byteLength) throw new Error('Invalid sculpture lighting header');
    const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, metadataLength)));
    const { width, height, texture } = metadata;
    if (metadata.version !== 1 || width !== 384 || height !== 512 || buffer.byteLength - 4 - metadataLength !== width * height * 8
        || texture?.mapping !== 306 || texture?.colorSpace !== 'srgb-linear') throw new Error('Invalid sculpture lighting layout');
    const pixels = new Uint16Array(buffer.slice(4 + metadataLength));
    if (!pixels.some(value => value !== 0) || pixels.some(value => (value & 0x7c00) === 0x7c00)) throw new Error('Invalid sculpture lighting pixels');
    const settings = Object.fromEntries(['mapping', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'colorSpace', 'flipY', 'generateMipmaps'].map(key => [key, texture[key]]));
    return { pixels, width, height, texture: settings, source: 'asset' };
}

export async function loadLogoStudioEnvironment({ fetchAsset = globalThis.fetch, Decompress = globalThis.DecompressionStream } = {}) {
    if (!fetchAsset || !Decompress) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
        const url = new URL('../assets/branding/sherpa-studio-lighting-v1.bin.gz', import.meta.url);
        const response = await fetchAsset(url, { signal: controller.signal, cache: 'force-cache' });
        if (!response.ok || !response.body) return null;
        const unpacked = new Response(response.body.pipeThrough(new Decompress('gzip')));
        return decodeLogoStudioEnvironment(await unpacked.arrayBuffer());
    } catch (_) { return null; }
    finally { clearTimeout(timer); }
}

export function getLogoPreparationWorkerUrl(moduleUrl = import.meta.url) {
    const url = new URL('./logo-prepare.worker.js', moduleUrl);
    // Import maps do not apply inside workers. Carry the release cache key.
    url.search = new URL(moduleUrl).search;
    return url;
}

export function prepareLogoGeometries(THREE, { WorkerClass = globalThis.Worker, timeout = 15000, loadEnvironment = loadLogoStudioEnvironment } = {}) {
    if (preparation) return preparation;
    preparation = Promise.resolve().then(loadEnvironment).catch(() => null).then(environment => new Promise(resolve => {
        // Keep the reusable lighting even if worker creation or geometry fails.
        if (environment) installPreparedLogoGeometries(THREE, {}, environment);
        if (typeof WorkerClass !== 'function') {
            resolve({ mode: 'main-thread', lighting: environment ? 'asset' : 'main-thread', duration: 0 });
            return;
        }
        let worker, timer, finished = false;
        const finish = result => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            worker?.terminate();
            resolve({ lighting: environment ? 'asset' : 'main-thread', ...result });
        };
        try {
            worker = new WorkerClass(getLogoPreparationWorkerUrl(), { type: 'module', name: 'Sherpa sculptures' });
            timer = setTimeout(() => finish({ mode: 'main-thread', duration: 0 }), timeout);
            worker.onmessage = ({ data }) => {
                if (finished) return;
                try {
                    if (data.error || !data.data) throw new Error(data.error || 'Missing sculpture geometry');
                    const lighting = environment || data.environment;
                    installPreparedLogoGeometries(THREE, data.data, lighting);
                    finish({ mode: 'worker', lighting: environment ? 'asset' : data.environment ? 'worker' : 'main-thread', duration: data.duration });
                } catch (_) { finish({ mode: 'main-thread', duration: 0 }); }
            };
            worker.onerror = event => {
                event.preventDefault?.();
                finish({ mode: 'main-thread', duration: 0 });
            };
            worker.postMessage({ prepare: true, lighting: !environment });
        } catch (_) { finish({ mode: 'main-thread', duration: 0 }); }
    }));
    return preparation;
}
