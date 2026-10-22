import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.min.js';
import { createSherpaBoss } from '../js/sherpa-boss.js';

// Exercise pointer ownership and lifecycle with explicit DOM adapters. These
// checks cover orchestration; the browser review covers rendered appearance.
class Target {
    constructor({ width = 132, height = 200 } = {}) {
        this.width = width;
        this.height = height;
        this.dataset = {};
        this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
        this.attributes = new Map();
        this.listeners = new Map();
        this.captures = new Set();
        this.classes = new Set();
        this.isConnected = true;
        this.classList = {
            add: (...names) => names.forEach(name => this.classes.add(name)),
            remove: (...names) => names.forEach(name => this.classes.delete(name)),
            contains: name => this.classes.has(name),
            toggle: (name, force) => {
                const next = force ?? !this.classes.has(name);
                if (next) this.classes.add(name); else this.classes.delete(name);
                return next;
            }
        };
    }
    addEventListener(name, handler) {
        if (!this.listeners.has(name)) this.listeners.set(name, new Set());
        this.listeners.get(name).add(handler);
    }
    removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    getBoundingClientRect() {
        const numberOr = (value, fallback) => Number.isFinite(Number.parseFloat(value)) ? Number.parseFloat(value) : fallback;
        const left = numberOr(this.style.left, 600);
        const top = numberOr(this.style.top, 400);
        return { left, top, right: left + this.width, bottom: top + this.height, width: this.width, height: this.height };
    }
    getClientRects() { return this.isConnected ? [this.getBoundingClientRect()] : []; }
    get offsetWidth() { return this.width; }
    get offsetHeight() { return this.height; }
    get clientWidth() { return this.width; }
    get clientHeight() { return this.height; }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) {
        if (this.captures.delete(id)) this.emit('lostpointercapture', { pointerId: id });
    }
    querySelector(selector) { return selector.includes('canvas') ? this.canvas : null; }
    getContext() { return { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }; }
    closest() { return null; }
    focus() { this.focused = true; }
    emit(name, details = {}) {
        const event = {
            target: this, currentTarget: this, pointerId: 1, pointerType: 'mouse', button: 0,
            clientX: 666, clientY: 450, detail: 1, timeStamp: 0, key: '',
            defaultPrevented: false, propagationStopped: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { this.propagationStopped = true; },
            stopImmediatePropagation() { this.propagationStopped = true; },
            ...details
        };
        for (const handler of [...this.listeners.get(name) || []]) handler(event);
        return event;
    }
    listenerCount() { return [...this.listeners.values()].reduce((count, set) => count + set.size, 0); }
}

function fixture(t, { reduced = false, canvas = true, deferred = null, graphicsError = null, modelError = false } = {}) {
    const frames = new Map(), descriptors = new Map(), renderers = [], models = [], observers = [];
    let id = 0, time = 0, activations = 0;
    const element = new Target(), window = new Target(), document = new Target(), motion = new Target();
    const minimizeButton = new Target(), dockButton = new Target();
    element.canvas = canvas ? new Target() : null;
    motion.matches = reduced;
    window.innerWidth = 1200; window.innerHeight = 800; window.devicePixelRatio = 1;
    window.matchMedia = () => motion;
    document.hidden = false;
    document.createElement = () => new Target();
    class ResizeObserver {
        constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
        observe() {}
        disconnect() { this.disconnected = true; }
    }
    class RecordingRenderer {
        constructor() { this.frames = 0; this.disposals = 0; renderers.push(this); }
        setClearColor() {}
        setPixelRatio(value) { this.pixelRatio = value; }
        setSize(width, height) { this.width = width; this.height = height; }
        render(scene, camera) { this.frames++; this.scene = scene; this.camera = camera; }
        dispose() { this.disposals++; }
    }
    const graphics = [{ ...THREE, WebGLRenderer: RecordingRenderer }, {
        createSherpaBossModel() {
            if (modelError) throw new Error('Model construction failed');
            const root = new THREE.Group();
            const joints = Object.fromEntries(['head', 'leftUpperArm', 'leftForearm', 'rightUpperArm', 'rightForearm', 'leftThigh', 'leftShin', 'rightThigh', 'rightShin'].map(name => [name, new THREE.Group()]));
            root.add(...Object.values(joints));
            const model = { root, joints, disposals: 0, blink() {}, setMood(value) { this.mood = value; }, dispose() { this.disposals++; } };
            models.push(model);
            return model;
        }
    }];
    const globals = {
        window, document, ResizeObserver,
        requestAnimationFrame(callback) { const next = ++id; frames.set(next, callback); return next; },
        cancelAnimationFrame(frame) { frames.delete(frame); }
    };
    for (const [name, value] of Object.entries(globals)) {
        descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    }
    if (graphicsError || modelError) t.mock.method(console, 'warn', () => {});
    const controller = createSherpaBoss({
        element, minimizeButton, dockButton, onActivate: () => activations++,
        loadGraphics: async () => {
            if (deferred) await deferred.promise;
            if (graphicsError) throw graphicsError;
            return graphics;
        }
    });
    t.after(() => {
        controller.dispose();
        for (const [name, descriptor] of descriptors) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    });
    return {
        controller, element, window, document, motion, frames, renderers, models, observers, minimizeButton, dockButton,
        get activations() { return activations; },
        tick(delta = 1000 / 60) {
            time += delta;
            const batch = [...frames.values()]; frames.clear();
            for (const callback of batch) callback(time);
        },
        drag() {
            element.emit('pointerdown', { timeStamp: 0 });
            element.emit('pointermove', { clientX: 730, clientY: 490, timeStamp: 20 });
            element.emit('pointermove', { clientX: 760, clientY: 515, timeStamp: 40 });
        }
    };
}

test('drag captures exactly one pointer, suppresses its synthetic click, and preserves later taps', async t => {
    const f = fixture(t); assert.equal(await f.controller.ready, true);
    f.drag();
    assert.equal(f.controller.getDiagnostics().dragging, true);
    assert.equal(f.element.captures.size, 1);
    f.tick(); f.tick();
    const position = f.controller.getDiagnostics().position;
    assert.ok(position.x > 600 && position.y > 400);
    f.element.emit('pointermove', { pointerId: 2, clientX: 10, clientY: 10 });
    assert.deepEqual(f.controller.getDiagnostics().position, position, 'secondary pointer must not own this drag');
    f.element.emit('pointerup', { timeStamp: 50 });
    assert.equal(f.element.captures.size, 0);
    assert.equal(f.controller.getDiagnostics().dragging, false);
    assert.equal(f.element.emit('click').defaultPrevented, true);
    assert.equal(f.activations, 0);
    f.element.emit('pointerdown'); f.element.emit('pointerup'); f.element.emit('click');
    assert.equal(f.activations, 1);
});

test('small pointer jitter and keyboard clicks activate without dragging', async t => {
    const f = fixture(t); await f.controller.ready;
    f.element.emit('pointerdown');
    f.element.emit('pointermove', { clientX: 669, clientY: 452 });
    f.element.emit('pointerup'); f.element.emit('click');
    assert.equal(f.activations, 1);
    assert.equal(f.controller.getDiagnostics().position.x, 600);
    f.drag(); f.element.emit('pointerup', { timeStamp: 50 });
    f.element.emit('click', { detail: 0 });
    assert.equal(f.activations, 2, 'native Enter and Space click must survive a prior pointer drag');
});

test('pointer cancellation and lost capture leave no throw or stuck drag', async t => {
    const f = fixture(t); await f.controller.ready;
    for (const event of ['pointercancel', 'lostpointercapture']) {
        f.drag(); f.element.emit(event);
        assert.equal(f.controller.getDiagnostics().dragging, false, event);
        assert.equal(f.controller.getDiagnostics().falling, false, event);
        assert.equal(f.element.captures.size, 0, event);
        assert.equal(f.element.dataset.bossDragging, undefined, event);
        assert.equal(f.element.emit('click').defaultPrevented, true, event);
    }
});

test('a secondary pointer cancellation cannot steal the active drag', async t => {
    const f = fixture(t); await f.controller.ready;
    f.drag();
    f.element.emit('pointercancel', { pointerId: 2 });
    f.element.emit('lostpointercapture', { pointerId: 2 });
    assert.equal(f.controller.getDiagnostics().dragging, true);
    assert.equal(f.element.hasPointerCapture(1), true);
    f.element.emit('pointerup', { pointerId: 1, timeStamp: 50 });
    assert.equal(f.controller.getDiagnostics().dragging, false);
    assert.equal(f.element.captures.size, 0);
});

test('hide, pause and page visibility cancel held pointers and leave no animation callbacks', async t => {
    const f = fixture(t); await f.controller.ready; f.tick();
    assert.equal(f.frames.size, 1);
    for (const [hide, show] of [
        [() => f.controller.setVisible(false), () => f.controller.setVisible(true)],
        [() => f.controller.setPaused(true), () => f.controller.setPaused(false)],
        [() => { f.document.hidden = true; f.document.emit('visibilitychange'); }, () => { f.document.hidden = false; f.document.emit('visibilitychange'); }]
    ]) {
        f.drag(); hide();
        assert.equal(f.element.captures.size, 0);
        assert.equal(f.controller.getDiagnostics().dragging, false);
        assert.equal(f.frames.size, 0);
        const renders = f.renderers[0].frames;
        f.tick(10000);
        assert.equal(f.renderers[0].frames, renders);
        show(); f.tick();
        assert.equal(f.frames.size, 1);
    }
});

test('reduced motion paints a static pose, stays draggable, and does not fling', async t => {
    const f = fixture(t, { reduced: true }); await f.controller.ready; f.tick();
    assert.equal(f.frames.size, 0);
    f.controller.play('wave'); f.tick();
    assert.equal(f.frames.size, 0);
    f.drag(); f.tick();
    f.element.emit('pointerup', { timeStamp: 50 }); f.tick();
    assert.equal(f.controller.getDiagnostics().falling, false);
    assert.equal(f.frames.size, 0);
    f.motion.matches = false; f.motion.emit('change'); f.tick();
    assert.equal(f.frames.size, 1);
    f.motion.matches = true; f.motion.emit('change'); f.tick();
    assert.equal(f.frames.size, 0);
});

test('disposing while graphics are loading cannot construct or resurrect a renderer', async t => {
    const deferred = Promise.withResolvers();
    const f = fixture(t, { deferred });
    f.controller.dispose(); deferred.resolve();
    assert.equal(await f.controller.ready, false);
    assert.equal(f.renderers.length, 0);
    assert.equal(f.frames.size, 0);
    assert.equal(f.element.listenerCount(), 0);
    assert.equal(f.window.listenerCount(), 0);
    assert.equal(f.document.listenerCount(), 0);
});

test('graphics resolving while hidden remain asleep until explicitly shown', async t => {
    const deferred = Promise.withResolvers();
    const f = fixture(t, { deferred });
    f.controller.setVisible(false); deferred.resolve();
    assert.equal(await f.controller.ready, true);
    assert.equal(f.frames.size, 0);
    assert.equal(f.renderers[0].frames, 0);
    f.controller.setVisible(true); f.tick();
    assert.equal(f.renderers[0].frames, 1);
    assert.equal(f.frames.size, 1);
});

test('a preview paused before graphics load paints exactly one static frame', async t => {
    const deferred = Promise.withResolvers();
    const f = fixture(t, { deferred });
    f.controller.setPaused(true); deferred.resolve();
    assert.equal(await f.controller.ready, true);
    assert.equal(f.element.dataset.bossRenderer, 'three');
    assert.equal(f.renderers[0].frames, 1, 'paused preview must have a visible initial frame');
    assert.equal(f.controller.getDiagnostics().renderCount, 1);
    assert.equal(f.frames.size, 0);
    f.tick(10000);
    assert.equal(f.renderers[0].frames, 1);
});

test('turning a paused preview redraws once without animation or hidden GPU work', async t => {
    const f = fixture(t); await f.controller.ready; f.tick();
    f.controller.setPaused(true);
    const renderer = f.renderers[0], before = renderer.frames;
    f.controller.setYaw(0.75);
    assert.equal(renderer.frames, before + 1);
    const pivot = renderer.scene.children.find(child => child.isGroup && child.children.includes(f.models[0].root));
    assert.ok(Math.abs(pivot.rotation.y - 0.75) < 0.001);
    assert.equal(f.frames.size, 0);
    f.tick(10000);
    assert.equal(renderer.frames, before + 1);
    f.controller.setVisible(false); f.controller.setYaw(1);
    assert.equal(renderer.frames, before + 1, 'hidden preview must not render');
    f.controller.setVisible(true);
    f.document.hidden = true; f.controller.setYaw(1.5);
    assert.equal(renderer.frames, before + 2, 'only becoming visible may redraw; background page must not render');
});

test('resizing a paused preview repaints its resized canvas without starting animation', async t => {
    const f = fixture(t); await f.controller.ready; f.tick();
    f.controller.setPaused(true);
    const renderer = f.renderers[0], before = renderer.frames;
    f.element.width = 240; f.element.height = 360;
    f.observers[0].callback();
    assert.ok(renderer.width >= 360, 'padded canvas must fit a horizontal body');
    assert.ok(renderer.height >= 360);
    assert.equal(renderer.frames, before + 1);
    assert.equal(f.frames.size, 0);
    f.controller.setVisible(false); f.observers[0].callback();
    assert.equal(renderer.frames, before + 1, 'hidden resizing must not render');
    f.controller.setVisible(true);
    f.document.hidden = true; f.observers[0].callback();
    assert.equal(renderer.frames, before + 2, 'only becoming visible may redraw; background resizing must not render');
    f.document.hidden = false; f.document.emit('visibilitychange');
    assert.equal(renderer.frames, before + 3, 'returning to a resized paused canvas restores its picture');
    assert.equal(f.frames.size, 0);
});

test('restoring a paused graphics context paints one frame and respects visibility', async t => {
    const f = fixture(t); await f.controller.ready; f.tick();
    f.controller.setPaused(true);
    const renderer = f.renderers[0], before = renderer.frames;
    f.element.canvas.emit('webglcontextlost'); f.element.canvas.emit('webglcontextrestored');
    assert.equal(f.element.dataset.bossRenderer, 'three');
    assert.equal(renderer.frames, before + 1);
    assert.equal(f.frames.size, 0);
    f.controller.setVisible(false);
    f.element.canvas.emit('webglcontextlost'); f.element.canvas.emit('webglcontextrestored');
    assert.equal(renderer.frames, before + 1, 'hidden recovery must not render');
    f.controller.setVisible(true);
    f.document.hidden = true;
    f.element.canvas.emit('webglcontextlost'); f.element.canvas.emit('webglcontextrestored');
    assert.equal(renderer.frames, before + 2, 'only becoming visible may redraw; background recovery must not render');
});

test('graphics failure keeps chat activation and releases partial GPU state', async t => {
    const f = fixture(t, { modelError: true });
    assert.equal(await f.controller.ready, false);
    assert.equal(f.element.dataset.bossRenderer, 'fallback');
    assert.equal(f.renderers[0].disposals, 1);
    assert.equal(f.frames.size, 0);
    f.element.emit('click'); f.element.emit('click', { detail: 0 });
    assert.equal(f.activations, 2);
    f.controller.dispose();
    assert.equal(f.renderers[0].disposals, 1, 'partial renderer must not be disposed twice');
});

test('absent canvas still provides an accessible, non-animating chat action', async t => {
    const f = fixture(t, { canvas: false });
    assert.equal(await f.controller.ready, false);
    assert.equal(f.frames.size, 0);
    f.element.emit('click', { detail: 0 });
    assert.equal(f.activations, 1);
});

test('keyboard placement clamps to viewport and Home restores the default anchor', async t => {
    const f = fixture(t); await f.controller.ready;
    f.element.emit('keydown', { key: 'ArrowLeft', shiftKey: true });
    assert.equal(f.controller.getDiagnostics().position.x, 576);
    for (let step = 0; step < 60; step++) f.element.emit('keydown', { key: 'ArrowRight', shiftKey: true });
    assert.equal(f.controller.getDiagnostics().position.x, 1060);
    f.window.innerWidth = 360; f.window.innerHeight = 640; f.window.emit('resize');
    assert.equal(f.controller.getDiagnostics().position.x, 220);
    assert.ok(f.controller.getDiagnostics().position.y <= 416);
    f.element.emit('keydown', { key: 'Home' });
    assert.equal(f.element.style.left, '');
    assert.equal(f.element.style.top, '');
    assert.equal(f.element.style.right, '');
    assert.equal(f.element.style.bottom, '');
});

test('context loss stops rendering, restoration resumes, and final disposal is complete and idempotent', async t => {
    const f = fixture(t); await f.controller.ready; f.tick();
    f.drag();
    assert.equal(f.element.canvas.emit('webglcontextlost').defaultPrevented, true);
    assert.equal(f.element.dataset.bossRenderer, 'fallback');
    assert.equal(f.element.captures.size, 0);
    assert.equal(f.controller.getDiagnostics().dragging, false);
    assert.equal(f.controller.getDiagnostics().falling, false);
    assert.equal(f.frames.size, 0);
    f.element.canvas.emit('webglcontextrestored'); f.tick();
    assert.equal(f.element.dataset.bossRenderer, 'three');
    assert.equal(f.frames.size, 1);
    f.controller.dispose(); f.controller.dispose();
    assert.equal(f.frames.size, 0);
    assert.equal(f.renderers[0].disposals, 1);
    assert.equal(f.models[0].disposals, 1);
    assert.ok(f.observers.every(observer => observer.disconnected));
    for (const target of [f.element, f.element.canvas, f.window, f.document, f.motion]) assert.equal(target.listenerCount(), 0);
    f.controller.play('dance'); f.controller.setVisible(true); f.controller.setPaused(false); f.tick();
    assert.equal(f.frames.size, 0);
});

test('hover greets once, touch hover stays quiet, and click preserves chat activation', async t => {
    const f = fixture(t); await f.controller.ready;
    f.element.emit('pointerenter', { pointerType: 'touch' });
    assert.equal(f.element.dataset.bossAction, undefined);
    f.element.emit('pointerenter');
    assert.equal(f.element.dataset.bossAction, 'wave');
    f.element.emit('click');
    assert.equal(f.activations, 1);
    f.controller.setPaused(true); f.controller.resetPosition(); f.element.emit('pointerenter');
    assert.equal(f.element.dataset.bossAction, undefined);
});

test('minimize stops rendering, leaves a focusable dock, and restore starts in the corner', async t => {
    const f = fixture(t); await f.controller.ready; f.tick();
    f.drag(); f.minimizeButton.emit('click');
    assert.equal(f.controller.getDiagnostics().minimized, true);
    assert.equal(f.controller.getDiagnostics().dragging, false);
    assert.equal(f.frames.size, 0);
    assert.equal(f.dockButton.hidden, false);
    assert.equal(f.dockButton.focused, true);
    assert.equal(f.element.tabIndex, -1);
    const frames = f.renderers[0].frames; f.tick(1000);
    assert.equal(f.renderers[0].frames, frames);
    f.dockButton.emit('click'); f.tick();
    assert.equal(f.controller.getDiagnostics().minimized, false);
    assert.equal(f.dockButton.hidden, true);
    assert.equal(f.element.tabIndex, 0);
    assert.equal(f.element.style.left, '');
    assert.equal(f.element.dataset.bossAction, 'wave');
    f.element.emit('keydown', { key: 'h' });
    assert.equal(f.controller.getDiagnostics().minimized, true);
    f.controller.setVisible(false); assert.equal(f.dockButton.hidden, true);
    f.controller.dispose(); assert.equal(f.minimizeButton.hidden, true);
});

test('shaking changes facial expression and settling returns to a neutral mood', async t => {
    const f = fixture(t); await f.controller.ready;
    f.element.emit('pointerdown', { clientX: 666, clientY: 435, timeStamp: 0 });
    for (let n = 1; n < 12; n++) {
        f.element.emit('pointermove', { clientX: n % 2 ? 710 : 610, clientY: 330, timeStamp: n * 40 });
        f.tick(40);
    }
    assert.ok(f.controller.getDiagnostics().reaction.discomfort > .5);
    assert.ok(f.models[0].mood.discomfort > .5);
    assert.ok(f.controller.getDiagnostics().grabbedPart);
    f.element.emit('pointerup', { timeStamp: 481 });
    for (let n = 0; n < 450; n++) f.tick();
    assert.equal(f.controller.getDiagnostics().reaction, null);
    assert.equal(f.models[0].mood.discomfort, 0);
});

test('disabled ragdoll keeps dragging and chat usable without a throw, and can be re-enabled', async t => {
    const f = fixture(t); await f.controller.ready;
    f.controller.setRagdollEnabled(false);
    f.drag(); f.tick();
    assert.equal(f.controller.getDiagnostics().dragging, true);
    assert.equal(f.controller.getDiagnostics().reaction, null);
    f.element.emit('pointerup', { timeStamp: 41 });
    const position = f.controller.getDiagnostics().position;
    for (let n = 0; n < 120; n++) f.tick();
    assert.deepEqual(f.controller.getDiagnostics().position, position);
    assert.equal(f.controller.getDiagnostics().falling, false);
    f.element.emit('click', { detail: 0 }); assert.equal(f.activations, 1);
    f.controller.setRagdollEnabled(true);
    f.drag(); f.tick(); f.element.emit('pointerup', { timeStamp: 41 });
    assert.equal(f.controller.getDiagnostics().falling, true);
});

test('disabling ragdoll during a grab releases capture and stops all physics immediately', async t => {
    const f = fixture(t); await f.controller.ready; f.drag(); f.tick();
    f.controller.setRagdollEnabled(false);
    assert.equal(f.element.captures.size, 0);
    assert.equal(f.controller.getDiagnostics().dragging, false);
    assert.equal(f.controller.getDiagnostics().falling, false);
    assert.equal(f.controller.getDiagnostics().reaction, null);
    f.motion.matches = false; f.motion.emit('change');
    assert.equal(f.controller.getDiagnostics().ragdollEnabled, false);
});
