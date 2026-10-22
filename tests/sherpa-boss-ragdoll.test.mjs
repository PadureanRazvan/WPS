import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_BONES, bossRestPoints, createBossRagdoll, pickBossBone } from '../js/sherpa-boss-ragdoll.js';

const bounds = { left: 7, top: 7, right: 793, bottom: 570 };
const seed = () => bossRestPoints({ x: 400, y: 300, scale: 50 });
const make = () => createBossRagdoll({ points: seed(), scale: 50, bounds });
const advance = (body, duration, fps = 60) => { for (let n = 0; n < Math.ceil(duration * fps); n++) body.step(1 / fps); };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('hand, foot, head and torso grips keep the body supported upright while held', () => {
    for (const part of ['leftHand', 'rightFoot', 'head', 'torso']) {
        const body = make(), [a, b] = BOSS_BONES[part], point = seed()[b];
        body.grab({ part, t: 1, ...point, time: 0 });
        body.drag(420, 280, 20); advance(body, 1.5);
        assert.equal(body.state.part, part);
        assert.ok(distance(body.state.points[b], { x: 420, y: 280 }) < 5, `${part} remains at its grip`);
        assert.ok(distance(body.state.points[a], body.state.points[b]) > 10, 'bone cannot collapse');
        {
            const p = body.state.points;
            assert.ok(p.head.y < p.hip.y, `${part} keeps the head above the torso`);
            const tx = p.neck.x - p.hip.x, ty = p.neck.y - p.hip.y;
            assert.ok(Math.abs(Math.atan2(tx, -ty)) < .35, `${part} stays mostly upright`);
            const hx = p.head.x - p.headBase.x, hy = p.head.y - p.headBase.y;
            const angle = Math.atan2(tx * hy - ty * hx, tx * hx + ty * hy);
            assert.ok(Math.abs(angle) < .85, 'neck must not fold through the collar');
        }
        if (part === 'leftHand') assert.ok(body.state.points.hip.y > body.state.points.leftWrist.y, 'weight hangs below the hand');
    }
});

test('shaking requires quick reversals, creates discomfort and then recovers', () => {
    const body = make(); body.grab({ part: 'head', t: 1, ...seed().head, time: 0 });
    for (let n = 1; n <= 4; n++) { body.drag(400 + n * 25, 220, n * 40); advance(body, .04); }
    assert.equal(body.state.discomfort, 0, 'one continuous movement is not shaking');
    for (let n = 5; n <= 12; n++) { body.drag(n % 2 ? 450 : 350, 220, n * 40); advance(body, .04); }
    assert.ok(body.state.discomfort > .6);
    advance(body, 3);
    assert.ok(body.state.discomfort < .05, 'uncomfortable expression fades when shaking stops');
});

test('all four viewport edges report an impact during a held drag', () => {
    for (const [side, x, y] of [['left', -80, 240], ['right', 880, 240], ['top', 400, -80], ['bottom', 400, 680]]) {
        const body = make(); body.grab({ part: 'head', t: 1, ...seed().head, time: 0 });
        body.drag(x, y, 40); advance(body, .2);
        assert.ok(body.state.impactCount > 0, `${side} contact must be visible`);
        assert.equal(body.state.impactSide, side);
        for (const p of Object.values(body.state.points)) {
            assert.ok(p.x >= bounds.left + p.radius - .1 && p.x <= bounds.right - p.radius + .1, `${side} horizontal containment`);
            assert.ok(p.y >= bounds.top + p.radius - .1 && p.y <= bounds.bottom - p.radius + .1, `${side} vertical containment`);
        }
    }
});

test('a throw bends limbs, hits the floor, then gets back up without endless simulation', () => {
    const body = make(); const p = seed().leftWrist;
    body.grab({ part: 'leftHand', t: 1, ...p, time: 0 });
    body.drag(520, 170, 40); advance(body, .06); body.release({ time: 41 });
    let floor = false, recovering = false, bent = false;
    for (let n = 0; n < 500; n++) {
        body.step(1 / 60);
        floor ||= body.state.impactSide === 'bottom'; recovering ||= body.state.recovering;
        const p = body.state.points;
        bent ||= Math.abs(p.leftElbow.x - (p.leftShoulder.x + p.leftWrist.x) / 2) > 8;
        for (const point of Object.values(p)) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
    assert.ok(floor && recovering && bent);
    assert.equal(body.state.done, true);
    assert.equal(body.state.falling, false);
    assert.ok(body.state.points.head.y < body.state.points.hip.y);
});

test('cancel stops the throw, and holding still drops old pointer momentum', () => {
    const body = make(); body.grab({ part: 'head', t: 1, ...seed().head });
    body.drag(650, 150, 40); advance(body, .1); body.release({ cancel: true, time: 41 });
    assert.equal(body.state.done, true); assert.equal(body.state.falling, false);
    const snapshot = JSON.stringify(body.state.points); advance(body, 2);
    assert.equal(JSON.stringify(body.state.points), snapshot);
});

test('a fixed solver clock gives the same free fall at 30, 60 and 120Hz', () => {
    const run = fps => { const b = make(); b.grab({ part: 'head', t: 1, ...seed().head }); b.release({ time: 500 }); advance(b, .5, fps); return b.state.points; };
    const baseline = run(30);
    for (const fps of [60, 120]) for (const [name, point] of Object.entries(run(fps))) assert.ok(distance(point, baseline[name]) < .001);
});

test('hit regions distinguish face, arms and legs', () => {
    const p = seed();
    assert.equal(pickBossBone(p, p.head.x, p.head.y, 50).part, 'head');
    assert.equal(pickBossBone(p, p.leftWrist.x - 2, p.leftWrist.y - 8, 50).part, 'leftForearm');
    assert.equal(pickBossBone(p, p.rightAnkle.x, p.rightAnkle.y - 8, 50).part, 'rightShin');
});
