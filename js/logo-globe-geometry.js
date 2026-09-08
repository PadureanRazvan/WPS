import { EARTH_LAND_POLYGONS, GLOBE_RADII, getGlobeColor, getGlobePoint } from './logo-globe-surface.js?v=2026.09.09';
import { forEachGridTriangle, getGridEdgeParameters } from './logo-surface-grid.js?v=2026.09.09';

const templates = new WeakMap();
const SURFACE_GRID = 5;

function buildGlobeGeometry(THREE) {
    const positions = [], normals = [], colors = [], indices = [];
    const cliffPositions = [], cliffNormals = [], cliffIndices = [], coastPositions = [];
    const unique = new Map();
    const color = new THREE.Color();
    function vertex([lon, lat]) {
        const key = `${Math.round(lon * 1e5)},${Math.round(lat * 1e5)}`;
        if (unique.has(key)) return unique.get(key);
        const index = unique.size;
        unique.set(key, index);
        const unit = getGlobePoint(lon, lat);
        positions.push(...unit.map(value => value * GLOBE_RADII.land));
        normals.push(...unit);
        color.setRGB(...getGlobeColor(lat, true), THREE.SRGBColorSpace).toArray(colors, index * 3);
        return index;
    }
    for (const rings of EARTH_LAND_POLYGONS) {
        // The source uses tenths of a degree. Integer triangulation avoids
        // almost-collinear ears that turn into hairline gaps after projection.
        const planarPoint = ([x, y]) => new THREE.Vector2(Math.round(x * 10), Math.round(y * 10));
        const outline = rings[0].map(planarPoint);
        const holes = rings.slice(1).map(ring => ring.map(planarPoint));
        const points = rings.flat();
        const faces = THREE.ShapeUtils.triangulateShape(outline, holes);
        for (const face of faces) {
            forEachGridTriangle(face.map(index => points[index]), SURFACE_GRID, (a, b, c) => {
                const winding = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
                if (winding > 0) indices.push(vertex(a), vertex(b), vertex(c));
                else indices.push(vertex(a), vertex(c), vertex(b));
            });
        }
        for (const ring of rings) {
            const directions = ring.map(([lon, lat]) => new THREE.Vector3(...getGlobePoint(lon, lat)));
            const edgeNormals = directions.map((point, i) => directions[(i + 1) % ring.length].clone()
                .sub(directions[(i + ring.length - 1) % ring.length]).cross(point).normalize());
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i], b = ring[(i + 1) % ring.length];
                // The source splits land at the antimeridian. That cut is a
                // shared seam on a sphere, not a coastline or an exposed cliff.
                if (Math.abs(a[0]) === 180 && a[0] === b[0]) continue;
                const parameters = getGridEdgeParameters(a, b, SURFACE_GRID);
                for (let segment = 0; segment < parameters.length - 1; segment++) {
                    const sample = t => getGlobePoint(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
                    const from = parameters[segment], to = parameters[segment + 1];
                    const p = new THREE.Vector3(...sample(from));
                    const q = new THREE.Vector3(...sample(to));
                    if (p.distanceToSquared(q) < 1e-14) continue;
                    const outward = q.clone().sub(p).cross(p.clone().add(q)).normalize();
                    const normalAt = t => {
                        const normal = edgeNormals[i].clone().lerp(edgeNormals[(i + 1) % ring.length], t);
                        return normal.lengthSq() > 1e-8 ? normal.normalize() : outward;
                    };
                    const normalP = normalAt(from), normalQ = normalAt(to);
                    const start = cliffPositions.length / 3;
                    const bottomRadius = GLOBE_RADII.ocean - 0.0005;
                    for (const [point, normal, radius, top] of [[p,normalP,bottomRadius,false],[q,normalQ,bottomRadius,false],[q,normalQ,GLOBE_RADII.land,true],[p,normalP,GLOBE_RADII.land,true]]) {
                        cliffPositions.push(...point.clone().multiplyScalar(radius).toArray());
                        cliffNormals.push(...(top ? normal.clone().multiplyScalar(0.55).addScaledVector(point, 0.83).normalize() : normal).toArray());
                    }
                    cliffIndices.push(start, start + 1, start + 2, start, start + 2, start + 3);
                    coastPositions.push(...p.clone().multiplyScalar(GLOBE_RADII.land + 0.001).toArray(), ...q.clone().multiplyScalar(GLOBE_RADII.land + 0.001).toArray());
                }
            }
        }
    }
    const land = new THREE.BufferGeometry();
    land.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    land.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    land.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    land.setIndex(indices);
    const cliffs = new THREE.BufferGeometry();
    cliffs.setAttribute('position', new THREE.Float32BufferAttribute(cliffPositions, 3));
    cliffs.setAttribute('normal', new THREE.Float32BufferAttribute(cliffNormals, 3));
    cliffs.setIndex(cliffIndices);
    const coastline = new THREE.BufferGeometry();
    coastline.setAttribute('position', new THREE.Float32BufferAttribute(coastPositions, 3));
    return { land, cliffs, coastline };
}

export function createGlobeGeometry(THREE) {
    if (!templates.has(THREE)) templates.set(THREE, buildGlobeGeometry(THREE));
    return Object.fromEntries(Object.entries(templates.get(THREE)).map(([name, geometry]) => [name, geometry.clone()]));
}
