import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.min.js';
import { createSherpaBossModel } from '../js/sherpa-boss-model.js';

test('worry and impact deform the face reversibly while preserving finite geometry', () => {
    const model = createSherpaBossModel(THREE);
    const lip = model.root.getObjectByName('Soft lower lip');
    const brow = model.root.getObjectByName('Natural tapered eyebrow');
    const originalLip = lip.geometry.attributes.position.array.slice();
    const originalBrow = brow.geometry.attributes.position.array.slice();
    model.setMood({ discomfort: 1 }); model.blink(.38);
    assert.notDeepEqual(lip.geometry.attributes.position.array, originalLip);
    assert.notDeepEqual(brow.geometry.attributes.position.array, originalBrow);
    model.setMood({ impact: 1 }); model.blink(.8);
    model.root.traverse(object => {
        for (const attribute of Object.values(object.geometry?.attributes || {})) assert.ok(attribute.array.every(Number.isFinite));
    });
    model.setMood({}); model.blink(0);
    assert.deepEqual(lip.geometry.attributes.position.array, originalLip);
    assert.deepEqual(brow.geometry.attributes.position.array, originalBrow);
    model.dispose(); model.dispose();
});
