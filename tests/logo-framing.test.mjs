import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.min.js';
import { sculptureFixture } from './helpers/sculpture-scene.mjs';
import { LOGO_STORY } from '../js/logo-story.js';

function projectedBounds(scene, camera, width, height) {
    const result = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
    const transform = new THREE.Matrix4(), view = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const point = new THREE.Vector3(), viewPoint = new THREE.Vector3(), modelView = new THREE.Matrix4();
    scene.traverseVisible(object => {
        if (object.isSprite) return; // The soft aura is intentionally wider than the sculpture.
        const position = object.geometry?.getAttribute('position');
        if (!position) return;
        const uniforms = object.material?.uniforms;
        if (object.isPoints && uniforms.uOpacity.value <= 0) return;
        transform.multiplyMatrices(view, object.matrixWorld);
        if (object.isPoints) modelView.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
        for (let index = 0; index < position.count; index++) {
            for (const shimmer of object.isPoints ? [-1, 1] : [0]) {
                point.fromBufferAttribute(position, index);
                let radiusX = 0, radiusY = 0;
                if (object.isPoints) {
                    // Include the rendered disc, not just its center. Both shader
                    // shimmer extremes are conservative at any inspected time.
                    point.multiplyScalar(1 + shimmer * 0.012 * uniforms.uBreath.value);
                    viewPoint.copy(point).applyMatrix4(modelView);
                    const dpr = uniforms.uPixelRatio.value;
                    const diameter = Math.max(0.8, Math.min(16 * dpr, object.geometry.getAttribute('aSize').getX(index)
                        * dpr * uniforms.uViewportScale.value * (7.15 / Math.max(1, -viewPoint.z))));
                    radiusX = diameter / (width * dpr); radiusY = diameter / (height * dpr);
                }
                point.applyMatrix4(transform);
                result.left = Math.min(result.left, point.x - radiusX); result.right = Math.max(result.right, point.x + radiusX);
                result.bottom = Math.min(result.bottom, point.y - radiusY); result.top = Math.max(result.top, point.y + radiusY);
            }
        }
    });
    return result;
}

test('every sculpture and handoff fits its real login and rail slots, including a held tilt', async t => {
    const f = await sculptureFixture(t);
    for (const [width, height] of [[220, 185], [155, 130], [150, 126], [44, 44]]) {
        if (width === 44) f.control.sidebar = { classList: { contains: () => true } };
        f.resize(width, height); f.tick(0);
        let startedAt = 0;
        for (const chapter of LOGO_STORY) {
            const times = [0, 0.25, 0.5, 0.75, 0.99].map(progress => startedAt + chapter.hold * progress);
            times.push(...[0.25, 0.5, 0.75].map(progress => startedAt + chapter.hold + chapter.duration * progress));
            for (const time of times) {
                f.controller.setInspectionRotation(null);
                f.controller.setInspectionTime(time); f.tick(0);
                const pose = f.controller.getDiagnostics().rotation;
                for (const [dx, dy] of [[0, 0], [-0.55, -0.25], [0.55, 0.25], [-0.55, 0.25], [0.55, -0.25]]) {
                    f.controller.setInspectionRotation([pose[0] + dy, pose[1] + dx, pose[2]]); f.tick(0);
                    f.root().scale.multiplyScalar(1.018); // Maximum interface acknowledgement.
                    f.renderer.scene.updateMatrixWorld(true);
                    const bounds = projectedBounds(f.renderer.scene, f.renderer.camera, width, height);
                    const extent = Math.max(...Object.values(bounds).map(Math.abs));
                    assert.ok(extent < 0.98, `${chapter.name} exceeds framing margin ${width}x${height} at ${time}ms / ${dx},${dy}: ${JSON.stringify(bounds)}`);
                }
            }
            startedAt += chapter.hold + chapter.duration;
        }
    }
});
