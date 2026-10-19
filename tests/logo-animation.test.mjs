import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { getLogoShapePresence, getLogoCorePresence, getLogoAccessibilityLabel } from '../js/logo-animation.js';
import { SHERPA_VERSION } from '../js/version.js';

const animationSource = await readFile(new URL('../js/logo-animation.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../js/logo-cores.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

test('shape controls announce selection and motion state in every supported interface language', () => {
  assert.match(getLogoAccessibilityLabel({ language: 'en', shapeName: 'heart', paused: true }), /heart.*resume animation/);
  assert.match(getLogoAccessibilityLabel({ language: 'ro', shapeName: 'summit', reducedMotion: true }), /vârf de munte.*Mișcare redusă/);
  assert.match(getLogoAccessibilityLabel({ language: 'it', shapeName: 'infinity', paused: true }), /nastro infinito.*riprendi/);
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
