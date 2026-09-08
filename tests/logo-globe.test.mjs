import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.min.js';
import { createGlobeCore } from '../js/logo-cores.js';
import { createGlobeGeometry } from '../js/logo-globe-geometry.js';
import { GLOBE_RADII, getGlobePoint, getGlobeOrbitPoint, isGlobeLand } from '../js/logo-globe-surface.js';

function dispose(core) {
  core.traverse(object => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
    else object.material?.dispose();
  });
}

test('enamel globe has finite surface attributes at both poles and raised opaque continents', () => {
  const globe = createGlobeCore(THREE);
  globe.traverse(object => {
    if (!object.geometry) return;
    for (const [name, attribute] of Object.entries(object.geometry.attributes)) {
      assert.ok(attribute.array.every(Number.isFinite), `${object.name || object.type}: ${name} contains a non-finite value`);
    }
  });
  const ocean = globe.getObjectByName('enamel-ocean');
  const land = globe.getObjectByName('raised-continents');
  assert.equal(ocean.material.transparent, false);
  assert.equal(land.material.transparent, false);
  assert.equal(ocean.material.depthWrite, true);
  assert.equal(land.material.depthWrite, true);
  assert.ok(GLOBE_RADII.land > GLOBE_RADII.ocean + 0.015);
  const position = land.geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    assert.ok(Math.abs(Math.hypot(position.getX(i), position.getY(i), position.getZ(i)) - GLOBE_RADII.land) < 1e-6);
  }
  dispose(globe);
});

test('raised geography covers continent interiors and leaves the oceans open', () => {
  const globe = createGlobeCore(THREE);
  globe.updateMatrixWorld(true);
  const land = globe.getObjectByName('raised-continents');
  const locations = [
    [2, 48, true], [-100, 40, true], [-60, -15, true], [135, -25, true],
    [35, -1, true], [100, 60, true], [50, -82, true],
    [0, 0, false], [-140, 0, false], [80, -30, false]
  ];
  for (const [longitude, latitude, expected] of locations) {
    assert.equal(isGlobeLand(longitude, latitude), expected);
    const unit = new THREE.Vector3(...getGlobePoint(longitude, latitude));
    const hits = new THREE.Raycaster(unit.clone().multiplyScalar(3), unit.clone().negate()).intersectObject(land);
    assert.equal(hits.length > 0, expected, `geometry disagrees at ${longitude},${latitude}`);
    if (expected) assert.ok(hits[0].point.length() > GLOBE_RADII.ocean + 0.015);
  }
  dispose(globe);
});

test('orbital bead follows the same three-dimensional path as the morph particles', () => {
  const globe = createGlobeCore(THREE);
  for (const now of [0, 1000, 4500, 9000]) {
    globe.userData.animate(now);
    const expected = getGlobeOrbitPoint(0.8 + now * 0.00018);
    const actual = globe.getObjectByName('orbital-bead').position;
    assert.ok(actual.distanceTo(new THREE.Vector3(...expected)) < 1e-9);
    assert.ok(Math.abs(actual.length() - GLOBE_RADII.orbit) < 1e-9);
  }
  dispose(globe);
});

test('separate globe instances own their geometry buffers', () => {
  const first = createGlobeCore(THREE), second = createGlobeCore(THREE);
  const a = first.getObjectByName('raised-continents').geometry.attributes.position;
  const b = second.getObjectByName('raised-continents').geometry.attributes.position;
  const original = b.getX(0);
  a.setX(0, 99);
  assert.equal(b.getX(0), original);
  dispose(first);
  assert.ok(b.array.every(Number.isFinite));
  dispose(second);
});

test('raised geography has no open joins or overlapping faces above the ocean', () => {
  const geometries = createGlobeGeometry(THREE);
  const edges = new Map();
  for (const geometry of [geometries.land, geometries.cliffs]) {
    const position = geometry.getAttribute('position'), index = geometry.index.array;
    const vertex = i => [position.getX(i), position.getY(i), position.getZ(i)]
      .map(n => Math.round(n * 1e5)).join(',');
    for (let i = 0; i < index.length; i += 3) {
      const face = [index[i], index[i + 1], index[i + 2]].map(vertex);
      if (new Set(face).size < 3) continue; // coincident longitudes at the poles
      for (let j = 0; j < 3; j++) {
        const edge = [face[j], face[(j + 1) % 3]].sort().join('|');
        edges.set(edge, (edges.get(edge) || 0) + 1);
      }
    }
  }
  for (const [edge, count] of edges) {
    assert.ok(count <= 2, 'faces must not overlap');
    const aboveOcean = edge.split('|').every(p => Math.hypot(...p.split(',').map(Number)) / 1e5 > GLOBE_RADII.ocean + 0.01);
    if (aboveOcean) assert.equal(count, 2, `open raised surface at ${edge}`);
  }
  Object.values(geometries).forEach(geometry => geometry.dispose());
});
