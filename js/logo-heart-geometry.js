import { getHeartPoint, getHeartColor, getHeartNormal, getHeartPulsePoint } from './logo-heart-surface.js?v=2026.09.07';

const templates = new WeakMap();
const inlayTemplates = new WeakMap();

export function createHeartGeometry(THREE) {
    if (!templates.has(THREE)) {
        const radialSegments = 160, depthSegments = 64;
        const positions = [], normals = [], colors = [], indices = [];
        const color = new THREE.Color();
        const vertex = point => {
            const index = positions.length / 3;
            positions.push(...point);
            normals.push(...getHeartNormal(...point));
            color.setRGB(...getHeartColor(...point), THREE.SRGBColorSpace).toArray(colors, index * 3);
            return index;
        };
        const back = vertex(getHeartPoint(0, -Math.PI / 2));
        for (let row = 1; row < depthSegments; row++) {
            const depthAngle = -Math.PI / 2 + row / depthSegments * Math.PI;
            for (let column = 0; column < radialSegments; column++) vertex(getHeartPoint(column / radialSegments * Math.PI * 2, depthAngle));
        }
        const front = vertex(getHeartPoint(0, Math.PI / 2));
        const ring = (row, column) => 1 + row * radialSegments + (column + radialSegments) % radialSegments;
        for (let column = 0; column < radialSegments; column++) {
            indices.push(back, ring(0, column), ring(0, column + 1));
            for (let row = 0; row < depthSegments - 2; row++) {
                const a = ring(row, column), b = ring(row, column + 1), c = ring(row + 1, column), d = ring(row + 1, column + 1);
                indices.push(a, c, b, b, c, d);
            }
            indices.push(front, ring(depthSegments - 2, column + 1), ring(depthSegments - 2, column));
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        templates.set(THREE, geometry);
    }
    return templates.get(THREE).clone();
}

export function createHeartInlayGeometry(THREE) {
    if (!inlayTemplates.has(THREE)) {
        class PulseCurve extends THREE.Curve {
            getPoint(t, target = new THREE.Vector3()) { return target.set(...getHeartPulsePoint(t)); }
        }
        const curve = new PulseCurve();
        const geometry = new THREE.TubeGeometry(curve, 160, 0.009, 8, false);
        const positions = Array.from(geometry.attributes.position.array);
        const normals = Array.from(geometry.attributes.normal.array);
        const uv = Array.from(geometry.attributes.uv.array);
        const indices = Array.from(geometry.index.array);
        // The small metal stroke is inset into the body, with closed cut ends.
        for (const end of [0, 1]) {
            const center = curve.getPoint(end), normal = curve.getTangent(end).multiplyScalar(end ? 1 : -1);
            const first = positions.length / 3;
            positions.push(...center.toArray()); normals.push(...normal.toArray()); uv.push(end, 0.5);
            const ring = [];
            for (let i = 0; i < 8; i++) {
                const point = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, end * 160 * 9 + i);
                ring.push(point);
                positions.push(...point.toArray()); normals.push(...normal.toArray()); uv.push(end, i / 8);
            }
            for (let i = 0; i < 8; i++) {
                const next = (i + 1) % 8;
                const winding = ring[i].clone().sub(center).cross(ring[next].clone().sub(center)).dot(normal);
                indices.push(first, first + 1 + (winding > 0 ? i : next), first + 1 + (winding > 0 ? next : i));
            }
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geometry.setIndex(indices);
        inlayTemplates.set(THREE, geometry);
    }
    return inlayTemplates.get(THREE).clone();
}
