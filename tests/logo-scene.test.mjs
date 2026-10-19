import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.min.js';
import { sculptureFixture } from './helpers/sculpture-scene.mjs';
import { LOGO_STORY, LOGO_SHAPE_NAMES, LOGO_STORY_DURATION, getStoryChapterAt, getStoryMotion, getStoryVelocity, blendStoryPose } from '../js/logo-story.js';

test('the first FSP frame is published before compiling later story figures', async t => {
    const premature = [];
    const f = await sculptureFixture(t, { onCompile({ scene, control }) {
        if (control.dataset.logoRenderer === 'three') return;
        scene.traverseVisible(object => {
            if (object.name === 'enamel-ocean') premature.push(object.name);
        });
    } });
    assert.deepEqual(premature, [], 'hidden globe preparation must not gate the first visible FSP frame');
    assert.equal(f.control.dataset.logoRenderer, 'three');
    const before = f.controller.getDiagnostics().rotation;
    f.advance(500);
    assert.notDeepEqual(f.controller.getDiagnostics().rotation, before);
});

test('FSP keeps moving and rapid activation waits for a slow next figure without skipping chapters', { timeout: 5000 }, async t => {
    const started = Promise.withResolvers(), release = Promise.withResolvers();
    let delayed = false, visibleEffects = false;
    const f = await sculptureFixture(t, { autoCycle: false, waitForPreparation: false, async onCompile({ scene, control }) {
        if (control.dataset.logoRenderer !== 'three') return;
        visibleEffects = scene.children.some(object => object.isPoints && object.visible);
        if (!delayed) { delayed = true; started.resolve(); await release.promise; }
    } });
    await started.promise;
    t.after(() => release.resolve());
    assert.ok(visibleEffects, 'handoff particles must receive a real warm render');
    const before = f.controller.getDiagnostics().rotation;
    for (let click = 0; click < 12; click++) f.control.emit('click');
    f.advance(700);
    assert.equal(f.controller.getDiagnostics().shape, 'fsp');
    assert.equal(f.controller.getDiagnostics().pendingAdvance, true);
    assert.notDeepEqual(f.controller.getDiagnostics().rotation, before);
    release.resolve();
    await f.controller.prepared;
    assert.equal(f.controller.getDiagnostics().transition.target, 'heart');
    f.advance(1450);
    assert.equal(f.controller.getDiagnostics().shape, 'heart');
    f.advance(2000);
    assert.equal(f.controller.getDiagnostics().shape, 'summit');
    assert.equal(f.controller.getDiagnostics().queuedAdvance, false);
});

test('background preparation sleeps when hidden or paused and resumes without a canvas size or pose jump', async t => {
    const started = Promise.withResolvers(), release = Promise.withResolvers();
    let delayed = false;
    const f = await sculptureFixture(t, { waitForPreparation: false, async onCompile({ control }) {
        if (control.dataset.logoRenderer === 'three' && !delayed) {
            delayed = true; started.resolve(); await release.promise;
        }
    } });
    await started.promise;
    f.advance(800);
    f.control.emit('click');
    f.controller.pause(); f.hidden(true);
    const frame = f.renderer.info.render.frame, pose = f.controller.getDiagnostics().rotation;
    release.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.renderer.info.render.frame, frame);
    assert.equal(f.controller.getDiagnostics().pendingAdvance, false);
    assert.equal(f.frames.size, 0);
    f.hidden(false); f.tick(0);
    assert.deepEqual(f.controller.getDiagnostics().rotation, pose);
    f.controller.resume(); f.tick(0);
    const dimensions = f.renderer.size.toArray();
    await f.controller.prepared;
    assert.deepEqual(f.renderer.size.toArray(), dimensions);
    assert.deepEqual(f.controller.getDiagnostics().rotation, pose);
    assert.equal(f.controller.getDiagnostics().shape, 'fsp');
});

test('disposal during background compilation cannot render or schedule another figure', async t => {
    const started = Promise.withResolvers(), release = Promise.withResolvers();
    const f = await sculptureFixture(t, { waitForPreparation: false, async onCompile({ control }) {
        if (control.dataset.logoRenderer === 'three') { started.resolve(); await release.promise; }
    } });
    await started.promise;
    f.controller.dispose();
    const frame = f.renderer.info.render.frame;
    release.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await f.controller.prepared, false);
    assert.equal(f.renderer.info.render.frame, frame);
    assert.equal(f.frames.size, 0);
    assert.equal(f.renderer.disposals, 1);
});

test('a context recovery ignores an old background compilation and prepares fresh figures', async t => {
    const started = Promise.withResolvers(), release = Promise.withResolvers();
    let staleScene = null;
    const f = await sculptureFixture(t, { waitForPreparation: false, async onCompile({ scene, control }) {
        if (control.dataset.logoRenderer === 'three' && !staleScene) {
            staleScene = scene; started.resolve(); await release.promise;
        }
    } });
    await started.promise;
    let staleRenders = 0;
    const render = f.renderer.render.bind(f.renderer);
    f.renderer.render = (scene, camera) => { if (scene === staleScene) staleRenders++; render(scene, camera); };
    f.canvas.emit('webglcontextlost');
    f.canvas.emit('webglcontextrestored'); f.tick(0);
    release.resolve();
    assert.equal(await f.controller.prepared, true);
    assert.equal(staleRenders, 0);
    assert.equal(f.control.dataset.logoRenderer, 'three');
    assert.deepEqual(f.controller.getDiagnostics().preparedFigures.sort(), [...LOGO_SHAPE_NAMES].sort());
    assert.equal(f.renderer.scene.children.filter(child => child.isLight).length, 4);
});

test('a rejected optional warm-up falls back to normal rendering instead of trapping an early click', async t => {
    t.mock.method(console, 'warn', () => {});
    let rejected = false;
    const f = await sculptureFixture(t, { autoCycle: false, waitForPreparation: false, onCompile({ control }) {
        if (control.dataset.logoRenderer === 'three' && !rejected) { rejected = true; throw new Error('Optional warm-up unavailable'); }
    } });
    f.control.emit('click');
    assert.equal(await f.controller.prepared, false);
    assert.equal(f.controller.getDiagnostics().pendingAdvance, false);
    assert.equal(f.controller.getDiagnostics().transition?.target, 'heart');
    f.advance(1450);
    assert.equal(f.controller.getDiagnostics().shape, 'heart');
});

test('actual controller plays every complete chapter in narrative order at 30 and 144 Hz', async t => {
    const f = await sculptureFixture(t);
    for (const fps of [30, 144]) {
        f.controller.setInspectionTime(0); f.tick(0); f.controller.resume(); f.tick(0);
        let at = 0;
        for (const [index, chapter] of LOGO_STORY.entries()) {
            assert.equal(f.controller.getDiagnostics().shape, chapter.name);
            f.advance(chapter.hold + chapter.duration / 2, fps);
            const middle = f.controller.getDiagnostics();
            assert.equal(middle.transition?.target, LOGO_SHAPE_NAMES[(index + 1) % LOGO_STORY.length]);
            assert.ok(Math.abs(middle.transition.progress - 0.5) < 0.02);
            f.advance(chapter.duration / 2 + 1, fps);
            at += chapter.hold + chapter.duration + 1;
            assert.equal(f.controller.getDiagnostics().shape, getStoryChapterAt(at).name);
        }
        assert.equal(f.controller.getDiagnostics().shape, 'fsp');
    }
});

test('automatic handoffs cross the exact chapter boundary without a held frame', async t => {
    const f = await sculptureFixture(t);
    for (const fps of [30, 144]) {
        let start = 0;
        for (const [index, chapter] of LOGO_STORY.entries()) {
            f.controller.setInspectionTime(start); f.tick(0); f.controller.resume(); f.tick(0);
            f.advance(chapter.hold - 23, fps); f.tick(47);
            const next = LOGO_SHAPE_NAMES[(index + 1) % LOGO_STORY.length];
            const expected = blendStoryPose(getStoryMotion(chapter.name, chapter.hold).rotation, getStoryMotion(next, 0).rotation,
                getStoryVelocity(chapter.name, chapter.hold), getStoryVelocity(next, 0), 24 / chapter.duration, chapter.duration);
            const actual = f.controller.getDiagnostics();
            assert.ok(Math.abs(actual.transition.progress - 24 / chapter.duration) < 1e-9);
            actual.rotation.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 1e-9,
                `${chapter.name}, ${fps} Hz, axis ${axis}: ${value} instead of ${expected[axis]}`));
            start += chapter.hold + chapter.duration;
        }
    }
});

test('pause and resume preserve exact pose, particles and chapter clock through a handoff', async t => {
    const f = await sculptureFixture(t);
    f.advance(15700); f.controller.pause();
    const before = f.controller.getDiagnostics(), matrix = f.root().matrix.toArray();
    assert.ok(before.transitioning);
    assert.equal(f.frames.size, 0);
    f.advance(60000);
    assert.deepEqual(f.root().matrix.toArray(), matrix);
    assert.equal(f.controller.getDiagnostics().timelineMs, before.timelineMs);
    f.controller.resume(); f.tick(60000);
    assert.deepEqual(f.root().matrix.toArray(), matrix);
    f.advance(2000);
    assert.equal(f.controller.getDiagnostics().shape, 'heart');
});

test('reduced motion stays static, selection remains useful, and preference changes clear pending motion', async t => {
    const f = await sculptureFixture(t, { reduced: true });
    assert.equal(f.frames.size, 0);
    f.control.emit('click', { detail: 0 }); f.tick(0);
    assert.equal(f.controller.getDiagnostics().shape, 'heart');
    assert.equal(f.controller.getDiagnostics().transitioning, false);
    const matrix = f.root().matrix.toArray(); f.advance(120000);
    assert.deepEqual(f.root().matrix.toArray(), matrix);
    f.reduced(false); f.tick(0); f.control.emit('click'); f.advance(400);
    f.control.emit('click');
    assert.equal(f.controller.getDiagnostics().queuedAdvance, true);
    f.reduced(true); f.tick(0);
    assert.equal(f.controller.getDiagnostics().shape, 'fsp');
    assert.equal(f.controller.getDiagnostics().queuedAdvance, false);
    assert.equal(f.frames.size, 0);
});

test('rapid activation accepts only one follow-up and lets the arriving figure settle', async t => {
    const f = await sculptureFixture(t, { autoCycle: false });
    for (let click = 0; click < 12; click++) f.control.emit('click');
    assert.equal(f.controller.getDiagnostics().transition?.target, 'heart');
    f.advance(1450);
    assert.equal(f.controller.getDiagnostics().shape, 'heart');
    assert.equal(f.controller.getDiagnostics().transitioning, false);
    f.advance(2000);
    assert.equal(f.controller.getDiagnostics().shape, 'summit');
    assert.equal(f.controller.getDiagnostics().transitioning, false);
    assert.equal(f.controller.getDiagnostics().queuedAdvance, false);
});

test('hidden and offscreen scenes sleep and resume without skipping story time', async t => {
    const f = await sculptureFixture(t);
    f.advance(2000);
    const time = f.controller.getDiagnostics().timelineMs;
    f.hidden(true); assert.equal(f.frames.size, 0); f.advance(600000);
    f.hidden(false); f.tick(1000);
    assert.equal(f.controller.getDiagnostics().timelineMs, time);
    f.visible(false); assert.equal(f.frames.size, 0); f.advance(600000);
    f.visible(true); f.tick(1000);
    assert.equal(f.controller.getDiagnostics().timelineMs, time);
});

test('dragging holds the chapter, preserves tap activation and releases cleanly when paused', async t => {
    const f = await sculptureFixture(t);
    f.advance(1200);
    const time = f.controller.getDiagnostics().timelineMs;
    f.control.emit('pointerdown'); f.control.emit('pointermove', { clientX: 190 });
    f.advance(3000);
    assert.equal(f.controller.getDiagnostics().timelineMs, time);
    assert.ok(f.controller.getDiagnostics().interaction.tilt[0] > 0.25);
    f.control.emit('pointerup', { clientX: 190 }); f.control.emit('click');
    assert.equal(f.controller.getDiagnostics().transitioning, false);
    f.control.emit('pointerdown'); f.control.emit('pointerup'); f.control.emit('click');
    assert.equal(f.controller.getDiagnostics().transitioning, true);
    f.control.emit('pointerdown'); f.control.emit('pointermove', { clientX: 30 });
    f.controller.pause();
    assert.equal(f.control.captures.size, 0);
    f.tick(0); // Finish any static invalidation from the just-activated morph.
    assert.equal(f.frames.size, 0);
});

test('context restoration preserves a paused selection and rebuilding does not leak scene lights', async t => {
    const f = await sculptureFixture(t);
    f.controller.setInspectionTime(31000); f.tick(0);
    const before = f.controller.getDiagnostics(), matrix = f.root().matrix.toArray();
    const lights = () => f.renderer.scene.children.filter(child => child.isLight).length;
    const count = lights();
    for (let attempt = 0; attempt < 3; attempt++) {
        f.canvas.emit('webglcontextlost'); assert.equal(f.frames.size, 0);
        assert.equal(f.control.dataset.logoRenderer, 'context-lost');
        f.canvas.emit('webglcontextrestored'); f.tick(0);
        assert.equal(f.controller.getDiagnostics().shape, before.shape);
        assert.deepEqual(f.root().matrix.toArray(), matrix);
        assert.equal(lights(), count);
        assert.equal(f.control.dataset.logoRenderer, 'three');
        assert.equal(f.frames.size, 0);
    }
});

test('releasing an inspected sculpture eases its natural motion back in', async t => {
    const f = await sculptureFixture(t);
    f.advance(1000);
    f.control.emit('pointerdown'); f.control.emit('pointermove', { clientX: 190 }); f.advance(500);
    const held = f.controller.getDiagnostics().timelineMs;
    assert.equal(f.controller.getDiagnostics().playbackRate, 0);
    f.control.emit('pointerup', { clientX: 190 }); f.control.emit('click');
    f.tick(1000 / 60);
    const first = f.controller.getDiagnostics();
    assert.ok(first.timelineMs > held && first.timelineMs - held < 2);
    assert.ok(first.playbackRate > 0.1 && first.playbackRate < 0.2);
    f.advance(1000);
    assert.ok(f.controller.getDiagnostics().playbackRate > 0.999);
    assert.equal(f.controller.getDiagnostics().shape, 'fsp');
});

test('resizing a paused sculpture updates density once without moving the shape', async t => {
    const f = await sculptureFixture(t);
    f.advance(2000); f.controller.pause();
    const before = f.controller.getDiagnostics().rotation;
    const frame = f.renderer.info.render.frame;
    f.resize(180, 151, 2);
    assert.equal(f.renderer.info.render.frame, frame + 1, 'the resized buffer must be filled before the next paint');
    f.tick(0);
    assert.deepEqual(f.renderer.size.toArray(), [180, 151]);
    assert.equal(f.renderer.pixelRatio, 2);
    assert.deepEqual(f.controller.getDiagnostics().rotation, before);
    assert.equal(f.renderer.info.render.frame, frame + 1);
    assert.equal(f.frames.size, 0);
});

test('switching between full and compact identity preserves a handoff in both directions', async t => {
    const f = await sculptureFixture(t);
    f.controller.setInspectionTime(15800); f.tick(0);
    const departure = f.controller.getDiagnostics().transition;
    f.control.sidebar = { classList: { contains: () => true } };
    f.resize(44, 44);
    assert.equal(f.control.dataset.logoVariant, 'compact');
    assert.deepEqual(f.controller.getDiagnostics().transition, departure);
    assert.equal(f.controller.getDiagnostics().shape, 'fsp');
    assert.equal(f.frames.size, 0);
    f.controller.resume(); f.tick(0); f.advance(1300);
    assert.equal(f.controller.getDiagnostics().shape, 'heart');
    f.controller.setInspectionTime(68600); f.tick(0);
    const arrival = f.controller.getDiagnostics().transition;
    assert.equal(arrival.target, 'fsp');
    f.control.sidebar = null; f.resize(220, 185);
    assert.equal(f.control.dataset.logoVariant, 'full');
    assert.equal(f.controller.getDiagnostics().shape, 'infinity');
    assert.deepEqual(f.controller.getDiagnostics().transition, arrival);
    assert.equal(f.frames.size, 0);
});

test('changing automatic cycling preserves the current angle and remaining chapter time', async t => {
    const f = await sculptureFixture(t, { autoCycle: false });
    f.advance(LOGO_STORY_DURATION + 5000);
    const before = f.controller.getDiagnostics().rotation;
    f.controller.setAutoCycle(true); f.tick(0);
    assert.deepEqual(f.controller.getDiagnostics().rotation, before);
    assert.equal(f.controller.getDiagnostics().transitioning, false);
    f.advance(15000);
    assert.notEqual(f.controller.getDiagnostics().shape, 'fsp');
});

test('a manual departure carries particles from the Earth orientation actually on screen', async t => {
    const f = await sculptureFixture(t);
    const globeStart = LOGO_STORY.slice(0, 3).reduce((sum, chapter) => sum + chapter.hold + chapter.duration, 0);
    f.controller.setInspectionTime(globeStart + 7000); f.tick(0);
    const earth = f.renderer.scene.getObjectByName('rotating-earth');
    assert.ok(Math.abs(earth.rotation.y - Math.PI) < 1e-9);
    const points = f.root().children.find(child => child.isPoints);
    const source = points.geometry.attributes.position.array.slice();
    const rotation = new THREE.Matrix4().makeRotationY(earth.rotation.y), expected = new THREE.Vector3();
    f.controller.resume(); f.tick(0); f.control.emit('click'); f.tick(0);
    assert.equal(f.controller.getDiagnostics().transition.target, 'infinity');
    const actual = points.geometry.attributes.position.array;
    for (let index = 0; index < source.length; index += 3) {
        expected.fromArray(source, index);
        if (expected.length() < 1.15) expected.applyMatrix4(rotation);
        assert.ok(expected.distanceTo(new THREE.Vector3().fromArray(actual, index)) < 1e-6);
    }
});

test('held pause keys do not toggle repeatedly and inspection seeks are repeatable', async t => {
    const f = await sculptureFixture(t);
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'defaultPrevented']) {
        const event = f.control.emit('keydown', { key: 'p', [modifier]: true });
        assert.equal(f.controller.getDiagnostics().paused, false, `${modifier} must not trigger the sculpture shortcut`);
        if (modifier !== 'defaultPrevented') assert.equal(event.defaultPrevented, false);
    }
    f.control.emit('keydown', { key: 'p' }); f.tick(0);
    assert.equal(f.controller.getDiagnostics().paused, true);
    for (let index = 0; index < 20; index++) f.control.emit('keydown', { key: 'p', repeat: true });
    assert.equal(f.controller.getDiagnostics().paused, true);
    f.controller.setInspectionTime(38450); f.tick(0);
    const first = f.root().matrix.toArray();
    f.controller.setInspectionTime(25000); f.tick(0);
    f.controller.setInspectionTime(38450); f.tick(0);
    assert.deepEqual(f.root().matrix.toArray(), first);
    assert.equal(f.frames.size, 0);
});

test('daylight themes preserve a colored particle midpoint instead of adding it into white', async t => {
    const f = await sculptureFixture(t);
    f.controller.setInspectionTime(15950); f.tick(0);
    const points = f.root().children.find(child => child.isPoints);
    const lines = f.root().children.find(child => child.isLineSegments);
    const pose = f.controller.getDiagnostics().rotation;
    assert.equal(points.visible, true);
    assert.equal(points.material.uniforms.uOpacity.value, 1);
    for (const theme of ['light', 'fsp', 'coral', 'aurora', 'dark']) {
        f.document.documentElement.setAttribute('data-theme', theme);
        f.window.emit('sherpa-theme-changed'); f.tick(0);
        const expected = ['dark', 'aurora'].includes(theme) ? THREE.AdditiveBlending : THREE.NormalBlending;
        assert.equal(points.material.blending, expected);
        assert.equal(lines.material.blending, expected);
        assert.deepEqual(f.controller.getDiagnostics().rotation, pose);
        assert.equal(f.frames.size, 0);
    }
});

test('disposal removes every scene listener, observer and pending frame', async t => {
    const f = await sculptureFixture(t);
    f.controller.dispose();
    assert.equal(f.frames.size, 0);
    assert.equal(f.control.listenerCount(), 0);
    assert.equal(f.document.listenerCount(), 0);
    assert.equal(f.window.listenerCount(), 0);
    assert.equal(f.canvas.listenerCount(), 0);
    assert.ok(Object.values(f.observers).flat().every(observer => observer.disconnected));
    assert.equal(f.renderer.disposals, 1);
    f.controller.dispose(); f.controller.resume(); f.controller.next();
    f.resize(200, 180); f.tick(1000);
    assert.equal(f.renderer.disposals, 1);
    assert.equal(f.frames.size, 0);
});

test('frame export reads a rendered buffer after visibility resumes and cleans up canceled requests', async t => {
    const f = await sculptureFixture(t);
    f.controller.setInspectionTime(15950); f.tick(0); f.visible(false);
    let captures = 0, encodedAtFrame = -1;
    const blob = { type: 'image/png' };
    f.canvas.toBlob = callback => { captures++; encodedAtFrame = f.renderer.info.render.frame; callback(blob); };
    const before = f.renderer.info.render.frame;
    const exported = f.controller.captureFrame();
    f.tick(1000);
    assert.equal(captures, 0);
    assert.equal(f.frames.size, 0);
    f.visible(true); f.tick(0);
    assert.equal(await exported, blob);
    assert.equal(captures, 1);
    assert.equal(encodedAtFrame, before + 1);
    assert.equal(f.frames.size, 0);
    const discarded = f.controller.captureFrame();
    const rejected = assert.rejects(discarded, /disposed/);
    f.controller.dispose();
    await rejected;
    await assert.rejects(f.controller.captureFrame(), /disposed/);
});
