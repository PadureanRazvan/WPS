import test from 'node:test';
import assert from 'node:assert/strict';
import { clampBossPosition, createBossPhysics, stepBossSpring } from '../js/sherpa-boss-physics.js';

const bounds = { left: 8, top: 8, right: 1132, bottom: 576 };
const advance = (physics, seconds, fps = 60) => {
    for (let i = 0; i < seconds * fps; i++) physics.step(1 / fps);
};

test('ragdoll spring response is stable across display refresh rates', () => {
    const run = fps => {
        let position = -0.3, velocity = 0.7;
        for (let i = 0; i < fps; i++) [position, velocity] = stepBossSpring(position, velocity, 0.2, 1 / fps);
        return [position, velocity];
    };
    const expected = run(30);
    for (const fps of [60, 120, 144]) {
        run(fps).forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-12));
    }
});

test('a dropped character bounces, settles on the floor, and returns upright', () => {
    const physics = createBossPhysics({ x: 600, y: 30, bounds });
    physics.grab(0); physics.drag(850, 160, 40); physics.release({ time: 41 });
    let bounced = false;
    for (let i = 0; i < 300; i++) {
        physics.step(1 / 60);
        if (physics.state.vy < 0) bounced = true;
        assert.ok(physics.state.x >= bounds.left && physics.state.x <= bounds.right);
        assert.ok(physics.state.y >= bounds.top && physics.state.y <= bounds.bottom);
    }
    assert.ok(bounced);
    assert.equal(physics.state.falling, false);
    assert.equal(physics.state.y, bounds.bottom);
    assert.ok(Math.abs(physics.state.torso) < 0.001);
    assert.ok(Math.abs(physics.state.swing) < 0.002);
});

test('fast drag transfers momentum to torso and loose limbs while staying in the viewport', () => {
    const physics = createBossPhysics({ x: 100, y: 200, bounds });
    physics.grab(0); physics.drag(260, 210, 40); physics.step(1 / 60);
    physics.drag(420, 180, 80); physics.step(1 / 60);
    assert.ok(physics.state.vx > 500);
    assert.ok(Math.abs(physics.state.swing) > 0.01);
    assert.ok(Math.abs(physics.state.torso) > 0.001);
    physics.release({ time: 81 });
    const start = physics.state.x;
    advance(physics, 0.2);
    assert.ok(physics.state.x > start);
    advance(physics, 10);
    assert.ok(physics.state.x >= bounds.left && physics.state.x <= bounds.right);
    assert.equal(physics.state.falling, false);
});

test('holding still before release discards an old fling velocity', () => {
    const physics = createBossPhysics({ x: 100, y: 100, bounds });
    physics.grab(0); physics.drag(500, 150, 50); physics.release({ time: 500 });
    assert.equal(physics.state.vx, 0);
    assert.equal(physics.state.vy, 0);
    advance(physics, 0.2);
    assert.equal(physics.state.x, 500);
});

test('cancelled drag and reduced motion never fling or bounce', () => {
    for (const reducedMotion of [false, true]) {
        const physics = createBossPhysics({ x: 100, y: 100, bounds, reducedMotion });
        physics.grab(0); physics.drag(500, 150, 50);
        if (reducedMotion) {
            advance(physics, .2);
            assert.equal(physics.state.torso, 0);
            assert.equal(physics.state.swing, 0);
            assert.equal(physics.state.legSwing, 0);
        }
        physics.release({ cancel: !reducedMotion, time: 51 });
        advance(physics, 3);
        assert.equal(physics.state.falling, false);
        assert.equal(physics.state.x, 500);
        assert.equal(physics.state.y, 150);
    }
});

test('resizing and keyboard repositioning clamp the complete companion into view', () => {
    const physics = createBossPhysics({ x: 1000, y: 500, bounds });
    physics.setBounds({ left: 8, top: 8, right: 200, bottom: 250 });
    assert.equal(physics.state.x, 200);
    assert.equal(physics.state.y, 250);
    physics.move(-50, -90);
    assert.equal(physics.state.x, 8);
    assert.equal(physics.state.y, 8);
    assert.deepEqual(clampBossPosition(NaN, Infinity, bounds), { x: 8, y: 8 });
});

test('reduced-motion changes stop in-flight motion immediately', () => {
    const physics = createBossPhysics({ x: 100, y: 100, bounds });
    physics.grab(0); physics.drag(500, 150, 50); physics.release({ time: 51 });
    advance(physics, 0.2);
    physics.setReducedMotion(true);
    const { x, y } = physics.state;
    advance(physics, 3);
    assert.equal(physics.state.x, x);
    assert.equal(physics.state.y, y);
    assert.equal(physics.state.swing, 0);
    assert.equal(physics.state.torso, 0);
});
