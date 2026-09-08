import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.min.js';
import { createInfinityCore } from '../js/logo-cores.js';
import { createInfinityGeometry } from '../js/logo-infinity-geometry.js';
import { createLogoShape } from '../js/logo-shapes.js';

function dispose(core) {
  core.traverse(object => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material?.dispose());
  });
}

test('infinity ribbon is a closed solid with a smooth seam and outward-facing bevels', () => {
  const geometry = createInfinityGeometry(THREE);
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const path = geometry.getAttribute('aLogoPath'), index = geometry.index.array;
  const vertices = new Map(), welded = [], edges = new Map();
  for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
  for (let i = 0; i < position.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(position, i);
    const key = point.toArray().map(value => Math.round(value * 1e6)).join(':');
    if (!vertices.has(key)) vertices.set(key, vertices.size);
    welded.push(vertices.get(key));
    assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(normal, i).length() - 1) < 1e-6);
  }
  const firstRow = Array.from({length: path.count}, (_, i) => i).filter(i => path.getX(i) === 0);
  const lastRow = Array.from({length: path.count}, (_, i) => i).filter(i => path.getX(i) === 1);
  assert.equal(firstRow.length, lastRow.length);
  for (let i = 0; i < firstRow.length; i++) {
    assert.equal(welded[firstRow[i]], welded[lastRow[i]], 'path seam must close exactly');
    assert.ok(new THREE.Vector3().fromBufferAttribute(normal, firstRow[i])
      .distanceTo(new THREE.Vector3().fromBufferAttribute(normal, lastRow[i])) < 1e-6, 'path seam must not crease');
  }
  let volume = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const cross = new THREE.Vector3(), faceNormal = new THREE.Vector3(), expected = new THREE.Vector3();
  for (let i = 0; i < index.length; i += 3) {
    const face = [index[i], index[i + 1], index[i + 2]];
    a.fromBufferAttribute(position, face[0]); b.fromBufferAttribute(position, face[1]); c.fromBufferAttribute(position, face[2]);
    volume += a.dot(cross.copy(b).cross(c)) / 6;
    faceNormal.copy(b).sub(a).cross(cross.copy(c).sub(a)).normalize();
    for (const vertex of face) {
      expected.fromBufferAttribute(normal, vertex);
      assert.ok(faceNormal.dot(expected) > 0.85, 'surface folds back or has a reversed triangle');
    }
    for (let j = 0; j < 3; j++) {
      const edge = [welded[face[j]], welded[face[(j + 1) % 3]]].sort((x, y) => x - y).join(':');
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  assert.ok([...edges.values()].every(count => count === 2), 'surface must have no open or overlapping edges');
  assert.equal(vertices.size - edges.size + index.length / 3, 0, 'continuous ribbon has torus topology');
  assert.ok(volume > 0.2 && volume < 0.4, `unexpected ribbon volume ${volume}`);
  assert.ok(index.length / 3 < 30000, 'small interface figure must keep a bounded mesh');
  geometry.dispose();
});

test('infinity crossing has two separated solid layers and both loops remain open', () => {
  const core = createInfinityCore(THREE), ribbon = core.getObjectByName('continuous-ribbon');
  core.updateMatrixWorld(true);
  ribbon.material.forEach(material => {
    assert.equal(material.transparent, false);
    assert.equal(material.depthWrite, true);
    material.side = THREE.DoubleSide;
  });
  const cast = (x, y, side = 1) => new THREE.Raycaster(new THREE.Vector3(x, y, side * 3), new THREE.Vector3(0, 0, -side)).intersectObject(ribbon);
  for (const side of [-1, 1]) {
    const crossing = [...new Set(cast(0, 0, side).map(hit => Math.round(hit.point.z * 1e5) / 1e5))].sort((a, b) => a - b);
    assert.equal(crossing.length, 4, 'crossing must have independent front/back bands');
    assert.ok(crossing[2] - crossing[1] > 0.45, 'overpass must clear the lower band');
    assert.ok(crossing[1] - crossing[0] > 0.1 && crossing[3] - crossing[2] > 0.1);
    for (const x of [-0.67, 0.67]) assert.equal(cast(x, 0, side).length, 0, 'loop hole must remain open');
    for (const x of [-1.12, 1.12]) assert.ok(cast(x, 0, side).length > 0, 'loop must remain a solid band');
  }
  dispose(core);
});

test('infinity particles sit on its beveled surface and geometry instances own their buffers', () => {
  const shape = createLogoShape('infinity', 768, 314159);
  const core = createInfinityCore(THREE), ribbon = core.getObjectByName('continuous-ribbon');
  core.updateMatrixWorld(true);
  const triangle = new THREE.Triangle(), closest = new THREE.Vector3();
  const position = ribbon.geometry.getAttribute('position'), index = ribbon.geometry.index.array;
  let front = 0, back = 0;
  for (let i = 0; i < shape.count; i++) {
    const point = new THREE.Vector3().fromArray(shape.positions, i * 3);
    if (point.z > 0.1) front++;
    if (point.z < -0.1) back++;
    if (i % 7) continue;
    // Measure against the triangles: a grazing ray can miss a rounded bevel.
    let distance = Infinity;
    for (let j = 0; j < index.length; j += 3) {
      triangle.a.fromBufferAttribute(position, index[j]);
      triangle.b.fromBufferAttribute(position, index[j + 1]);
      triangle.c.fromBufferAttribute(position, index[j + 2]);
      triangle.closestPointToPoint(point, closest);
      distance = Math.min(distance, closest.distanceTo(point));
      if (distance < 0.001) break;
    }
    assert.ok(distance < 0.002, `particle ${i} diverges from the rendered ribbon by ${distance}`);
  }
  assert.ok(front > 200 && back > 200, 'particles must represent both crossing layers');
  const copy = createInfinityGeometry(THREE);
  for (const name of Object.keys(copy.attributes)) assert.notEqual(copy.getAttribute(name).array, ribbon.geometry.getAttribute(name).array);
  assert.notEqual(copy.index.array, ribbon.geometry.index.array);
  copy.dispose(); dispose(core);
});
