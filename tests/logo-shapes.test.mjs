import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOGO_SHAPE_NAMES,
  buildLogoConnections,
  createLogoShape,
  matchLogoShape
} from '../js/logo-shapes.js';

function axisExtent(positions, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (let index = axis; index < positions.length; index += 3) {
    min = Math.min(min, positions[index]);
    max = Math.max(max, positions[index]);
  }
  return { min, max, span: max - min };
}

test('modern logo shape set is deterministic and structurally complete', () => {
  assert.deepEqual(LOGO_SHAPE_NAMES, ['globe', 'heart', 'summit', 'infinity']);

  for (const name of LOGO_SHAPE_NAMES) {
    const first = createLogoShape(name, 160, 12345);
    const second = createLogoShape(name, 160, 12345);
    assert.equal(first.positions.length, 480);
    assert.equal(first.colors.length, 480);
    assert.equal(first.sizes.length, 160);
    assert.deepEqual(Array.from(first.positions.slice(0, 36)), Array.from(second.positions.slice(0, 36)));
    assert.ok(first.sizes.every(size => size > 1));
    assert.ok(first.lineOpacity > 0 && first.lineOpacity < 0.1);
    assert.ok(first.orbitOpacity >= 0 && first.orbitOpacity <= 0.1);
  }
});

test('heart is a volumetric 3D form with two lobes and a centered tip', () => {
  const heart = createLogoShape('heart', 520, 982451653);
  const x = axisExtent(heart.positions, 0);
  const y = axisExtent(heart.positions, 1);
  const z = axisExtent(heart.positions, 2);

  assert.ok(x.span > 2.05);
  assert.ok(y.span > 1.8);
  assert.ok(z.span > 0.75, `heart depth was only ${z.span}`);

  let leftLobe = false;
  let rightLobe = false;
  let tip = null;
  for (let index = 0; index < heart.count; index++) {
    const offset = index * 3;
    const pointX = heart.positions[offset];
    const pointY = heart.positions[offset + 1];
    if (pointY > 0.48 && pointX < -0.3) leftLobe = true;
    if (pointY > 0.48 && pointX > 0.3) rightLobe = true;
    if (!tip || pointY < tip.y) tip = { x: pointX, y: pointY };
  }

  assert.ok(leftLobe && rightLobe, 'heart should have two readable upper lobes');
  assert.ok(Math.abs(tip.x) < 0.12, `heart tip should be centered, got x=${tip.x}`);
});

test('summit has a broad base, narrow peak, and no inverted lower point', () => {
  const summit = createLogoShape('summit', 520, 982451653);
  const x = axisExtent(summit.positions, 0);
  const y = axisExtent(summit.positions, 1);
  const z = axisExtent(summit.positions, 2);
  const peakX = [];
  const baseX = [];

  for (let index = 0; index < summit.count; index++) {
    const offset = index * 3;
    const pointY = summit.positions[offset + 1];
    if (pointY > 0.75) peakX.push(summit.positions[offset]);
    if (pointY < -0.58) baseX.push(summit.positions[offset]);
  }

  const peakSpan = Math.max(...peakX) - Math.min(...peakX);
  const baseSpan = Math.max(...baseX) - Math.min(...baseX);
  assert.ok(x.span > 2.1 && z.span > 1.3);
  assert.ok(y.min > -0.8 && y.max > 1.1);
  assert.ok(peakSpan < baseSpan * 0.25, 'summit should taper strongly toward its peak');
});

test('infinity is a balanced smooth ribbon with visible depth', () => {
  const infinity = createLogoShape('infinity', 520, 982451653);
  const x = axisExtent(infinity.positions, 0);
  const y = axisExtent(infinity.positions, 1);
  const z = axisExtent(infinity.positions, 2);
  let left = 0;
  let right = 0;

  for (let index = 0; index < infinity.count; index++) {
    if (infinity.positions[index * 3] < 0) left++;
    else right++;
  }

  assert.ok(x.span > 2.6 && y.span > 1.25);
  assert.ok(z.span > 0.45 && z.span < 0.55);
  assert.ok(Math.abs(left - right) <= 2, 'infinity loops should stay visually balanced');
});

test('nearest matching preserves every target particle and connection indices stay valid', () => {
  const globe = createLogoShape('globe', 96, 42);
  const heart = createLogoShape('heart', 96, 42);
  const matched = matchLogoShape(globe, heart);
  const connections = buildLogoConnections(matched, 2, 0.65);

  assert.equal(matched.count, 96);
  assert.equal(matched.name, 'heart');
  assert.ok(connections.length > 96);
  assert.equal(connections.length % 2, 0);
  assert.ok(connections.every(index => index >= 0 && index < 96));

  const sourceSum = heart.positions.reduce((sum, value) => sum + value, 0);
  const matchedSum = matched.positions.reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(sourceSum - matchedSum) < 1e-5);
});
