// Long-running CPU/controller audit. This uses real Three.js geometry with a
// recording renderer, not WebGL: it cannot establish visual quality or GPU FPS.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { sculptureFixture } from '../tests/helpers/sculpture-scene.mjs';

const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const durationMinutes = Number(argument('minutes', '15'));
if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 300) throw new RangeError('--minutes must be between 0 and 300');
const directory = resolve(argument('output', 'output/sculpture-lifecycle'));
mkdirSync(directory, { recursive: true });
const logPath = resolve(directory, 'lifecycle.jsonl');
const sourcePaths = ['scripts/audit-sculpture-lifecycle.mjs', 'assets/vendor/three.module.min.js', 'js/animation-scheduler.js', 'tests/helpers/sculpture-scene.mjs',
    ...readdirSync('js').filter(name => name.startsWith('logo-') && name.endsWith('.js')).map(name => `js/${name}`)];
const sourceHashes = Object.fromEntries(sourcePaths.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
const record = item => appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...item })}\n`);
const started = performance.now();
let fixture, stopped = false, assertions = 0, totalTicks = 0, remounts = 0, contextRecoveries = 0;
let structure, eventIndex = -1, eventAge = 0, restored = true, lastSample = -1, lastRemount = 0;
let previous = started, peakHeap = 0, minimumHeap = Infinity, maxTickGapMs = 0;
const shapesSeen = new Set(), handoffsSeen = new Set();
const checks = new Map();
const check = (name, fn) => { fn(); assertions++; checks.set(name, (checks.get(name) || 0) + 1); };
const listeners = f => [f.control, f.canvas, f.document, f.window, f.motion].map(target => target.listenerCount());
function resources(f) {
    const geometries = new Set(), materials = new Set(); let nodes = 0, lights = 0;
    f.renderer.scene.traverse(object => {
        nodes++; if (object.isLight) lights++;
        if (object.geometry) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
    });
    return { nodes, lights, geometries: geometries.size, materials: materials.size, listeners: listeners(f) };
}
async function mount() {
    fixture = await sculptureFixture(null);
    structure = resources(fixture);
    eventIndex = -1; restored = true;
    record({ type: 'mount', remounts, resources: structure });
}
function unmount() {
    if (!fixture) return;
    fixture.controller.dispose();
    check('dispose leaves no callbacks, listeners, capture or observer', () => {
        assert.equal(fixture.frames.size, 0);
        assert.deepEqual(listeners(fixture), [0, 0, 0, 0, 0]);
        assert.equal(fixture.control.captures.size, 0);
        assert.ok(Object.values(fixture.observers).flat().every(observer => observer.disconnected));
        assert.equal(fixture.renderer.disposals, 1);
    });
    fixture.restore(); fixture = null;
}
function beginEvent(index) {
    const f = fixture;
    f.hidden(false); f.visible(true);
    if (f.motion.matches) f.reduced(false);
    f.controller.resume();
    f.control.emit('pointerup'); f.control.emit('pointerleave'); f.tick(0);
    const mode = index % 8;
    if (mode === 0) f.hidden(true);
    if (mode === 1) f.controller.pause();
    if (mode === 2) { f.control.emit('pointerdown'); f.control.emit('pointermove', { clientX: 190, clientY: 65 }); }
    if (mode === 3) f.visible(false);
    if (mode === 4) f.reduced(true);
    if (mode === 5) f.canvas.emit('webglcontextlost');
    if (mode === 6) {
        f.resize(44, 44, 2);
        f.control.sidebar = { classList: { contains: () => true } };
        f.resize(44, 44, 2);
    }
    if (mode === 7) { for (let click = 0; click < 7; click++) f.control.emit('click', { detail: 0 }); }
    eventAge = f.controller.getDiagnostics().timelineMs;
    restored = false;
}
function restoreEvent(index) {
    const f = fixture, mode = index % 8;
    if (mode === 0) f.hidden(false);
    if (mode === 1) f.controller.resume();
    if (mode === 2) { f.control.emit('pointerup', { clientX: 190, clientY: 65 }); f.control.emit('click'); f.control.emit('pointerleave'); }
    if (mode === 3) f.visible(true);
    if (mode === 4) f.reduced(false);
    if (mode === 5) { f.canvas.emit('webglcontextrestored'); contextRecoveries++; }
    if (mode === 6) { f.control.sidebar = null; f.resize(220, 185, 1); }
    f.document.documentElement.setAttribute('data-theme', ['dark', 'light', 'fsp', 'coral', 'aurora'][index % 5]);
    f.window.emit('sherpa-theme-changed');
    restored = true;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; });
record({ type: 'start', requestedMinutes: durationMinutes, renderer: 'recording, no GPU', sourceHashes });
console.log(`Controller audit: ${durationMinutes} minutes; evidence ${directory}`);
let failure = null;
try {
    await mount();
    while (!stopped && performance.now() - started < durationMinutes * 60000) {
        const now = performance.now(), elapsed = now - started, delta = now - previous;
        maxTickGapMs = Math.max(maxTickGapMs, delta);
        previous = now;
        const nextEvent = Math.floor(elapsed / 60000);
        if (nextEvent !== eventIndex) {
            if (!restored && eventIndex >= 0) restoreEvent(eventIndex);
            eventIndex = nextEvent; beginEvent(eventIndex);
        }
        if (!restored && elapsed % 60000 >= 8000) restoreEvent(eventIndex);
        fixture.tick(delta); totalTicks++;
        const state = fixture.controller.getDiagnostics();
        shapesSeen.add(state.shape);
        if (state.transition) handoffsSeen.add(`${state.shape}->${state.transition.target}`);
        check('finite pose and bounded callback queue', () => {
            assert.ok(state.rotation.every(Number.isFinite));
            assert.ok(Number.isFinite(state.timelineMs));
            assert.ok(fixture.frames.size <= 1);
            assert.ok(state.playbackRate >= 0 && state.playbackRate <= 1);
        });
        if (!restored && [0, 1, 3, 4, 5].includes(eventIndex % 8)) check('suspended scenes sleep and retain their clock', () => {
            assert.equal(fixture.frames.size, 0);
            assert.equal(state.timelineMs, eventAge);
        });
        if (!restored && eventIndex % 8 === 2) check('drag holds its chapter', () => assert.equal(state.timelineMs, eventAge));
        if (restored) check('resume keeps scene resources and listeners stable', () => assert.deepEqual(resources(fixture), structure));
        const minute = Math.floor(elapsed / 60000);
        if (minute !== lastSample) {
            lastSample = minute;
            global.gc?.();
            const memory = process.memoryUsage(), heap = memory.heapUsed;
            peakHeap = Math.max(peakHeap, heap); minimumHeap = Math.min(minimumHeap, heap);
            record({ type: 'sample', elapsedSeconds: elapsed / 1000, totalTicks, heapBytesAfterGc: heap, memoryAfterGc: memory, resources: resources(fixture),
                shape: state.shape, timelineMs: state.timelineMs, framesRendered: state.framesRendered, meanControllerFrameCpuMs: state.averageFrameCpuMs,
                maxControllerFrameCpuMs: state.maximumFrameCpuMs, assertions, contextRecoveries, remounts });
            if (minute % 5 === 0) console.log(JSON.stringify({ elapsedMinutes: minute, assertions, contextRecoveries, remounts, heapMiBAfterGc: +(heap / 1048576).toFixed(2), maxTickGapMs: +maxTickGapMs.toFixed(2) }));
        }
        if (elapsed - lastRemount >= 30 * 60000 && restored) {
            unmount(); remounts++; await mount(); lastRemount = performance.now() - started; previous = performance.now();
        }
        await wait(Math.max(1, 1000 / 60 - (performance.now() - now)));
    }
} catch (error) { failure = { message: error.message, stack: error.stack }; }
finally {
    try { unmount(); } catch (error) { failure ||= { message: error.message, stack: error.stack }; }
    await wait(0); global.gc?.(); await wait(0); global.gc?.();
    const summary = { status: failure ? 'failed' : stopped ? 'interrupted' : 'passed', renderer: 'recording, no GPU', elapsedSeconds: (performance.now() - started) / 1000,
        requestedMinutes: durationMinutes, totalTicks, assertions, checks: Object.fromEntries(checks), shapesSeen: [...shapesSeen], handoffsSeen: [...handoffsSeen],
        contextRecoveries, remounts, minimumHeapAfterGc: minimumHeap, peakHeapAfterGc: peakHeap, finalHeapAfterDispose: process.memoryUsage().heapUsed,
        finalMemoryAfterDispose: process.memoryUsage(),
        maxTickGapMs, sourceHashes, failure };
    record({ type: 'finish', ...summary });
    writeFileSync(resolve(directory, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    if (failure) process.exitCode = 1;
}
