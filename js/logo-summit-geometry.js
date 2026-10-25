import { SUMMIT_TRIANGLES, getSummitColor, getSummitRoutePoint } from './logo-summit-surface.js?v=2026.10.25';
import { createCappedTubeGeometry } from './logo-tube-geometry.js?v=2026.10.25';
import { getPreparedLogoGeometry } from './logo-geometry-cache.js?v=2026.10.25';

const templates = new WeakMap();

export function createSummitGeometry(THREE) {
    const prepared = Object.fromEntries(['rock', 'snow', 'route'].map(name => [name, getPreparedLogoGeometry(THREE, `summit-${name}`)]));
    if (Object.values(prepared).every(Boolean)) return Object.fromEntries(Object.entries(prepared).map(([name, geometry]) => [name, geometry.clone()]));
    if (!templates.has(THREE)) {
        const parts = { rock: { positions: [], normals: [], colors: [] }, snow: { positions: [], normals: [], colors: [] } };
        const color = new THREE.Color();
        for (const triangle of SUMMIT_TRIANGLES) {
            const part = parts[triangle.kind === 'snow' ? 'snow' : 'rock'];
            for (const point of triangle.points) {
                part.positions.push(...point);
                part.normals.push(...triangle.normal);
                color.setRGB(...getSummitColor(point, triangle.normal, triangle.kind), THREE.SRGBColorSpace).toArray(part.colors, part.colors.length);
            }
        }
        const geometry = Object.fromEntries(Object.entries(parts).map(([name, part]) => {
            const mesh = new THREE.BufferGeometry();
            mesh.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
            mesh.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals, 3));
            mesh.setAttribute('color', new THREE.Float32BufferAttribute(part.colors, 3));
            mesh.computeBoundingSphere();
            return [name, mesh];
        }));
        class AscentCurve extends THREE.Curve {
            getPoint(t, target = new THREE.Vector3()) { return target.set(...getSummitRoutePoint(t)); }
        }
        geometry.route = createCappedTubeGeometry(THREE, new AscentCurve(), 240, 0.0075, 8);
        templates.set(THREE, geometry);
    }
    return Object.fromEntries(Object.entries(templates.get(THREE)).map(([name, geometry]) => [name, geometry.clone()]));
}
