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
  assert.deepEqual(LOGO_SHAPE_NAMES, ['fsp', 'globe', 'heart', 'summit', 'infinity']);

  for (const name of LOGO_SHAPE_NAMES) {
    const first = createLogoShape(name, 160, 12345);
    const second = createLogoShape(name, 160, 12345);
    assert.equal(first.positions.length, 480);
    assert.equal(first.colors.length, 480);
    assert.equal(first.sizes.length, 160);
    assert.deepEqual(Array.from(first.positions.slice(0, 36)), Array.from(second.positions.slice(0, 36)));
    assert.ok(first.sizes.every(size => size > 1));
    assert.ok(first.glow.every(channel => channel >= 0 && channel <= 1));
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
  assert.ok(y.min >= -0.851 && y.max > 1.1);
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

  assert.ok(x.span > 2.5 && y.span > 1.3);
  assert.ok(z.span > 0.65 && z.span < 0.9);
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

test('particle connections keep exact nearest neighbours and stable distance ties', () => {
  const reference = (shape, neighbours, radius) => {
    const pairs = [], seen = new Set();
    for (let i = 0; i < shape.count; i++) {
      const candidates = Array.from({length: shape.count}, (_, j) => ({index: j,
        distance: [0, 1, 2].reduce((sum, axis) => sum + (shape.positions[i * 3 + axis] - shape.positions[j * 3 + axis]) ** 2, 0)
      })).filter(candidate => candidate.index !== i && candidate.distance <= radius * radius)
        .sort((a, b) => a.distance - b.distance || a.index - b.index).slice(0, neighbours);
      for (const candidate of candidates) {
        const pair = [Math.min(i, candidate.index), Math.max(i, candidate.index)], key = pair.join(':');
        if (!seen.has(key)) { seen.add(key); pairs.push(...pair); }
      }
    }
    return new Uint16Array(pairs);
  };
  const positions = new Float32Array([0,0,0, 0,0,0, -0.5,0,0, 0.5,0,0, 0,0.5,0, 0,-0.5,0, 0,0,0.5, 0,0,-0.5]);
  const cases = [{count: positions.length / 3, positions}, ...LOGO_SHAPE_NAMES.map(name => createLogoShape(name, 96, 42))];
  for (const shape of cases) for (const neighbours of [0, 1, 2, 5]) for (const radius of [0, 0.42, 0.5, 2]) {
    assert.deepEqual(buildLogoConnections(shape, neighbours, radius), reference(shape, neighbours, radius));
  }
  assert.throws(() => buildLogoConnections(cases[0], -1), RangeError);
  assert.throws(() => buildLogoConnections(cases[0], 2, Infinity), RangeError);
});

test('FSP particles retain white oceans and green/blue artwork through a complete morph cycle', () => {
  const fsp = createLogoShape('fsp', 520, 42);
  const swatches = { green: 0, blue: 0, white: 0 };
  for (let i = 0; i < fsp.colors.length; i += 3) {
    const [r, g, b] = fsp.colors.slice(i, i + 3);
    if (g > 0.35 && g > r * 1.6 && g > b * 1.3) swatches.green++;
    if (b > 0.2 && b > r * 1.5 && b > g * 1.2) swatches.blue++;
    if (Math.min(r, g, b) > 0.9) swatches.white++;
  }
  assert.ok(Object.values(swatches).every(count => count > 30), JSON.stringify(swatches));
  let current = fsp;
  for (const name of [...LOGO_SHAPE_NAMES.slice(1), 'fsp']) {
    const target = createLogoShape(name, 520, 42);
    current = matchLogoShape(current, target);
    assert.ok(current.positions.every(Number.isFinite));
    const points = shape => Array.from({ length: shape.count }, (_, i) => Array.from(shape.positions.slice(i * 3, i * 3 + 3)).join(',')).sort();
    assert.deepEqual(points(current), points(target), `${name} lost or duplicated a target point`);
  }
});

test('compact FSP stays a separate globe-and-star silhouette with matching particle count', () => {
  const full = createLogoShape('fsp', 520, 42);
  const compact = createLogoShape('fsp', 520, 42, 'compact');
  assert.equal(compact.count, full.count);
  assert.ok(axisExtent(compact.positions, 1).span < axisExtent(full.positions, 1).span);
  assert.ok(axisExtent(compact.positions, 2).span > 0.1);
  assert.notDeepEqual(compact.positions, full.positions);
});
