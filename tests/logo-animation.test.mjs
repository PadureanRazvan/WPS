import test from 'node:test';
import assert from 'node:assert/strict';

import { getLogoMotion } from '../js/logo-animation.js';

const TWO_PI = Math.PI * 2;

function frontFacingError(rotY) {
  const target = Math.round(rotY / TWO_PI) * TWO_PI;
  return Math.abs(target - rotY);
}

test('settled heart eases front-facing instead of continuing to spin', () => {
  let rotY = Math.PI * 0.78;
  let previousError = frontFacingError(rotY);

  for (let frame = 0; frame < 120; frame++) {
    const motion = getLogoMotion({
      rotY,
      dt: 1 / 60,
      now: frame * 16.67,
      globeFactor: 0,
      heartFactor: 1
    });

    rotY = motion.rotY;
    const error = frontFacingError(rotY);
    assert.ok(error <= previousError + 1e-9, `frame ${frame} drifted away from front-facing`);
    previousError = error;
  }

  assert.ok(frontFacingError(rotY) < 0.02);
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
