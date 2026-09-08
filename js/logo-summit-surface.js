const TAU = Math.PI * 2;
const SECTORS = 12;

export const SUMMIT_PEAK = Object.freeze([0.16, 1.12, -0.1]);

function subtract(a, b) { return a.map((value, axis) => value - b[axis]); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalize(point) { const length = Math.hypot(...point) || 1; return point.map(value => value / length); }

function bevelRockFaces(faces, width) {
    const result = [], edges = new Map(), corners = new Map();
    const pointKey = point => point.map(value => Math.round(value * 1e9)).join(',');
    const add = (a, b, c, normal, kind) => {
        const winding = cross(subtract(b, a), subtract(c, a));
        if (winding.reduce((sum, value, axis) => sum + value * normal[axis], 0) < 0) [b, c] = [c, b];
        result.push({ points: [a, b, c], kind });
    };
    faces.forEach(({ points, kind }, id) => {
        const [a, b, c] = points;
        const normal = normalize(cross(subtract(b, a), subtract(c, a)));
        const lengths = [Math.hypot(...subtract(b, c)), Math.hypot(...subtract(c, a)), Math.hypot(...subtract(a, b))];
        const perimeter = lengths.reduce((sum, length) => sum + length, 0);
        const center = [0, 1, 2].map(axis => points.reduce((sum, point, i) => sum + point[axis] * lengths[i], 0) / perimeter);
        const inradius = Math.hypot(...cross(subtract(b, a), subtract(c, a))) / perimeter;
        const inset = Math.min(0.24, width / inradius);
        const inner = points.map(point => point.map((value, axis) => value + (center[axis] - value) * inset));
        result.push({ points: inner, kind });
        for (let i = 0; i < 3; i++) {
            const key = pointKey(points[i]);
            if (!corners.has(key)) corners.set(key, { point: points[i], faces: new Map(), links: new Map() });
            corners.get(key).faces.set(id, { point: inner[i], normal, kind });
            const next = (i + 1) % 3;
            const edgeKey = [key, pointKey(points[next])].sort().join('/');
            const halfEdge = { id, from: key, to: pointKey(points[next]), a: inner[i], b: inner[next], normal, kind };
            if (!edges.has(edgeKey)) { edges.set(edgeKey, halfEdge); continue; }
            const other = edges.get(edgeKey);
            const meanNormal = normalize(normal.map((value, axis) => value + other.normal[axis]));
            add(other.a, other.b, halfEdge.a, meanNormal, kind);
            add(other.a, halfEdge.a, halfEdge.b, meanNormal, kind);
            for (const vertex of [halfEdge.from, halfEdge.to]) {
                const links = corners.get(vertex).links;
                if (!links.has(id)) links.set(id, []);
                if (!links.has(other.id)) links.set(other.id, []);
                links.get(id).push(other.id); links.get(other.id).push(id);
            }
        }
    });
    for (const { point, faces: adjacent, links } of corners.values()) {
        const first = adjacent.keys().next().value;
        let previous = null, current = first;
        do {
            const next = links.get(current).find(id => id !== previous);
            const a = adjacent.get(current), b = adjacent.get(next);
            add(point, a.point, b.point, normalize(a.normal.map((value, axis) => value + b.normal[axis])), a.kind);
            previous = current; current = next;
        } while (current !== first);
    }
    return result;
}

function snowField([x, y, z]) {
    return y - (0.43 + Math.sin(x * 7 + z * 3) * 0.085 + Math.sin(z * 11 - x * 4) * 0.06);
}

function clipSnow(vertices, keepSnow) {
    const result = [];
    for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i], b = vertices[(i + 1) % vertices.length];
        const fa = a[3], fb = b[3], inside = keepSnow ? fa >= 0 : fa <= 0;
        if (inside) result.push(a);
        if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
            const t = fa / (fa - fb);
            result.push(a.map((value, axis) => value + (b[axis] - value) * t));
        }
    }
    return result;
}

function buildSurface() {
    const terrain = [], triangles = [];
    const ring = (radiusX, radiusZ, heights, offsetX = 0, offsetZ = 0) => heights.map((y, i) => {
        const angle = i / SECTORS * TAU;
        const irregularity = 1 + Math.sin(i * 2.7 + radiusX) * 0.055;
        return [Math.sin(angle) * radiusX * irregularity + offsetX, y, Math.cos(angle) * radiusZ * irregularity + offsetZ];
    });
    const crown = ring(0.14, 0.12, [0.76, 0.7, 0.81, 0.78, 0.82, 0.88, 0.84, 0.75, 0.79, 0.74, 0.7, 0.72], 0.13, -0.09);
    const upper = ring(0.35, 0.27, [0.37, 0.32, 0.45, 0.48, 0.49, 0.56, 0.5, 0.45, 0.4, 0.38, 0.31, 0.25], 0.1, -0.06);
    const middle = ring(0.74, 0.51, [-0.32, -0.24, 0.52, 0.11, 0.16, 0.27, 0.28, 0.09, 0.32, 0.64, 0.14, -0.21], -0.04, -0.03);
    const base = ring(1.17, 0.77, [-0.77, -0.74, -0.72, -0.75, -0.7, -0.74, -0.72, -0.73, -0.77, -0.74, -0.76, -0.73]);
    const foot = base.map(([x, , z]) => [x * 0.91, -0.85, z * 0.91]);
    const face = (a, b, c) => {
        if (cross(subtract(b, a), subtract(c, a))[1] < 0) [b, c] = [c, b];
        terrain.push([a, b, c]);
    };
    for (let i = 0; i < SECTORS; i++) {
        const next = (i + 1) % SECTORS;
        face(SUMMIT_PEAK, crown[i], crown[next]);
        for (const [inner, outer] of [[crown, upper], [upper, middle], [middle, base]]) {
            // Alternate diagonal direction to keep the rock facets irregular.
            if (i % 2) { face(inner[i], outer[i], inner[next]); face(inner[next], outer[i], outer[next]); }
            else { face(inner[i], outer[i], outer[next]); face(inner[i], outer[next], inner[next]); }
        }
    }
    function add(a, b, c, kind) {
        const points = [a, b, c].map(point => point.slice(0, 3));
        const normal = normalize(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
        const area = Math.hypot(...cross(subtract(points[1], points[0]), subtract(points[2], points[0]))) / 2;
        if (area > 1e-10) triangles.push({ points, normal, area, kind });
    }
    const faces = terrain.map(points => ({ points, kind: 'rock' }));
    for (let i = 0; i < SECTORS; i++) {
        const next = (i + 1) % SECTORS;
        faces.push({ points: [base[i], foot[i], foot[next]], kind: 'foot' });
        faces.push({ points: [base[i], foot[next], base[next]], kind: 'foot' });
        faces.push({ points: [[0, -0.85, 0], foot[next], foot[i]], kind: 'foot' });
    }
    const refined = bevelRockFaces(faces, 0.007).flatMap(({ points: [a, b, c], kind }) => {
        const middle = (from, to) => from.map((value, axis) => (value + to[axis]) / 2);
        const ab = middle(a, b), bc = middle(b, c), ca = middle(c, a);
        return [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]].map(points => ({ points, kind }));
    });
    for (const { points, kind: faceKind } of refined) {
        if (faceKind === 'foot') { add(...points, faceKind); continue; }
        const vertices = points.map(point => [...point, snowField(point)]);
        for (const [keepSnow, kind] of [[false, 'rock'], [true, 'snow']]) {
            const polygon = clipSnow(vertices, keepSnow);
            for (let i = 1; i < polygon.length - 1; i++) add(polygon[0], polygon[i], polygon[i + 1], kind);
        }
    }
    return { terrain, triangles };
}

const surface = buildSurface();
export const SUMMIT_TRIANGLES = surface.triangles;
let surfaceArea = 0;
const cumulativeAreas = SUMMIT_TRIANGLES.map(triangle => (surfaceArea += triangle.area));
const frontTriangles = SUMMIT_TRIANGLES.filter(triangle => triangle.normal[2] > 1e-8).map(triangle => ({
    ...triangle,
    minX: Math.min(...triangle.points.map(point => point[0])), maxX: Math.max(...triangle.points.map(point => point[0])),
    minY: Math.min(...triangle.points.map(point => point[1])), maxY: Math.max(...triangle.points.map(point => point[1]))
}));

export function getSummitColor(point, normal, kind = 'rock') {
    if (kind === 'snow') {
        const light = Math.max(0, normal[0] * -0.35 + normal[1] * 0.55 + normal[2] * 0.65);
        return [0.61 + light * 0.23, 0.78 + light * 0.13, 0.85 + light * 0.09];
    }
    if (kind === 'foot') return [0.035, 0.17, 0.2];
    const height = Math.max(0, Math.min(1, (point[1] + 0.8) / 1.9));
    const stratum = Math.sin(point[1] * 12 + point[0] * 2.3) * 0.012;
    return [0.055 + height * 0.07 + stratum, 0.26 + height * 0.17 + stratum, 0.25 + height * 0.15 + stratum];
}

// Front-face projection lets the ascent inlay follow every rock plane exactly.
export function getSummitFrontPoint(x, y) {
    let front = null;
    for (const { points: [a, b, c], normal, minX, maxX, minY, maxY } of frontTriangles) {
        if (x < minX - 1e-7 || x > maxX + 1e-7 || y < minY - 1e-7 || y > maxY + 1e-7) continue;
        const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
        if (Math.abs(denominator) < 1e-10) continue;
        const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denominator;
        const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denominator;
        if (u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7) continue;
        const z = u * a[2] + v * b[2] + (1 - u - v) * c[2];
        if (!front || z > front.point[2]) front = { point: [x, y, z], normal };
    }
    return front;
}

const ROUTE_ANCHORS = [[-0.48, -0.64], [0.12, -0.4], [-0.08, -0.12], [0.28, 0.16], [0.17, 0.42], [0.16, 1.06]];
let routeSamples;

export function getSummitRoutePoint(progress) {
    if (!routeSamples) {
        routeSamples = Array.from({ length: 241 }, (_, index) => {
            const phase = index / 240 * (ROUTE_ANCHORS.length - 1);
            const segment = Math.min(ROUTE_ANCHORS.length - 2, Math.floor(phase)), t = phase - segment;
            const p0 = ROUTE_ANCHORS[Math.max(0, segment - 1)], p1 = ROUTE_ANCHORS[segment];
            const p2 = ROUTE_ANCHORS[segment + 1], p3 = ROUTE_ANCHORS[Math.min(ROUTE_ANCHORS.length - 1, segment + 2)];
            const xy = [0, 1].map(axis => {
                const v0 = (p2[axis] - p0[axis]) * 0.14, v1 = (p3[axis] - p1[axis]) * 0.14;
                return (2 * p1[axis] - 2 * p2[axis] + v0 + v1) * t * t * t
                    + (-3 * p1[axis] + 3 * p2[axis] - 2 * v0 - v1) * t * t + v0 * t + p1[axis];
            });
            const { point } = getSummitFrontPoint(...xy);
            return [point[0], point[1], point[2] + 0.004];
        });
    }
    const phase = Math.max(0, Math.min(1, progress)) * (routeSamples.length - 1);
    const index = Math.min(routeSamples.length - 2, Math.floor(phase)), t = phase - index;
    return routeSamples[index].map((value, axis) => value + (routeSamples[index + 1][axis] - value) * t);
}

export function sampleSummitSurface(areaFraction, u, v) {
    const distance = Math.max(0, Math.min(1, areaFraction)) * surfaceArea;
    let low = 0, high = cumulativeAreas.length - 1;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (cumulativeAreas[middle] < distance) low = middle + 1;
        else high = middle;
    }
    const triangle = SUMMIT_TRIANGLES[low];
    const root = Math.sqrt(u), weights = [1 - root, root * (1 - v), root * v];
    const point = [0, 1, 2].map(axis => triangle.points.reduce((sum, vertex, i) => sum + vertex[axis] * weights[i], 0));
    return { point, color: getSummitColor(point, triangle.normal, triangle.kind), kind: triangle.kind };
}

export function getSummitAscentState(age = 0, reducedMotion = false) {
    if (reducedMotion) return { progress: 1, strength: 1 };
    const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    const phase = ((age % 9000) + 9000) % 9000;
    return {
        progress: ease((phase - 500) / 6500),
        strength: ease(phase / 500) * (1 - ease((phase - 8000) / 700))
    };
}
