import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogoInteraction, stepLogoSpring } from '../js/logo-interaction.js';

function fixture() {
    const listeners = new Map(), captures = new Set();
    let allowed = true;
    const control = {
        dataset: {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 220, height: 185 }),
        addEventListener: (name, handler) => listeners.set(name, handler),
        removeEventListener: (name, handler) => { if (listeners.get(name) === handler) listeners.delete(name); },
        setPointerCapture: id => captures.add(id),
        hasPointerCapture: id => captures.has(id),
        releasePointerCapture(id) { captures.delete(id); listeners.get('lostpointercapture')?.({ pointerId: id }); }
    };
    const interaction = createLogoInteraction(control, { canMove: () => allowed });
    return {
        interaction, control, listeners, captures,
        allow: value => { allowed = value; },
        event: (name, properties = {}) => listeners.get(name)?.({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: 110, clientY: 92, ...properties }),
        advance(seconds, fps = 60) { for (let frame = 0; frame < seconds * fps; frame++) interaction.step(1 / fps); }
    };
}

test('spring response has the same position and velocity at 30, 60 and 144 Hz', () => {
    const sample = fps => {
        let p = -0.2, v = 0.3;
        for (let frame = 0; frame < fps; frame++) [p, v] = stepLogoSpring(p, v, 0.4, 1 / fps);
        return [p, v];
    };
    const expected = sample(30);
    for (const fps of [60, 144]) assert.ok(sample(fps).every((value, axis) => Math.abs(value - expected[axis]) < 1e-12));
    assert.deepEqual(stepLogoSpring(0.2, 0.4, 0, 0), [0.2, 0.4]);
});

test('hover tilts quickly and returns smoothly without an overshoot from rest', () => {
    const f = fixture();
    f.event('pointermove', { clientX: 220, clientY: 185 });
    f.advance(0.15);
    assert.ok(f.interaction.value.x > 0.05 && f.interaction.value.x < 0.13);
    assert.ok(f.interaction.value.y > 0.035 && f.interaction.value.y < 0.1);
    f.advance(0.5);
    f.event('pointerleave');
    let last = f.interaction.value.x;
    for (let frame = 0; frame < 90; frame++) {
        f.interaction.step(1 / 60);
        assert.ok(f.interaction.value.x >= -1e-7 && f.interaction.value.x <= last + 1e-6);
        last = f.interaction.value.x;
    }
    assert.ok(last < 0.000001);
    f.interaction.dispose();
});

test('a drag captures its pointer and never also advances the sculpture', () => {
    const f = fixture();
    f.event('pointerdown'); f.event('pointermove', { clientX: 180, clientY: 105 });
    assert.equal(f.interaction.dragging, true);
    assert.equal(f.control.dataset.logoDragging, 'true');
    assert.equal(f.captures.size, 1);
    f.advance(0.2);
    assert.ok(f.interaction.value.x > 0.2);
    const released = f.interaction.value.x;
    f.event('pointerup', { clientX: 180, clientY: 105 });
    assert.equal(f.interaction.dragging, false);
    assert.equal(f.captures.size, 0);
    assert.equal(f.control.dataset.logoDragging, undefined);
    assert.equal(f.interaction.shouldActivate({ detail: 1 }), false);
    assert.equal(f.interaction.value.x, released, 'release must not snap to a new pose');
    f.advance(1);
    assert.ok(f.interaction.value.x < 0.09);
    f.event('pointerdown'); f.event('pointerup');
    assert.equal(f.interaction.shouldActivate({ detail: 1 }), true);
    f.interaction.dispose();
});

test('a tap, small pointer jitter and keyboard activation retain the normal next action', () => {
    const f = fixture();
    f.event('pointerdown'); f.event('pointermove', { clientX: 113 }); f.event('pointerup', { clientX: 113 });
    assert.equal(f.interaction.dragging, false);
    assert.equal(f.interaction.shouldActivate({ detail: 1 }), true);
    f.event('pointerdown'); f.event('pointermove', { clientX: 200 }); f.event('pointerup', { clientX: 200 });
    assert.equal(f.interaction.shouldActivate({ detail: 0 }), true);
    f.interaction.dispose();
});

test('releasing a drag outside the logo returns to neutral without needing a later leave event', () => {
    for (const [clientX, clientY] of [[-80, 92], [300, 92], [110, -40], [110, 250]]) {
        const f = fixture();
        f.event('pointerdown'); f.event('pointermove', { clientX, clientY }); f.advance(0.3);
        f.event('pointerup', { clientX, clientY });
        assert.equal(f.captures.size, 0);
        f.advance(1.5);
        assert.ok(Math.abs(f.interaction.value.x) < 1e-7 && Math.abs(f.interaction.value.y) < 1e-7,
            `release at ${clientX},${clientY} left a persistent tilt`);
        assert.equal(f.interaction.shouldActivate({ detail: 1 }), false);
        f.interaction.dispose();
    }
});

test('touch gestures preserve vertical scrolling and permit intentional horizontal inspection', () => {
    const f = fixture();
    f.event('pointerdown', { pointerType: 'touch' });
    f.event('pointermove', { pointerType: 'touch', clientX: 113, clientY: 150 });
    assert.equal(f.interaction.dragging, false);
    assert.equal(f.captures.size, 0);
    assert.equal(f.interaction.shouldActivate({ detail: 1 }), false);
    f.event('pointerdown', { pointerType: 'touch' });
    f.event('pointermove', { pointerType: 'touch', clientX: 170, clientY: 95 });
    assert.equal(f.interaction.dragging, true);
    f.advance(0.2);
    f.event('pointerup', { pointerType: 'touch', clientX: 170, clientY: 95 });
    f.advance(1);
    assert.ok(Math.abs(f.interaction.value.x) < 0.00001);
    f.interaction.dispose();
});

test('pause, reduced motion and cancellation cannot leave a captured or drifting sculpture', () => {
    const f = fixture();
    f.event('pointerdown'); f.event('pointermove', { clientX: 200 }); f.advance(0.2);
    const pose = { ...f.interaction.value };
    f.interaction.cancel(); f.allow(false); f.advance(60);
    assert.deepEqual(f.interaction.value, pose);
    assert.equal(f.captures.size, 0);
    assert.equal(f.interaction.dragging, false);
    f.event('pointermove', { clientX: 0 });
    assert.deepEqual(f.interaction.value, pose);
    f.interaction.reset();
    assert.deepEqual(f.interaction.value, { x: 0, y: 0 });
    f.allow(true); f.advance(1);
    assert.deepEqual(f.interaction.value, { x: 0, y: 0 });
    f.interaction.dispose();
    assert.equal(f.listeners.size, 0);
});

test('a second pointer or a right click cannot seize an existing gesture', () => {
    const f = fixture();
    f.event('pointerdown', { button: 2 }); f.event('pointermove', { clientX: 190 });
    assert.equal(f.interaction.dragging, false);
    f.event('pointerdown');
    f.event('pointerdown', { isPrimary: false, pointerId: 2 });
    // Mouse and pen can each be primary for their own pointer type.
    f.event('pointerdown', { isPrimary: true, pointerType: 'pen', pointerId: 2 });
    f.event('pointermove', { pointerId: 2, clientX: 190 });
    assert.equal(f.interaction.dragging, false);
    f.event('pointermove', { clientX: 190 });
    assert.equal(f.interaction.dragging, true);
    f.event('pointercancel', { pointerId: 2 });
    assert.equal(f.interaction.dragging, true);
    assert.equal(f.captures.size, 1);
    f.event('pointercancel');
    assert.equal(f.captures.size, 0);
    f.interaction.dispose();
});
