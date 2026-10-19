import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import * as THREE from '../assets/vendor/three.module.min.js';
import { getLogoPreparationWorkerUrl, decodeLogoStudioEnvironment, loadLogoStudioEnvironment } from '../js/logo-preparation.js';
import { SHERPA_VERSION } from '../js/version.js';
const { getPreparedLogoGeometry, getPreparedLogoEnvironment, installPreparedLogoGeometries, serializeLogoGeometry } = await import(`../js/logo-geometry-cache.js?v=${SHERPA_VERSION.number}`);
import { createLogoStudioLighting } from '../js/logo-materials.js';
import { createFspCore } from '../js/logo-fsp-core.js';
import { createGlobeGeometry } from '../js/logo-globe-geometry.js';
import { createHeartGeometry, createHeartInlayGeometry } from '../js/logo-heart-geometry.js';
import { createSummitGeometry } from '../js/logo-summit-geometry.js';
import { createInfinityGeometry } from '../js/logo-infinity-geometry.js';

test('worker URLs retain the module release cache identity', () => {
    assert.equal(getLogoPreparationWorkerUrl('https://example.test/WPS/js/logo-preparation.js?v=2026.10.16').href,
        'https://example.test/WPS/js/logo-prepare.worker.js?v=2026.10.16');
});

test('a prepared studio asset skips repeated GPU lighting generation in the geometry worker', async () => {
    const namespace = { BufferGeometry: THREE.BufferGeometry, BufferAttribute: THREE.BufferAttribute };
    const environment = { pixels: Uint16Array.from([0x3c00, 0x3800, 0x3400, 0x3c00]), width: 1, height: 1, texture: {}, source: 'asset' };
    let request;
    class GeometryWorker {
        postMessage(message) {
            request = message;
            queueMicrotask(() => this.onmessage({ data: { data: { box: serializeLogoGeometry(new THREE.BoxGeometry()) }, duration: 12 } }));
        }
        terminate() {}
    }
    const module = await import('../js/logo-preparation.js?case=prepared-studio');
    const result = await module.prepareLogoGeometries(namespace, { WorkerClass: GeometryWorker, loadEnvironment: async () => environment });
    assert.equal(request.lighting, false, 'the worker must only generate geometry when studio pixels already exist');
    assert.equal(result.lighting, 'asset');
    assert.equal(getPreparedLogoEnvironment(namespace), environment);
    assert.ok(getPreparedLogoGeometry(namespace, 'box'));
});

test('the shipped compressed lighting decodes to finite half-float pixels and rejects damaged layouts', async () => {
    const bytes = await readFile(new URL('../assets/branding/sherpa-studio-lighting-v1.bin.gz', import.meta.url));
    const environment = await loadLogoStudioEnvironment({ fetchAsset: async () => new Response(bytes) });
    assert.equal(environment.source, 'asset');
    assert.equal(environment.pixels.length, 384 * 512 * 4);
    assert.equal(environment.texture.mapping, THREE.CubeUVReflectionMapping);
    const raw = Uint8Array.from(gunzipSync(bytes)).buffer;
    assert.throws(() => decodeLogoStudioEnvironment(raw.slice(0, -8)), /layout/);
    const zero = raw.slice(0), offset = 4 + new DataView(zero).getUint32(0, true);
    new Uint8Array(zero, offset).fill(0);
    assert.throws(() => decodeLogoStudioEnvironment(zero), /pixels/);
    new DataView(raw).setUint16(offset, 0x7c00, true);
    assert.throws(() => decodeLogoStudioEnvironment(raw), /pixels/);
});

test('unavailable compression, a missing asset or malformed data leaves the original lighting builder available', async () => {
    for (const options of [
        { Decompress: null },
        { fetchAsset: async () => new Response(null, { status: 404 }) },
        { fetchAsset: async () => new Response('damaged gzip') },
        { fetchAsset: async () => { throw new Error('offline'); } }
    ]) assert.equal(await loadLogoStudioEnvironment(options), null);
});

test('worker failure still reuses valid studio pixels for the main-thread fallback', async () => {
    const namespace = { BufferGeometry: THREE.BufferGeometry, BufferAttribute: THREE.BufferAttribute };
    const environment = { pixels: Uint16Array.from([0x3c00, 0x3800, 0x3400, 0x3c00]), width: 1, height: 1, texture: {}, source: 'asset' };
    class FailedWorker {
        postMessage() { queueMicrotask(() => this.onerror({ preventDefault() {} })); }
        terminate() {}
    }
    const module = await import('../js/logo-preparation.js?case=asset-with-failed-worker');
    const result = await module.prepareLogoGeometries(namespace, { WorkerClass: FailedWorker, loadEnvironment: async () => environment });
    assert.equal(result.mode, 'main-thread');
    assert.equal(result.lighting, 'asset');
    assert.equal(getPreparedLogoEnvironment(namespace), environment);
});

test('transferred geometry retains its attributes, holes, material groups and independent GPU buffers', () => {
    const source = new THREE.BoxGeometry();
    const transfers = new Set();
    const data = serializeLogoGeometry(source, transfers);
    assert.ok(transfers.size >= 3);
    const namespace = { BufferGeometry: THREE.BufferGeometry, BufferAttribute: THREE.BufferAttribute };
    installPreparedLogoGeometries(namespace, { box: data });
    const template = getPreparedLogoGeometry(namespace, 'box');
    assert.deepEqual(template.groups, source.groups);
    assert.deepEqual(template.index.array, source.index.array);
    const first = template.clone(), second = template.clone();
    first.attributes.position.array[0] += 10;
    assert.notEqual(first.attributes.position.array[0], second.attributes.position.array[0]);
    assert.equal(second.attributes.position.array[0], template.attributes.position.array[0]);
});

test('real worker generates byte-identical sculpture surfaces to the original builders', { timeout: 30000 }, async () => {
    const worker = new Worker(new URL('./helpers/logo-worker.mjs', import.meta.url));
    try {
        await once(worker, 'message');
        worker.postMessage({ prepare: true });
        const [result] = await once(worker, 'message');
        assert.equal(result.error, undefined);
        const identity = createFspCore(THREE, { full: new THREE.Texture(), compact: new THREE.Texture() });
        const expected = Object.fromEntries(Object.entries(identity.userData.variants).map(([name, mesh]) => [`fsp-${name}`, mesh.geometry]));
        for (const [name, geometry] of Object.entries(createGlobeGeometry(THREE))) expected[`globe-${name}`] = geometry;
        expected.heart = createHeartGeometry(THREE);
        expected['heart-inlay'] = createHeartInlayGeometry(THREE);
        for (const [name, geometry] of Object.entries(createSummitGeometry(THREE))) expected[`summit-${name}`] = geometry;
        expected.infinity = createInfinityGeometry(THREE);
        assert.deepEqual(Object.keys(result.data).sort(), Object.keys(expected).sort());
        for (const [name, geometry] of Object.entries(expected)) {
            const serialized = serializeLogoGeometry(geometry);
            assert.deepEqual(result.data[name], serialized, name);
        }
        installPreparedLogoGeometries(THREE, result.data);
        const first = createHeartGeometry(THREE), second = createHeartGeometry(THREE);
        assert.notEqual(first.attributes.position.array.buffer, second.attributes.position.array.buffer);
        assert.deepEqual(first.attributes.position.array, result.data.heart.attributes.position.array);
    } finally { await worker.terminate(); }
});

test('prepared studio pixels keep independent GPU textures and survive controller disposal', () => {
    const namespace = { ...THREE, PMREMGenerator: class { constructor() { throw Error('Prepared lighting must not rebuild on the main thread'); } } };
    const pixels = Uint16Array.from([0x3c00, 0x3800, 0x3400, 0x3c00]);
    const environment = { pixels, width: 1, height: 1, texture: { mapping: THREE.CubeUVReflectionMapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, flipY: false, generateMipmaps: false } };
    installPreparedLogoGeometries(namespace, {}, environment);
    const scenes = [new THREE.Scene(), new THREE.Scene()];
    scenes.forEach(scene => scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())));
    const [first, second] = scenes.map(scene => createLogoStudioLighting(namespace, null, scene));
    assert.equal(first.preparation, 'worker');
    assert.notEqual(first.environment.texture, second.environment.texture);
    assert.equal(first.environment.texture.image.data, pixels);
    assert.equal(first.environment.texture.mapping, THREE.CubeUVReflectionMapping);
    let firstDisposals = 0, secondDisposals = 0;
    first.environment.texture.addEventListener('dispose', () => firstDisposals++);
    second.environment.texture.addEventListener('dispose', () => secondDisposals++);
    first.dispose(); first.dispose();
    assert.equal(firstDisposals, 1);
    assert.equal(secondDisposals, 0);
    assert.equal(scenes[0].environment, null);
    assert.equal(scenes[0].children[0].material.envMap, null);
    assert.equal(scenes[1].environment, second.environment.texture);
    assert.equal(getPreparedLogoEnvironment(namespace).pixels, pixels);
    second.dispose();
    assert.equal(secondDisposals, 1);
});

test('invalid optional studio pixels leave the original lighting path available', () => {
    const namespace = { BufferGeometry: THREE.BufferGeometry, BufferAttribute: THREE.BufferAttribute };
    installPreparedLogoGeometries(namespace, {}, { pixels: new Uint16Array(3), width: 1, height: 1 });
    assert.equal(getPreparedLogoEnvironment(namespace), null);
});

test('unavailable or failed preparation leaves the original builders usable', async () => {
    const absent = await import('../js/logo-preparation.js?case=absent');
    assert.equal((await absent.prepareLogoGeometries(THREE, { WorkerClass: null })).mode, 'main-thread');
    let terminations = 0;
    class FailedWorker {
        postMessage() { queueMicrotask(() => this.onerror({ preventDefault() {} })); }
        terminate() { terminations++; }
    }
    const failed = await import('../js/logo-preparation.js?case=failed');
    const first = failed.prepareLogoGeometries(THREE, { WorkerClass: FailedWorker });
    assert.equal(first, failed.prepareLogoGeometries(THREE, { WorkerClass: FailedWorker }));
    assert.equal((await first).mode, 'main-thread');
    assert.equal(terminations, 1);
});

test('a stalled worker is terminated and a late payload cannot replace fallback state', async () => {
    let worker, terminations = 0;
    class StalledWorker {
        constructor() { worker = this; }
        postMessage() {}
        terminate() { terminations++; }
    }
    const namespace = { BufferGeometry: THREE.BufferGeometry, BufferAttribute: THREE.BufferAttribute };
    const stalled = await import('../js/logo-preparation.js?case=stalled');
    assert.equal((await stalled.prepareLogoGeometries(namespace, { WorkerClass: StalledWorker, timeout: 5 })).mode, 'main-thread');
    worker.onmessage({ data: { data: { late: serializeLogoGeometry(new THREE.BoxGeometry()) } } });
    assert.equal(getPreparedLogoGeometry(namespace, 'late'), null);
    assert.equal(terminations, 1);
});
