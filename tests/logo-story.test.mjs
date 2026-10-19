import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LOGO_STORY, LOGO_SHAPE_NAMES, LOGO_STORY_DURATION, HOLD_DURATIONS,
    getStoryMotion, getStoryVelocity, nearestStoryAngle, blendStoryPose,
    getStoryChapterAt, getGlobeOrbitState, getGlobeSpinState, getInfinityFlowState,
    getHeartSignalState, getStoryBeat, writeStoryParticle
} from '../js/logo-story.js';
import { getSummitAscentState, getSummitRoutePoint } from '../js/logo-summit-surface.js';
import { createLogoShape, matchLogoShape } from '../js/logo-shapes.js';

test('the story completes every chapter once and returns to its readable identity', () => {
    assert.deepEqual(LOGO_SHAPE_NAMES, ['fsp', 'heart', 'summit', 'globe', 'infinity']);
    let at = 0;
    for (const [index, chapter] of LOGO_STORY.entries()) {
        const beginning = getStoryChapterAt(at);
        assert.equal(beginning.name, chapter.name);
        assert.equal(beginning.age, 0);
        assert.equal(beginning.transition, null);
        const middle = getStoryChapterAt(at + chapter.hold + chapter.duration / 2);
        assert.equal(middle.transition, LOGO_SHAPE_NAMES[(index + 1) % LOGO_STORY.length]);
        assert.equal(middle.progress, 0.5);
        at += chapter.hold + chapter.duration;
    }
    assert.equal(at, LOGO_STORY_DURATION);
    assert.deepEqual(getStoryChapterAt(at), getStoryChapterAt(0));
    assert.ok(at >= 65000 && at <= 75000, 'daily rhythm should leave breathing room');
});

test('brand lettering remains readable throughout its arc, while the world makes a full turn', () => {
    let minimum = Infinity, maximum = -Infinity, lastYaw = -Infinity;
    for (let age = 0; age < HOLD_DURATIONS.fsp; age += 10) {
        const yaw = getStoryMotion('fsp', age).rotation[1];
        assert.ok(Math.abs(yaw) < 0.4, 'identity must not display reversed lettering');
    }
    for (let age = 0; age < HOLD_DURATIONS.globe; age += 10) {
        const yaw = getGlobeSpinState(age).angle;
        assert.ok(yaw >= lastYaw - 1e-10, 'world turn must never reverse');
        minimum = Math.min(minimum, yaw); maximum = Math.max(maximum, yaw); lastYaw = yaw;
    }
    assert.ok(Math.abs(maximum - minimum - Math.PI * 2) < 1e-8);
});

test('every natural pose is continuous and has bounded speed across its repeat seam', () => {
    for (const { name, hold } of LOGO_STORY) {
        let before = getStoryMotion(name, -1).rotation;
        for (let age = 0; age <= hold + 1; age += 5) {
            const after = getStoryMotion(name, age).rotation;
            for (let axis = 0; axis < 3; axis++) {
                const travel = nearestStoryAngle(before[axis], after[axis]) - before[axis];
                assert.ok(Number.isFinite(travel) && Math.abs(travel) < 0.006, `${name} has a pose jump at ${age}`);
            }
            before = after;
        }
        const startSpeed = getStoryVelocity(name, 0), endSpeed = getStoryVelocity(name, hold);
        assert.ok(startSpeed.every((value, axis) => Math.abs(value - endSpeed[axis]) < 1e-8));
    }
});

test('heart, mountain and ribbon retain visible depth without turning their backs', () => {
    for (const name of ['heart', 'summit', 'infinity']) {
        for (let age = 0; age < HOLD_DURATIONS[name]; age += 37) {
            const [pitch, yaw, roll] = getStoryMotion(name, age).rotation;
            assert.ok(pitch > 0.04 && pitch < 0.2);
            assert.ok(yaw >= 0 && yaw < 0.5);
            assert.ok(Math.abs(roll) < 0.04);
        }
    }
});

test('pose handoffs retain position and velocity at both ends, including reversed manual starts', () => {
    const dt = 0.00001;
    for (const [index, item] of LOGO_STORY.entries()) for (const age of [0, item.hold * 0.23, item.hold * 0.51, item.hold - 1]) {
        const next = LOGO_SHAPE_NAMES[(index + 1) % LOGO_STORY.length];
        const from = getStoryMotion(item.name, age).rotation;
        const to = getStoryMotion(next, 0).rotation;
        const v0 = getStoryVelocity(item.name, age), v1 = getStoryVelocity(next, 0);
        const sample = t => blendStoryPose(from, to, v0, v1, t, item.duration);
        assert.deepEqual(sample(0), from);
        assert.ok(sample(1).every((value, axis) => Math.abs(value - nearestStoryAngle(from[axis], to[axis])) < 1e-10));
        const a = sample(0), b = sample(dt), c = sample(1 - dt), d = sample(1);
        const seconds = dt * item.duration / 1000;
        for (let axis = 0; axis < 3; axis++) {
            assert.ok(Math.abs((b[axis] - a[axis]) / seconds - v0[axis]) < 0.001);
            assert.ok(Math.abs((d[axis] - c[axis]) / seconds - v1[axis]) < 0.001);
        }
    }
});

test('each chapter completes its detail action and rests before departure', () => {
    const summit = getSummitAscentState(7600);
    assert.equal(summit.progress, 1);
    assert.equal(summit.strength, 1);
    assert.ok(getSummitRoutePoint(summit.progress)[1] > 1.05);
    assert.equal(getSummitAscentState(HOLD_DURATIONS.summit - 200).strength, 0);
    assert.equal(getGlobeOrbitState(13000).progress, 1);
    assert.equal(getInfinityFlowState(9300).progress, 1);
    assert.equal(getInfinityFlowState(HOLD_DURATIONS.infinity - 200).strength, 0);
    assert.equal(getStoryBeat(0), 0);
    assert.equal(getStoryBeat(HOLD_DURATIONS.heart - 200), 0);
    assert.equal(getHeartSignalState(HOLD_DURATIONS.heart - 200).strength, 0);
});

test('reduced motion keeps every sculpture still, dimensional and free of travelling light', () => {
    for (const { name, hold } of LOGO_STORY) {
        const first = getStoryMotion(name, 0, true);
        for (const age of [1, hold / 2, hold - 1]) {
            const later = getStoryMotion(name, age, true);
            assert.deepEqual(later.rotation, first.rotation);
            assert.equal(later.beat, 0); assert.equal(later.lift, 0);
        }
    }
    assert.equal(getHeartSignalState(1400, true).strength, 0);
    assert.equal(getInfinityFlowState(4000, true).strength, 0);
    assert.equal(getGlobeOrbitState(4000, true).angle, getGlobeOrbitState(0, true).angle);
    assert.deepEqual(getSummitAscentState(4000, true), { progress: 1, strength: 1 });
});

test('choreographed particles join exact surfaces with no explosion or endpoint twitch', () => {
    const out = [0, 0, 0], before = [0, 0, 0];
    for (const [index, chapter] of LOGO_STORY.entries()) {
        const source = createLogoShape(chapter.name, 192, 809);
        const target = matchLogoShape(source, createLogoShape(LOGO_SHAPE_NAMES[(index + 1) % LOGO_STORY.length], 192, 809));
        for (let point = 0; point < source.count; point++) {
            const from = Array.from(source.positions.subarray(point * 3, point * 3 + 3));
            const to = Array.from(target.positions.subarray(point * 3, point * 3 + 3));
            const seed = point / source.count;
            writeStoryParticle(out, from, to, seed, 0, chapter.transition);
            assert.deepEqual(out, from);
            writeStoryParticle(out, from, to, seed, 1, chapter.transition);
            assert.ok(out.every((value, axis) => Math.abs(value - to[axis]) < 1e-10));
            for (let sample = 0; sample <= 30; sample++) {
                writeStoryParticle(out, from, to, seed, sample / 30, chapter.transition);
                assert.ok(out.every(Number.isFinite));
                assert.ok(Math.hypot(...out) < Math.max(Math.hypot(...from), Math.hypot(...to)) + 0.23);
            }
            writeStoryParticle(out, from, to, seed, 0.0001, chapter.transition);
            assert.ok(out.every((value, axis) => Math.abs(value - from[axis]) < 1e-8));
            writeStoryParticle(before, from, to, seed, 0.9999, chapter.transition);
            assert.ok(before.every((value, axis) => Math.abs(value - to[axis]) < 1e-8));
        }
    }
});
