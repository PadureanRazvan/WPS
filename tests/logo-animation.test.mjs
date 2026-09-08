import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { HOLD_DURATIONS, getHeartBeatScale, getInterfacePulseScale, getLogoMotion, getLogoShapePresence, getLogoCorePresence } from '../js/logo-animation.js';
import { SHERPA_VERSION } from '../js/version.js';

const TWO_PI = Math.PI * 2;
const HEART_REVEAL_ANGLE = 0.32;
const animationSource = await readFile(new URL('../js/logo-animation.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../js/logo-cores.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

function revealAngleError(rotY) {
  const target = Math.round((rotY - HEART_REVEAL_ANGLE) / TWO_PI) * TWO_PI + HEART_REVEAL_ANGLE;
  return Math.abs(target - rotY);
}

test('3D heart eases toward an angled reveal instead of flattening front-facing', () => {
  let rotY = Math.PI * 0.78;
  let previousError = revealAngleError(rotY);

  for (let frame = 0; frame < 120; frame++) {
    const motion = getLogoMotion({
      rotY,
      dt: 1 / 60,
      now: 0,
      shapeName: 'heart',
      globeFactor: 0,
      heartFactor: 1
    });

    rotY = motion.rotY;
    const error = revealAngleError(rotY);
    assert.ok(error <= previousError + 1e-9, `frame ${frame} drifted away from the reveal angle`);
    previousError = error;
  }

  assert.ok(revealAngleError(rotY) < 0.02);
  assert.ok(Math.abs(rotY % TWO_PI) > 0.3, 'heart should retain visible 3D depth');
});

test('non-heart logo states keep rotating', () => {
  const motion = getLogoMotion({
    rotY: 0.2,
    dt: 1 / 60,
    now: 100,
    globeFactor: 1,
    heartFactor: 0
  });

  assert.ok(motion.rotY > 0.2);
  assert.equal(motion.displayRotY, motion.rotY);
});

test('FSP makes a continuous full turn during its primary display interval', () => {
  let rotY = 0;
  let frontFrames = 0;
  let backFrames = 0;
  for (let frame = 0; frame < HOLD_DURATIONS.fsp / 1000 * 60; frame++) {
    const next = getLogoMotion({ rotY, dt: 1 / 60, now: frame * 1000 / 60, shapeName: 'fsp' });
    assert.ok(next.rotY > rotY && next.rotY - rotY < 0.02);
    assert.equal(next.displayRotY, next.rotY);
    if (rotY < TWO_PI) {
      if (Math.cos((rotY + next.rotY) / 2) >= 0) frontFrames++;
      else backFrames++;
    }
    rotY = next.rotY;
  }
  assert.ok(rotY > TWO_PI);
  assert.ok(frontFrames > backFrames * 2.5, 'readable front should occupy most of each turn');
  assert.ok(Object.entries(HOLD_DURATIONS).every(([name, duration]) => name === 'fsp' || duration < HOLD_DURATIONS.fsp));
});

test('FSP accelerates through its reversed face and slows smoothly on return', () => {
  const advanceAt = angle => getLogoMotion({ rotY: angle, dt: 0.001, shapeName: 'fsp' }).rotY - angle;
  const front = advanceAt(0);
  const side = advanceAt(Math.PI / 2);
  const back = advanceAt(Math.PI);
  assert.ok(front > 0 && side > front && back > side);
  assert.ok(back > front * 4 && back < front * 6);
  assert.ok(Math.abs(advanceAt(TWO_PI) - front) < 1e-10, 'successive turns should join smoothly');
  assert.ok(Math.abs(advanceAt(-0.01) - advanceAt(0.01)) < 1e-8);
  assert.equal(getLogoMotion({ rotY: Math.PI, dt: 0, shapeName: 'fsp' }).rotY, Math.PI);
});

test('FSP completes the same eased turn at different display refresh rates', () => {
  const turnAfter = frameRate => {
    let rotY = 0;
    for (let frame = 0; frame < 14 * frameRate; frame++) {
      rotY = getLogoMotion({ rotY, dt: 1 / frameRate, shapeName: 'fsp' }).rotY;
    }
    return rotY;
  };
  assert.ok(Math.abs(turnAfter(30) - turnAfter(144)) < 0.001);
});

test('heart motion includes a restrained depth sway', () => {
  const motion = getLogoMotion({
    rotY: HEART_REVEAL_ANGLE,
    dt: 1 / 60,
    now: 1400,
    shapeName: 'heart',
    heartFactor: 1
  });

  assert.notEqual(motion.displayRotY, motion.rotY);
  assert.ok(Math.abs(motion.rotZ) < 0.04);
});

test('a distant reveal angle settles without a sudden high-speed turn', () => {
  for (const shapeName of ['heart', 'summit', 'infinity']) {
    for (const start of [-9.4, -3.14, 3.14, 9.4]) {
      let angle = start;
      for (let frame = 0; frame < 180; frame++) {
        const motion = getLogoMotion({ rotY: angle, dt: 1 / 60, now: frame * 1000 / 60, shapeName });
        assert.ok(Math.abs(motion.rotY - angle) < 0.045, `${shapeName} turned too quickly`);
        angle = motion.rotY;
      }
    }
  }
});

test('an arriving heart does not redirect the departing globe before the motion handoff', () => {
  const globe = getLogoMotion({rotY: 3, dt: 1 / 60, now: 500, shapeName: 'globe', heartFactor: 0.3});
  assert.ok(globe.rotY > 3 && globe.rotY < 3.01);
});

test('heart beat has a softer second pulse and a calm resting phase', () => {
  const firstBeat = getHeartBeatScale(128);
  const secondBeat = getHeartBeatScale(384);
  const rest = getHeartBeatScale(900);

  assert.ok(firstBeat > secondBeat);
  assert.ok(secondBeat > rest);
  assert.ok(rest < 1.002);
});

test('interface pulse lifts the identity briefly and returns to rest', () => {
  assert.equal(getInterfacePulseScale(-1), 1);
  assert.ok(getInterfacePulseScale(450) > 1.04);
  assert.equal(getInterfacePulseScale(901), 1);
});

test('infinity ribbon settles front-biased while retaining a gentle 3D sway', () => {
  let rotY = Math.PI * 0.7;
  const revealAngle = 0.16;
  const startError = Math.abs(rotY - revealAngle);

  for (let frame = 0; frame < 120; frame++) {
    rotY = getLogoMotion({
      rotY,
      dt: 1 / 60,
      now: 0,
      shapeName: 'infinity'
    }).rotY;
  }

  const settled = getLogoMotion({
    rotY,
    dt: 1 / 60,
    now: 1500,
    shapeName: 'infinity'
  });
  assert.ok(Math.abs(rotY - revealAngle) < startError * 0.05);
  assert.notEqual(settled.displayRotY, settled.rotY);
  assert.ok(Math.abs(settled.rotZ) < 0.1);
});

test('summit settles into a readable three-quarter pose', () => {
  const revealAngle = 0.36;
  let rotY = Math.PI * 1.35;

  for (let frame = 0; frame < 150; frame++) {
    rotY = getLogoMotion({
      rotY,
      dt: 1 / 60,
      now: 0,
      shapeName: 'summit'
    }).rotY;
  }

  const target = Math.round((rotY - revealAngle) / TWO_PI) * TWO_PI + revealAngle;
  const settled = getLogoMotion({ rotY, dt: 1 / 60, now: 1800, shapeName: 'summit' });
  assert.ok(Math.abs(rotY - target) < 0.02);
  assert.notEqual(settled.displayRotY, settled.rotY);
  assert.ok(Math.abs(settled.rotZ) < 0.023);
});

test('solid figure cores crossfade without stacking at full strength', () => {
  const heart = getLogoShapePresence('heart', 'heart', 'summit', 0.5);
  const summit = getLogoShapePresence('summit', 'heart', 'summit', 0.5);

  assert.ok(heart > 0 && heart < 1);
  assert.ok(summit > 0 && summit < 1);
  assert.ok(Math.abs(heart + summit - 1) < 1e-9);
  assert.equal(getLogoShapePresence('globe', 'heart', 'summit', 0.5), 0);
});

test('opaque sculptures give the transition midpoint to particles without intersecting', () => {
  for (let frame = 0; frame <= 120; frame++) {
    const progress = frame / 120;
    const source = getLogoCorePresence('fsp', 'fsp', 'globe', progress);
    const target = getLogoCorePresence('globe', 'fsp', 'globe', progress);
    assert.ok(source >= 0 && source <= 1 && target >= 0 && target <= 1);
    assert.equal(source * target, 0, 'opaque figures must not occupy the same transition frame');
  }
  assert.equal(getLogoCorePresence('fsp', 'fsp', 'globe', 0), 1);
  assert.equal(getLogoCorePresence('globe', 'fsp', 'globe', 1), 1);
  assert.equal(getLogoCorePresence('fsp', 'fsp', 'globe', 0.5), 0);
  assert.equal(getLogoCorePresence('globe', 'fsp', 'globe', 0.5), 0);
});

test('point shader uses the color attribute injected by Three.js', () => {
  assert.match(animationSource, /vertexColors:\s*true/);
  assert.doesNotMatch(animationSource, /attribute\s+vec3\s+color\s*;/);
});

test('all four figures have a dedicated depth core', () => {
  for (const name of ['Globe', 'Heart', 'Summit', 'Infinity']) {
    assert.match(coreSource, new RegExp(`function create${name}Core\\(THREE\\)`));
  }
});

test('logo reacts to navigation and theme events without another renderer', () => {
  assert.match(animationSource, /sherpa:navigation/);
  assert.match(animationSource, /sherpa-theme-changed/);
  assert.equal((animationSource.match(/new THREE\.WebGLRenderer/g) || []).length, 1);
});

test('logo module graph uses the current release number as its browser cache key', () => {
  const version = SHERPA_VERSION.number.replaceAll('.', '\\.');

  assert.match(indexSource, new RegExp(`js/main\\.js\\?v=${version}`));
  assert.match(mainSource, new RegExp(`logo-animation\\.js\\?v=${version}`));
  assert.match(animationSource, new RegExp(`logo-shapes\\.js\\?v=${version}`));
});
