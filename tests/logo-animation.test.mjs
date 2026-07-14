import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { getHeartBeatScale, getLogoMotion } from '../js/logo-animation.js';
import { SHERPA_VERSION } from '../js/version.js';

const TWO_PI = Math.PI * 2;
const HEART_REVEAL_ANGLE = 0.48;
const animationSource = await readFile(new URL('../js/logo-animation.js', import.meta.url), 'utf8');
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

test('heart beat has a softer second pulse and a calm resting phase', () => {
  const firstBeat = getHeartBeatScale(128);
  const secondBeat = getHeartBeatScale(384);
  const rest = getHeartBeatScale(900);

  assert.ok(firstBeat > secondBeat);
  assert.ok(secondBeat > rest);
  assert.ok(rest < 1.002);
});

test('infinity ribbon settles front-biased while retaining a gentle 3D sway', () => {
  let rotY = Math.PI * 0.7;
  const startError = Math.abs(rotY);

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
  assert.ok(Math.abs(rotY) < startError * 0.05);
  assert.notEqual(settled.displayRotY, settled.rotY);
  assert.ok(Math.abs(settled.rotZ) < 0.1);
});

test('point shader uses the color attribute injected by Three.js', () => {
  assert.match(animationSource, /vertexColors:\s*true/);
  assert.doesNotMatch(animationSource, /attribute\s+vec3\s+color\s*;/);
});

test('logo module graph uses the current release number as its browser cache key', () => {
  const version = SHERPA_VERSION.number.replaceAll('.', '\\.');

  assert.match(indexSource, new RegExp(`js/main\\.js\\?v=${version}`));
  assert.match(indexSource, new RegExp(`js/logo-animation\\.js\\?v=${version}`));
  assert.match(mainSource, new RegExp(`logo-animation\\.js\\?v=${version}`));
  assert.match(animationSource, new RegExp(`logo-shapes\\.js\\?v=${version}`));
});
