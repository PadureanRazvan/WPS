import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.min.js';
import { createHeartCore } from '../js/logo-cores.js';
import { createHeartGeometry } from '../js/logo-heart-geometry.js';
import { getHeartField } from '../js/logo-heart-surface.js';
import { createLogoShape } from '../js/logo-shapes.js';

function dispose(core) {
  core.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
}

test('ruby heart is a closed, outward-facing solid with smooth finite normals', () => {
  const geometry = createHeartGeometry(THREE);
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const index = geometry.index.array, edges = new Map();
  assert.ok(position.array.every(Number.isFinite));
  assert.ok(normal.array.every(Number.isFinite));
  for (let i = 0; i < normal.count; i++) {
    assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 1e-6);
  }
  let volume = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const cross = new THREE.Vector3(), faceNormal = new THREE.Vector3(), expected = new THREE.Vector3();
  for (let i = 0; i < index.length; i += 3) {
    const face = [index[i], index[i + 1], index[i + 2]];
    a.fromBufferAttribute(position, face[0]);
    b.fromBufferAttribute(position, face[1]);
    c.fromBufferAttribute(position, face[2]);
    volume += a.dot(cross.copy(b).cross(c)) / 6;
    faceNormal.copy(b).sub(a).cross(cross.copy(c).sub(a)).normalize();
    expected.fromBufferAttribute(normal, face[0]);
    assert.ok(faceNormal.dot(expected) > 0.6, 'surface fold or reversed winding');
    for (let j = 0; j < 3; j++) {
      const edge = [face[j], face[(j + 1) % 3]].sort((x, y) => x - y).join(':');
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  assert.ok([...edges.values()].every(count => count === 2), 'every surface edge must join two faces');
  assert.equal(position.count - edges.size + index.length / 3, 2);
  assert.ok(volume > 2 && volume < 4.5, `unexpected heart volume ${volume}`);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(size.x > 2.1 && size.y > 2 && size.z > 1);
  assert.ok(index.length / 3 < 30000, 'small interface figure must keep a bounded mesh');
  geometry.dispose();
});

test('heart has separated shoulders, an open cleft and a centered taper from both faces', () => {
  const core = createHeartCore(THREE), heart = core.getObjectByName('ruby-heart');
  core.updateMatrixWorld(true);
  assert.equal(heart.material.transparent, false);
  assert.equal(heart.material.depthWrite, true);
  for (const side of [-1, 1]) {
    const hit = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, side * 3), new THREE.Vector3(0, 0, -side)).intersectObject(heart).length > 0;
    assert.equal(hit(0, 0.88), false, 'cleft must remain open');
    assert.equal(hit(-0.55, 0.88), true);
    assert.equal(hit(0.55, 0.88), true);
    assert.equal(hit(0, -1.04), true);
    assert.equal(hit(-0.5, -1.04), false);
    assert.equal(hit(0.5, -1.04), false);
  }
  dispose(core);
});

test('heart morph particles lie on the same curved front and back surfaces', () => {
  const shape = createLogoShape('heart', 768, 314159);
  const core = createHeartCore(THREE), heart = core.getObjectByName('ruby-heart');
  core.updateMatrixWorld(true);
  let front = 0, back = 0;
  for (let i = 0; i < shape.count; i++) {
    const point = new THREE.Vector3().fromArray(shape.positions, i * 3);
    const field = getHeartField(point.x, point.y, point.z);
    assert.ok(field > -0.00001 && field < 0.015, 'particle must sit on the body or its shallow inlay');
    if (point.z > 0.1) front++;
    if (point.z < -0.1) back++;
    if (i % 13) continue;
    const direction = point.clone().normalize();
    const hits = new THREE.Raycaster(direction.clone().multiplyScalar(3), direction.clone().negate()).intersectObject(heart);
    assert.ok(hits.length > 0, 'particle has no solid surface beneath it');
    assert.ok(hits[0].point.distanceTo(point) < 0.006, 'particle diverges from the sculpted surface');
  }
  assert.ok(front > 200 && back > 200);
  dispose(core);
});
