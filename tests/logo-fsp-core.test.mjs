import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.min.js';
import { createFspCore } from '../js/logo-fsp-core.js';
import { FSP_SHAPE_DATA } from '../assets/branding/fsp-shape-data.js';

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
