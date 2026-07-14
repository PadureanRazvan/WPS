const TAU = Math.PI * 2;

export const LOGO_PARTICLE_COUNT = 520;
export const LOGO_SHAPE_NAMES = Object.freeze(['globe', 'heart', 'summit', 'infinity']);

const SHAPE_META = Object.freeze({
    globe: { glow: [0.13, 0.78, 0.48], orbitOpacity: 0.16 },
    heart: { glow: [1.0, 0.23, 0.39], orbitOpacity: 0.02 },
    summit: { glow: [0.96, 0.64, 0.2], orbitOpacity: 0.12 },
    infinity: { glow: [0.14, 0.72, 0.94], orbitOpacity: 0.06 }
});

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function createRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function mixColor(a, b, amount) {
    const t = clamp01(amount);
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t
    ];
}

function setPoint(shape, index, x, y, z, color, size) {
    const offset = index * 3;
    shape.positions[offset] = x;
    shape.positions[offset + 1] = y;
    shape.positions[offset + 2] = z;
    shape.colors[offset] = color[0];
    shape.colors[offset + 1] = color[1];
    shape.colors[offset + 2] = color[2];
    shape.sizes[index] = size;
}

function createShapeBuffer(name, count) {
    const meta = SHAPE_META[name];
    return {
        name,
        count,
        positions: new Float32Array(count * 3),
        colors: new Float32Array(count * 3),
        sizes: new Float32Array(count),
        glow: [...meta.glow],
        orbitOpacity: meta.orbitOpacity
    };
}

function generateGlobe(count, random) {
    const shape = createShapeBuffer('globe', count);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const ocean = [0.08, 0.48, 0.92];
    const deepOcean = [0.05, 0.25, 0.58];
    const land = [0.15, 0.82, 0.45];
    const sunlitLand = [0.52, 0.96, 0.52];

    for (let index = 0; index < count; index++) {
        const yUnit = 1 - 2 * (index + 0.5) / count;
        const ringRadius = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
        const theta = goldenAngle * index;
        const radius = 1.12 + (random() - 0.5) * 0.025;
        const x = Math.cos(theta) * ringRadius * radius;
        const y = yUnit * radius;
        const z = Math.sin(theta) * ringRadius * radius;
        const landSignal = Math.sin(x * 4.1 + z * 1.7)
            + Math.cos(y * 6.4 - z * 2.6)
            + Math.sin((x - y) * 5.2);
        const isLand = landSignal > 0.76 && Math.abs(yUnit) < 0.9;
        const latitudeLight = 0.22 + 0.58 * (1 - Math.abs(yUnit));
        const color = isLand
            ? mixColor(land, sunlitLand, latitudeLight * 0.55 + random() * 0.12)
            : mixColor(deepOcean, ocean, latitudeLight + random() * 0.14);
        const size = (isLand ? 1.95 : 1.55) + random() * 0.65;
        setPoint(shape, index, x, y, z, color, size);
    }

    return shape;
}

function heartBoundaryPoint(t) {
    const x = Math.pow(Math.sin(t), 3);
    const y = (13 * Math.cos(t)
        - 5 * Math.cos(2 * t)
        - 2 * Math.cos(3 * t)
        - Math.cos(4 * t)) / 17;
    return { x, y };
}

function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        const crosses = (a.y > y) !== (b.y > y)
            && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x;
        if (crosses) inside = !inside;
    }
    return inside;
}

function distanceToBoundary(x, y, boundary) {
    let minDistanceSquared = Infinity;
    for (const point of boundary) {
        const dx = x - point.x;
        const dy = y - point.y;
        minDistanceSquared = Math.min(minDistanceSquared, dx * dx + dy * dy);
    }
    return Math.sqrt(minDistanceSquared);
}

function generateHeart(count, random) {
    const shape = createShapeBuffer('heart', count);
    const boundary = Array.from({ length: 160 }, (_, index) => heartBoundaryPoint(index / 160 * TAU));
    const rimCount = Math.floor(count * 0.3);
    const crimson = [0.88, 0.025, 0.16];
    const coral = [1.0, 0.23, 0.39];
    const highlight = [1.0, 0.76, 0.79];

    for (let index = 0; index < rimCount; index++) {
        const t = index / rimCount * TAU + (random() - 0.5) * 0.018;
        const point = heartBoundaryPoint(t);
        const z = Math.sin(t * 3.0) * 0.055 + (random() - 0.5) * 0.025;
        const color = mixColor(coral, highlight, 0.42 + random() * 0.32);
        setPoint(
            shape,
            index,
            point.x * 1.09,
            point.y * 1.12 - 0.035,
            z,
            color,
            2.05 + random() * 0.72
        );
    }

    for (let index = rimCount; index < count; index++) {
        let x = 0;
        let y = 0;
        let accepted = false;
        for (let attempt = 0; attempt < 120 && !accepted; attempt++) {
            x = (random() * 2 - 1) * 1.02;
            y = -1.04 + random() * 1.92;
            accepted = pointInPolygon(x, y, boundary);
        }

        const boundaryDistance = distanceToBoundary(x, y, boundary);
        const depthEnvelope = 0.59 * Math.pow(clamp01(boundaryDistance / 0.58), 0.52);
        const layer = index % 5;
        const z = layer === 0
            ? (random() * 2 - 1) * depthEnvelope * 0.82
            : (layer % 2 === 0 ? 1 : -1) * depthEnvelope * (0.82 + random() * 0.18);
        const depthLight = clamp01((z / 0.59 + 1) * 0.5);
        const color = mixColor(crimson, coral, 0.28 + depthLight * 0.62);
        setPoint(
            shape,
            index,
            x * 1.09,
            y * 1.12 - 0.035,
            z,
            mixColor(color, highlight, Math.max(0, depthLight - 0.72) * 0.55),
            1.72 + random() * 0.68
        );
    }

    return shape;
}

function generateSummit(count, random) {
    const shape = createShapeBuffer('summit', count);
    const ring = [
        [1.05, 0, 0],
        [0, 0, 1.05],
        [-1.05, 0, 0],
        [0, 0, -1.05]
    ];
    const base = [0.08, 0.48, 0.72];
    const ridge = [0.22, 0.84, 0.7];
    const peak = [1.0, 0.67, 0.2];

    for (let index = 0; index < count; index++) {
        const upper = index % 4 !== 0;
        const face = Math.floor(random() * 4);
        const apex = upper ? [0, 1.28, 0] : [0, -0.76, 0];
        const edgeA = ring[face];
        const edgeB = ring[(face + 1) % ring.length];
        const root = Math.sqrt(random());
        const a = 1 - root;
        const b = root * (1 - random());
        const c = 1 - a - b;
        const x = apex[0] * a + edgeA[0] * b + edgeB[0] * c;
        const y = apex[1] * a + edgeA[1] * b + edgeB[1] * c;
        const z = apex[2] * a + edgeA[2] * b + edgeB[2] * c;
        const elevation = clamp01((y + 0.76) / 2.04);
        const color = elevation > 0.5
            ? mixColor(ridge, peak, (elevation - 0.5) * 2)
            : mixColor(base, ridge, elevation * 2);
        setPoint(shape, index, x, y - 0.11, z, color, 1.65 + elevation * 0.65 + random() * 0.42);
    }

    return shape;
}

function normalizeVector(x, y, z) {
    const length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length];
}

function generateInfinity(count, random) {
    const shape = createShapeBuffer('infinity', count);
    const teal = [0.08, 0.82, 0.69];
    const cyan = [0.12, 0.58, 1.0];
    const gold = [1.0, 0.67, 0.22];

    for (let index = 0; index < count; index++) {
        const t = index / count * TAU + (random() - 0.5) * 0.025;
        const centerX = 1.25 * Math.sin(t);
        const centerY = 0.64 * Math.sin(2 * t);
        const centerZ = 0.2 * Math.cos(2 * t);
        const tangent = normalizeVector(
            1.25 * Math.cos(t),
            1.28 * Math.cos(2 * t),
            -0.4 * Math.sin(2 * t)
        );
        const normal = normalizeVector(tangent[1], -tangent[0], 0);
        const binormal = normalizeVector(
            tangent[1] * normal[2] - tangent[2] * normal[1],
            tangent[2] * normal[0] - tangent[0] * normal[2],
            tangent[0] * normal[1] - tangent[1] * normal[0]
        );
        const angle = (index % 17) / 17 * TAU + random() * 0.3;
        const tubeRadius = 0.12 + random() * 0.075;
        const cos = Math.cos(angle) * tubeRadius;
        const sin = Math.sin(angle) * tubeRadius;
        const x = centerX + normal[0] * cos + binormal[0] * sin;
        const y = centerY + normal[1] * cos + binormal[1] * sin;
        const z = centerZ + normal[2] * cos + binormal[2] * sin;
        const colorPhase = (Math.sin(t) + 1) * 0.5;
        const color = colorPhase < 0.5
            ? mixColor(teal, cyan, colorPhase * 2)
            : mixColor(cyan, gold, (colorPhase - 0.5) * 2);
        setPoint(shape, index, x, y, z, color, 1.72 + random() * 0.62);
    }

    return shape;
}

export function createLogoShape(name, count = LOGO_PARTICLE_COUNT, seed = 0x5EED1234) {
    if (!LOGO_SHAPE_NAMES.includes(name)) {
        throw new RangeError(`Unknown logo shape: ${name}`);
    }
    if (!Number.isInteger(count) || count < 32) {
        throw new RangeError('Logo particle count must be an integer of at least 32');
    }

    const shapeSeed = seed ^ ((LOGO_SHAPE_NAMES.indexOf(name) + 1) * 0x9E3779B9);
    const random = createRandom(shapeSeed);
    if (name === 'globe') return generateGlobe(count, random);
    if (name === 'heart') return generateHeart(count, random);
    if (name === 'summit') return generateSummit(count, random);
    return generateInfinity(count, random);
}

export function matchLogoShape(source, target) {
    if (source.count !== target.count) {
        throw new RangeError('Logo shapes must use the same particle count');
    }

    const count = source.count;
    const matched = createShapeBuffer(target.name, count);
    const used = new Uint8Array(count);

    for (let sourceIndex = 0; sourceIndex < count; sourceIndex++) {
        const sourceOffset = sourceIndex * 3;
        let nearestIndex = -1;
        let nearestDistance = Infinity;

        for (let targetIndex = 0; targetIndex < count; targetIndex++) {
            if (used[targetIndex]) continue;
            const targetOffset = targetIndex * 3;
            const dx = source.positions[sourceOffset] - target.positions[targetOffset];
            const dy = source.positions[sourceOffset + 1] - target.positions[targetOffset + 1];
            const dz = source.positions[sourceOffset + 2] - target.positions[targetOffset + 2];
            const distance = dx * dx + dy * dy + dz * dz;
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = targetIndex;
            }
        }

        used[nearestIndex] = 1;
        const targetOffset = nearestIndex * 3;
        matched.positions.set(target.positions.subarray(targetOffset, targetOffset + 3), sourceOffset);
        matched.colors.set(target.colors.subarray(targetOffset, targetOffset + 3), sourceOffset);
        matched.sizes[sourceIndex] = target.sizes[nearestIndex];
    }

    return matched;
}

export function buildLogoConnections(shape, neighboursPerParticle = 2, maxDistance = 0.42) {
    const pairs = [];
    const seen = new Set();
    const maxDistanceSquared = maxDistance * maxDistance;

    for (let index = 0; index < shape.count; index++) {
        const offset = index * 3;
        const nearest = [];
        for (let other = 0; other < shape.count; other++) {
            if (other === index) continue;
            const otherOffset = other * 3;
            const dx = shape.positions[offset] - shape.positions[otherOffset];
            const dy = shape.positions[offset + 1] - shape.positions[otherOffset + 1];
            const dz = shape.positions[offset + 2] - shape.positions[otherOffset + 2];
            const distance = dx * dx + dy * dy + dz * dz;
            if (distance > maxDistanceSquared) continue;

            let insertAt = nearest.findIndex(candidate => distance < candidate.distance);
            if (insertAt === -1) insertAt = nearest.length;
            nearest.splice(insertAt, 0, { index: other, distance });
            if (nearest.length > neighboursPerParticle) nearest.pop();
        }

        for (const candidate of nearest) {
            const low = Math.min(index, candidate.index);
            const high = Math.max(index, candidate.index);
            const key = `${low}:${high}`;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push(low, high);
        }
    }

    return new Uint16Array(pairs);
}
