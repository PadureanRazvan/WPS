import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.min.js';
import { createSummitCore } from '../js/logo-cores.js';
import { createSummitGeometry } from '../js/logo-summit-geometry.js';
import { SUMMIT_TRIANGLES, getSummitFrontPoint, getSummitRoutePoint, getSummitAscentState } from '../js/logo-summit-surface.js';
import { createLogoShape } from '../js/logo-shapes.js';

function topology(geometries) {
    const edges = new Map(), vertices = new Set();
    const key = point => point.toArray().map(value => Math.round(value * 1e6)).join(',');
    let faces = 0, volume = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const cross = new THREE.Vector3(), expected = new THREE.Vector3();
    for (const geometry of geometries) {
        const position = geometry.attributes.position, normal = geometry.attributes.normal;
        assert.ok(position.array.every(Number.isFinite));
        assert.ok(normal.array.every(Number.isFinite));
        const index = geometry.index?.array ?? Array.from({length: position.count}, (_, i) => i);
        for (let i = 0; i < index.length; i += 3) {
            a.fromBufferAttribute(position, index[i]); b.fromBufferAttribute(position, index[i + 1]); c.fromBufferAttribute(position, index[i + 2]);
            volume += a.dot(cross.copy(b).cross(c)) / 6;
            cross.copy(b).sub(a).cross(expected.copy(c).sub(a));
            assert.ok(cross.length() > 1e-9, 'degenerate surface triangle');
            expected.fromBufferAttribute(normal, index[i]);
            assert.ok(cross.normalize().dot(expected) > 0.6, 'surface must face outward relative to its material normal');
            const points = [key(a), key(b), key(c)];
            points.forEach(point => vertices.add(point));
            for (let j = 0; j < 3; j++) {
                const edge = [points[j], points[(j + 1) % 3]].sort().join('/');
                edges.set(edge, (edges.get(edge) ?? 0) + 1);
            }
            faces++;
        }
    }
    assert.ok([...edges.values()].every(count => count === 2), 'snow, bevels and rock must meet without open or overlapping edges');
    assert.equal(vertices.size - edges.size + faces, 2, 'a closed solid must retain its topology');
    return { volume, faces };
}

test('alpine terrain is a closed solid with connected snow caps and beveled rock ridges', () => {
    const geometry = createSummitGeometry(THREE);
    const body = topology([geometry.rock, geometry.snow]);
    assert.ok(body.volume > 1.9 && body.volume < 2.2);
    assert.ok(body.faces > 500 && body.faces < 10000);
    assert.ok(topology([geometry.route]).volume > 0, 'metal inlay has closed cut ends');
    Object.values(geometry).forEach(part => part.dispose());
});

test('summit has separate snowy peaks, deep rock faces and a broad closed foot', () => {
    const core = createSummitCore(THREE);
    core.updateMatrixWorld(true);
    const body = [core.getObjectByName('alpine-rock'), core.getObjectByName('glacial-snow')];
    assert.ok(body.every(mesh => !mesh.material.transparent && mesh.material.depthWrite));
    const hit = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, 4), new THREE.Vector3(0, 0, -1)).intersectObjects(body)[0];
    assert.equal(hit(0.16, 1.06)?.object.name, 'glacial-snow');
    assert.equal(hit(-0.73, 0.6)?.object.name, 'glacial-snow');
    assert.equal(hit(-0.38, 0.72), undefined, 'saddle between the peaks stays open');
    assert.equal(hit(0.05, -0.4)?.object.name, 'alpine-rock');
    assert.ok(hit(-0.9, -0.73) && hit(0.9, -0.73), 'lower silhouette retains a wide base');
    const down = new THREE.Raycaster(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, -1, 0));
    const up = new THREE.Raycaster(new THREE.Vector3(0, -3, 0), new THREE.Vector3(0, 1, 0));
    assert.ok(down.intersectObjects(body).length && up.intersectObjects(body).length);
    core.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
});

test('gold ascent remains on the front rock and reaches the main summit without a visible reset jump', () => {
    let minimum = Infinity, maximum = -Infinity;
    for (let i = 0; i <= 1000; i++) {
        const [x, y, z] = getSummitRoutePoint(i / 1000);
        const front = getSummitFrontPoint(x, y);
        assert.ok(front, 'route must stay inside the mountain silhouette');
        minimum = Math.min(minimum, z - front.point[2]);
        maximum = Math.max(maximum, z - front.point[2]);
    }
    assert.ok(minimum > -0.004 && maximum < 0.017, `inlay leaves the stone: ${minimum}..${maximum}`);
    assert.ok(getSummitRoutePoint(1)[1] > 1.05);
    assert.equal(getSummitAscentState(8999).strength, 0);
    assert.equal(getSummitAscentState(0).strength, 0);
    assert.deepEqual(getSummitAscentState(4000, true), { progress: 1, strength: 1 });
    let lastProgress = 0;
    for (let age = 0; age <= 8000; age += 16) {
        const state = getSummitAscentState(age);
        assert.ok(state.progress >= lastProgress && state.progress <= 1);
        assert.ok(state.strength >= 0 && state.strength <= 1);
        lastProgress = state.progress;
    }
});

test('summit particles sample the actual sculpture and separate instances own their buffers', () => {
    const shape = createLogoShape('summit', 768, 314159);
    const triangles = SUMMIT_TRIANGLES.map(({points}) => new THREE.Triangle(...points.map(point => new THREE.Vector3(...point))));
    const point = new THREE.Vector3(), closest = new THREE.Vector3();
    for (let i = 0; i < shape.count; i += 11) {
        point.fromArray(shape.positions, i * 3);
        const distance = Math.min(...triangles.map(triangle => triangle.closestPointToPoint(point, closest).distanceTo(point)));
        assert.ok(distance < 0.012, `particle floats away from the sculpture: ${distance}`);
    }
    const first = createSummitGeometry(THREE), second = createSummitGeometry(THREE);
    for (const name of Object.keys(first)) {
        assert.notEqual(first[name].attributes.position.array, second[name].attributes.position.array);
        assert.deepEqual(first[name].attributes.position.array, second[name].attributes.position.array);
        first[name].dispose(); second[name].dispose();
    }
});
