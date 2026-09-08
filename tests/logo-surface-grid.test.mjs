import test from 'node:test';
import assert from 'node:assert/strict';
import { forEachGridTriangle, getGridEdgeParameters } from '../js/logo-surface-grid.js';

const area = ([a, b, c]) => {
  const u = b.slice(0, 3).map((n, i) => n - a[i]);
  const v = c.slice(0, 3).map((n, i) => n - a[i]);
  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
};

test('surface subdivision preserves area and interpolated vertex attributes', () => {
  const vertices = [[-0.7, -0.2], [1.1, 0.15], [-0.1, 1.3]]
    .map(([x, y]) => [x, y, 2 * x - y, 3 * x + 2 * y]);
  let total = 0;
  forEachGridTriangle(vertices, 0.3, (...triangle) => {
    total += area(triangle);
    for (const [x, y, z, attribute] of triangle) {
      assert.ok(Math.abs(z - (2 * x - y)) < 1e-10);
      assert.ok(Math.abs(attribute - (3 * x + 2 * y)) < 1e-10);
    }
  });
  assert.ok(Math.abs(total - area(vertices)) < 1e-10);
});

test('vertical relief walls survive subdivision on a grid boundary', () => {
  const vertices = [[0.6, -0.4, -0.2], [0.6, 0.8, -0.2], [0.6, 0.8, 0.5]];
  let total = 0;
  forEachGridTriangle(vertices, 0.3, (...triangle) => { total += area(triangle); });
  assert.ok(total > 0.4);
  assert.ok(Math.abs(total - area(vertices)) < 1e-10);
});

test('coastline edge samples coincide with the subdivided surface boundary', () => {
  const a = [-0.7, 0.1], b = [1.1, 1.3], c = [-0.9, 1.8];
  const samples = new Set();
  const key = point => point.map(n => n.toFixed(8)).join(',');
  forEachGridTriangle([a, b, c], 0.3, (...triangle) => {
    for (const p of triangle) {
      const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
      if (Math.abs(cross) < 1e-9) samples.add(key(p));
    }
  });
  const edgeSamples = getGridEdgeParameters(a, b, 0.3).map(t => key(a.map((n, i) => n + (b[i] - n) * t)));
  assert.deepEqual([...samples].sort(), edgeSamples.sort());
  const reversed = getGridEdgeParameters(b, a, 0.3).map(t => key(b.map((n, i) => n + (a[i] - n) * t)));
  assert.deepEqual(reversed.sort(), edgeSamples.sort());
});
