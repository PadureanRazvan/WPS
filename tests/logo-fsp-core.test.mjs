import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.min.js';
import { createFspCore } from '../js/logo-fsp-core.js';
import { FSP_SHAPE_DATA } from '../assets/branding/fsp-shape-data.js';
import { FSP_BEVEL, getFspRelief } from '../js/logo-surfaces.js';
import { createLogoShape } from '../js/logo-shapes.js';

test('FSP depth geometry retains oceans while cutting the exterior and letter counters', () => {
  const core = createFspCore(THREE, { full: new THREE.Texture(), compact: new THREE.Texture() });
  const full = core.userData.variants.full;
  full.updateMatrixWorld(true);
  full.geometry.computeBoundingBox();
  const bounds = full.geometry.boundingBox;
  assert.ok(bounds.max.z - bounds.min.z > 0.13);
  assert.ok(full.geometry.getAttribute('position').array.every(Number.isFinite));
  const hit = (sourceX, sourceY) => {
    const x = ((sourceX - 82) / 1190 - 0.5) * FSP_SHAPE_DATA.full.width;
    const y = (0.5 - (sourceY - 40) / 1000) * FSP_SHAPE_DATA.full.height;
    return new THREE.Raycaster(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1)).intersectObject(full).length;
  };
  assert.ok(hit(300, 300) > 0, 'white ocean must remain solid');
  assert.equal(hit(90, 60), 0, 'exterior must have no rectangular geometry');
  assert.equal(hit(632, 914), 0, 'O counter must remain open');
  assert.equal(hit(1150, 607), 0, 'P counter must remain open');
  for (const mesh of Object.values(core.userData.variants)) {
    mesh.geometry.dispose();
    mesh.material.forEach(material => { material.map?.dispose(); material.dispose(); });
  }
});

test('FSP globe relief is curved, finite and deeper than its preserved wordmark', () => {
  const core = createFspCore(THREE, { full: new THREE.Texture(), compact: new THREE.Texture() });
  for (const [variant, mesh] of Object.entries(core.userData.variants)) {
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const uv = mesh.geometry.getAttribute('uv');
    assert.ok(position.array.every(Number.isFinite));
    assert.ok(normal.array.every(Number.isFinite));
    const data = FSP_SHAPE_DATA[variant];
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    assert.ok(bounds.max.z - bounds.min.z > 0.65, `${variant} should have actual globe volume`);
    assert.ok(bounds.max.x - bounds.min.x <= data.width + 0.01, 'sculpting must keep the approved silhouette');
    for (let i = 0; i < position.count; i++) {
      assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 1e-5);
      assert.ok(Math.abs(uv.getX(i) - (position.getX(i) / data.width + 0.5)) < 1e-6);
      assert.ok(Math.abs(uv.getY(i) - (position.getY(i) / data.height + 0.5)) < 1e-6);
    }
    assert.equal(mesh.geometry.groups.length, 2, 'all lettering should batch into a face and an edge draw');
    mesh.geometry.dispose();
    mesh.material.forEach(material => { material.map?.dispose(); material.dispose(); });
  }
  assert.equal(getFspRelief(0, -0.9, 'full').height, 0, 'GLOBAL wordmark stays planar');
});

test('FSP particles originate on the sculpted faces during dissolution', () => {
  for (const variant of ['full', 'compact']) {
    const shape = createLogoShape('fsp', 520, 42, variant);
    const halfDepth = (FSP_SHAPE_DATA[variant].depth + FSP_BEVEL.depth) / 2 + FSP_BEVEL.thickness;
    for (let i = 0; i < shape.count; i++) {
      const [x, y, z] = shape.positions.slice(i * 3, i * 3 + 3);
      assert.ok(Math.abs(Math.abs(z) - halfDepth - getFspRelief(x, y, variant).height) < 1e-6);
    }
  }
});
