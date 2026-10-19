import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimationScheduler } from '../js/animation-scheduler.js';

function fixture() {
    let active = true, animated = true, nextId = 1;
    const queued = new Map(), frames = [];
    const scheduler = createAnimationScheduler({
        isActive: () => active, isAnimated: () => animated,
        onFrame: (time, dt) => frames.push({ time, dt }),
        requestFrame: callback => { const id = nextId++; queued.set(id, callback); return id; },
        cancelFrame: id => queued.delete(id)
    });
    return {
        scheduler, queued, frames,
        setActive(value) { active = value; scheduler.resetClock(); },
        setAnimated(value) { animated = value; scheduler.resetClock(); },
        step(time) { const batch = [...queued.values()]; queued.clear(); batch.forEach(callback => callback(time)); }
    };
}

test('animated decoration advances once per requested frame', () => {
    const f = fixture();
    f.scheduler.invalidate();
    f.scheduler.invalidate();
    assert.equal(f.queued.size, 1);
    f.step(0); f.step(16);
    assert.deepEqual(f.frames.map(frame => frame.dt), [0, 0.016]);
    assert.equal(f.queued.size, 1);
});

test('paused and reduced-motion decorations leave no frame callbacks pending', () => {
    const f = fixture();
    f.scheduler.invalidate(); f.step(0);
    f.setAnimated(false);
    assert.equal(f.queued.size, 0);
    assert.equal(f.scheduler.getDiagnostics().scheduled, false);
    f.step(10000);
    assert.equal(f.frames.length, 1);
});

test('resizing a paused figure paints exactly one static frame', () => {
    const f = fixture();
    f.setAnimated(false);
    f.step(0);
    f.scheduler.invalidate();
    f.scheduler.invalidate();
    f.step(1000);
    assert.deepEqual(f.frames.map(frame => frame.dt), [0, 0]);
    assert.equal(f.queued.size, 0);
});

test('hidden figures freeze their clock and resume without catching up', () => {
    const f = fixture();
    f.scheduler.invalidate(); f.step(0); f.step(16);
    f.setActive(false); f.scheduler.invalidate();
    assert.equal(f.queued.size, 0);
    f.setActive(true); f.step(600000); f.step(600016);
    assert.deepEqual(f.frames.map(frame => frame.dt), [0, 0.016, 0, 0.016]);
});

test('resuming from pause preserves the exact first frame pose', () => {
    const f = fixture();
    f.scheduler.invalidate(); f.step(10); f.step(26);
    f.setAnimated(false); f.setAnimated(true); f.step(50000);
    assert.equal(f.frames.at(-1).dt, 0);
});

test('a visibility change before an already queued callback prevents rendering', () => {
    const f = fixture();
    f.scheduler.invalidate();
    const pending = [...f.queued.values()][0];
    f.setActive(false); pending(1000);
    assert.equal(f.frames.length, 0);
    assert.equal(f.queued.size, 0);
});

test('disposing cannot be undone by a late resize or frame callback', () => {
    const f = fixture();
    f.scheduler.invalidate();
    const pending = [...f.queued.values()][0];
    f.scheduler.dispose(); f.scheduler.invalidate(); pending(1000);
    assert.equal(f.frames.length, 0);
    assert.equal(f.queued.size, 0);
});
