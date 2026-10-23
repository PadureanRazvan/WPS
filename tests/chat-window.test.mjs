import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatWindow } from '../js/chat-window.js';

class Target {
    constructor() {
        this.listeners = new Map();
        this.style = {};
        this.classes = new Set();
        this.captures = new Set();
        this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
    }
    addEventListener(name, listener) {
        if (!this.listeners.has(name)) this.listeners.set(name, new Set());
        this.listeners.get(name).add(listener);
    }
    removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
    emit(name, details = {}) {
        const event = { target: this, pointerId: 1, button: 0, isPrimary: true,
            clientX: 0, clientY: 0, preventDefault() { this.defaultPrevented = true; }, ...details };
        for (const listener of [...this.listeners.get(name) || []]) listener(event);
        return event;
    }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) {
        this.captures.delete(id);
        this.emit('lostpointercapture', { pointerId: id });
    }
    closest() { return null; }
    focus() { this.focused = true; }
    get offsetWidth() { return Math.min(this.width ?? 420, parseFloat(this.style.maxWidth) || Infinity); }
    get offsetHeight() { return Math.min(this.height ?? 580, parseFloat(this.style.maxHeight) || Infinity); }
    listenerCount() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}

function fixture(t, { width = 1600, height = 1000, visual = false, insets = {} } = {}) {
    const view = new Target(), panel = new Target(), handle = new Target();
    view.innerWidth = width; view.innerHeight = height;
    if (visual) view.visualViewport = Object.assign(new Target(), { width, height, offsetLeft: 0, offsetTop: 0 });
    const frames = new Map(), observers = [];
    let frameId = 0;
    view.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
    view.cancelAnimationFrame = id => frames.delete(id);
    view.getComputedStyle = () => ({ getPropertyValue: name => `${insets[name] || 0}px` });
    view.ResizeObserver = class {
        constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
        observe() { this.connected = true; }
        disconnect() { this.connected = false; }
    };
    const controller = createChatWindow({ panel, handle, view });
    t.after(() => controller.dispose());
    const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
    const position = () => ({ left: parseFloat(panel.style.left), top: parseFloat(panel.style.top),
        right: parseFloat(panel.style.left) + panel.offsetWidth, bottom: parseFloat(panel.style.top) + panel.offsetHeight });
    const reachable = () => {
        const rect = position(), visible = view.visualViewport ?? { width: view.innerWidth, height: view.innerHeight, offsetLeft: 0, offsetTop: 0 };
        assert.ok(rect.left >= visible.offsetLeft, JSON.stringify(rect));
        assert.ok(rect.top >= visible.offsetTop, JSON.stringify(rect));
        assert.ok(rect.right <= visible.offsetLeft + visible.width, JSON.stringify(rect));
        assert.ok(rect.bottom <= visible.offsetTop + visible.height, JSON.stringify(rect));
    };
    return { controller, panel, handle, view, frames, observers, flush, position, reachable };
}

test('dragged window remains entirely reachable after moving to a smaller screen', t => {
    const f = fixture(t);
    f.controller.open();
    f.handle.emit('pointerdown', { clientX: 1200, clientY: 420 });
    f.view.emit('pointermove', { clientX: 1500, clientY: 920 });
    f.view.emit('pointerup');
    assert.ok(f.position().top > 300);
    f.view.innerWidth = 640; f.view.innerHeight = 360;
    f.view.emit('resize'); f.flush();
    f.reachable();
    assert.equal(f.panel.offsetHeight, 336);
    assert.equal(f.position().top, 12);
});

test('first open fits short and narrow screens without a companion offset', t => {
    const f = fixture(t, { width: 320, height: 420 });
    f.controller.open(); f.reachable();
    assert.equal(f.panel.offsetWidth, 296);
    assert.equal(f.panel.offsetHeight, 396);
    assert.equal(f.position().top, 12);
    assert.equal(f.frames.size, 0);
});

test('virtual keyboard, browser zoom, and panning clamp to the visual viewport', t => {
    const f = fixture(t, { width: 800, height: 900, visual: true });
    f.controller.open();
    Object.assign(f.view.visualViewport, { width: 360, height: 260, offsetLeft: 120, offsetTop: 300 });
    f.view.visualViewport.emit('resize'); f.view.visualViewport.emit('scroll');
    assert.equal(f.frames.size, 1);
    f.flush(); f.reachable();
    assert.equal(f.position().top, 312);
    assert.equal(f.position().left, 132);
});

test('safe area insets and panel content growth preserve reachable header and controls', t => {
    const f = fixture(t, { width: 700, height: 750, insets: { '--safe-area-top': 44, '--safe-area-bottom': 34 } });
    f.panel.height = 200; f.controller.open();
    f.panel.height = 640;
    f.observers[0].callback(); f.flush();
    assert.ok(f.position().top >= 56);
    assert.ok(f.position().bottom <= 704);
    f.reachable();
});

test('pointer ownership, cancellation, and capture loss end dragging safely', t => {
    const f = fixture(t); f.controller.open();
    f.handle.emit('pointerdown', { pointerId: 7 });
    assert.ok(f.handle.hasPointerCapture(7));
    const start = f.position();
    f.view.emit('pointermove', { pointerId: 8, clientX: -500, clientY: -300 });
    assert.deepEqual(f.position(), start);
    f.view.emit('pointercancel', { pointerId: 8 });
    assert.ok(f.panel.classes.has('dragging'));
    f.view.emit('pointercancel', { pointerId: 7 });
    assert.equal(f.panel.classes.has('dragging'), false);
    assert.equal(f.handle.hasPointerCapture(7), false);
    f.handle.emit('pointerdown', { pointerId: 2 });
    f.handle.releasePointerCapture(2);
    assert.equal(f.panel.classes.has('dragging'), false);
    f.handle.emit('pointerdown'); f.view.emit('blur');
    assert.equal(f.panel.classes.has('dragging'), false);
});

test('header buttons, right click, and secondary touch never start dragging', t => {
    const f = fixture(t); f.controller.open();
    const button = { closest: () => ({}) };
    assert.equal(f.handle.emit('pointerdown', { target: button }).defaultPrevented, undefined);
    f.handle.emit('pointerdown', { button: 2 });
    f.handle.emit('pointerdown', { isPrimary: false });
    assert.equal(f.panel.classes.has('dragging'), false);
    assert.equal(f.handle.captures.size, 0);
});

test('keyboard movement persists across hide/open and Home returns to a safe corner', t => {
    const f = fixture(t); f.controller.open();
    const home = f.position();
    f.handle.emit('keydown', { key: 'ArrowLeft', shiftKey: true });
    f.handle.emit('keydown', { key: 'ArrowUp' });
    assert.equal(f.position().left, home.left - 40);
    assert.equal(f.position().top, home.top - 12);
    const moved = f.position();
    f.controller.close(); f.controller.open();
    assert.deepEqual(f.position(), moved);
    f.handle.emit('keydown', { key: 'Home' });
    assert.deepEqual(f.position(), home);
    assert.equal(f.handle.emit('keydown', { key: 'ArrowLeft', target: {} }).defaultPrevented, undefined);
    assert.equal(f.handle.emit('keydown', { key: 'ArrowLeft', altKey: true }).defaultPrevented, undefined);
});

test('resize during dragging releases capture before clamping and stale movement is ignored', t => {
    const f = fixture(t); f.controller.open(); f.handle.emit('pointerdown');
    f.view.innerWidth = 500; f.view.innerHeight = 400;
    f.view.emit('resize'); f.flush();
    const clamped = f.position(); f.reachable();
    f.view.emit('pointermove', { clientX: 5000, clientY: 5000 });
    assert.deepEqual(f.position(), clamped);
    assert.equal(f.handle.captures.size, 0);
});

test('hidden and disposed windows have no animation loop or resize observer work', t => {
    const f = fixture(t, { visual: true });
    f.view.emit('resize'); assert.equal(f.frames.size, 0);
    f.controller.open(); assert.equal(f.observers[0].connected, true);
    f.view.emit('resize'); assert.equal(f.frames.size, 1);
    f.controller.close(); assert.equal(f.frames.size, 0);
    assert.equal(f.observers[0].connected, false);
    f.view.visualViewport.emit('scroll'); assert.equal(f.frames.size, 0);
    f.controller.dispose(); f.controller.dispose(); f.controller.open();
    assert.equal(f.handle.listenerCount() + f.view.listenerCount() + f.view.visualViewport.listenerCount(), 0);
    assert.equal(f.observers[0].connected, false);
});
