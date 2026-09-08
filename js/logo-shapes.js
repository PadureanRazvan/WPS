import { FSP_SHAPE_DATA } from '../assets/branding/fsp-shape-data.js?v=2026.09.07';
import { FSP_BEVEL, getFspRelief } from './logo-surfaces.js?v=2026.09.07';
import { GLOBE_RADII, getGlobeColor, getGlobeOrbitPoint, getGlobePoint, isGlobeLand } from './logo-globe-surface.js?v=2026.09.07';
import { getHeartPoint, getHeartColor, getHeartPulsePoint } from './logo-heart-surface.js?v=2026.09.07';

import { sampleSummitSurface, SUMMIT_PEAK, getSummitRoutePoint } from './logo-summit-surface.js?v=2026.09.07';

import { getInfinityPathAngle, getInfinityProfile, getInfinitySurfacePoint, getInfinityColor } from './logo-infinity-surface.js?v=2026.09.07';

const TAU = Math.PI * 2;

export const LOGO_PARTICLE_COUNT = 768;
export const LOGO_SHAPE_NAMES = Object.freeze(['fsp', 'globe', 'heart', 'summit', 'infinity']);

const SHAPE_META = Object.freeze({
    fsp: { glow: [0.02, 0.64, 0.31] },
    globe: { glow: [0.06, 0.43, 0.57] },
    heart: { glow: [1.0, 0.16, 0.34] },
    summit: { glow: [0.18, 0.72, 0.75] },
    infinity: { glow: [0.08, 0.63, 0.94] }
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
        glow: [...meta.glow]
    };
}

function generateFsp(count, random, variant) {
    const data = FSP_SHAPE_DATA[variant] || FSP_SHAPE_DATA.full;
    const shape = createShapeBuffer('fsp', count);
    const sampleCount = data.samples.length / 5;
    for (let index = 0; index < count; index++) {
        const offset = Math.min(sampleCount - 1, Math.floor((index + random()) / count * sampleCount)) * 5;
        const x = data.samples[offset], y = data.samples[offset + 1];
        setPoint(shape, index, x, y,
            (index % 3 ? 1 : -1) * ((data.depth + FSP_BEVEL.depth) / 2 + FSP_BEVEL.thickness + getFspRelief(x, y, variant).height),
            data.samples.slice(offset + 2, offset + 5), 1.38 + random() * 0.3);
    }
    return shape;
}

function generateGlobe(count, random) {
    const shape = createShapeBuffer('globe', count);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const orbitCount = Math.floor(count * 0.1);
    const surfaceCount = count - orbitCount;

    for (let index = 0; index < count; index++) {
        if (index < orbitCount) {
            const point = getGlobeOrbitPoint(index / orbitCount * TAU);
            setPoint(shape, index, ...point, [0.88, 0.77, 0.56], 1.1 + random() * 0.25);
            continue;
        }
        const surfaceIndex = index - orbitCount;
        const latitude = Math.asin(1 - 2 * (surfaceIndex + 0.5) / surfaceCount) * 180 / Math.PI;
        const longitude = goldenAngle * surfaceIndex * 180 / Math.PI % 360 - 180;
        const land = isGlobeLand(longitude, latitude);
        const radius = (land ? GLOBE_RADII.land : GLOBE_RADII.ocean) + 0.002 + random() * 0.002;
        const point = getGlobePoint(longitude, latitude, radius);
        const color = mixColor(getGlobeColor(latitude, land), [0.82, 0.94, 0.92], land ? 0.18 : 0.1);
        setPoint(shape, index, ...point, color, (land ? 1.46 : 1.2) + random() * 0.28);
    }

    return shape;
}

function generateHeart(count, random) {
    const shape = createShapeBuffer('heart', count);
    const inlayCount = Math.floor(count * 0.065);
    const surfaceCount = count - inlayCount;
    const outlineCount = Math.floor(surfaceCount * 0.22);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < count; index++) {
        if (index < inlayCount) {
            setPoint(shape, index, ...getHeartPulsePoint(index / Math.max(1, inlayCount - 1)), [0.88, 0.72, 0.51], 1.25);
            continue;
        }
        const surfaceIndex = index - inlayCount;
        const outline = surfaceIndex < outlineCount;
        const t = outline ? surfaceIndex / outlineCount * TAU : (surfaceIndex - outlineCount) * goldenAngle;
        const depthAngle = outline ? 0 : Math.asin(1 - 2 * (surfaceIndex - outlineCount + 0.5) / (surfaceCount - outlineCount));
        const point = getHeartPoint(t, depthAngle);
        const color = mixColor(getHeartColor(...point), [1, 0.66, 0.73], outline ? 0.18 : 0.07);
        setPoint(shape, index, ...point, color, 1.35 + random() * 0.3);
    }
    return shape;
}
function generateSummit(count, random) {
    const shape = createShapeBuffer('summit', count);
    const routeCount = Math.floor(count * 0.07);
    for (let index = 0; index < count; index++) {
        if (index < routeCount) {
            setPoint(shape, index, ...getSummitRoutePoint((index + 0.5) / routeCount), [0.86, 0.71, 0.48], 1.22);
            continue;
        }
        const { point, color, kind } = sampleSummitSurface((index - routeCount + random()) / (count - routeCount), random(), random());
        setPoint(shape, index, ...point, color, (kind === 'snow' ? 1.65 : 1.4) + random() * 0.2);
    }
    setPoint(shape, count - 1, ...SUMMIT_PEAK, [0.9, 0.96, 0.98], 1.8);
    return shape;
}

function generateInfinity(count, random) {
    const shape = createShapeBuffer('infinity', count);
    for (let index = 0; index < count; index++) {
        const angle = getInfinityPathAngle((index + 0.5) / count);
        const profile = getInfinityProfile(index * 0.6180339887498949);
        const { point } = getInfinitySurfacePoint(angle, profile);
        const color = profile.part === 'edge' ? [0.88, 0.77, 0.58] : getInfinityColor(angle);
        setPoint(shape, index, ...point, mixColor(color, [0.8, 0.94, 1], 0.08), 1.3 + random() * 0.2);
    }
    return shape;
}

export function createLogoShape(name, count = LOGO_PARTICLE_COUNT, seed = 0x5EED1234, variant = 'full') {
    if (!LOGO_SHAPE_NAMES.includes(name)) {
        throw new RangeError(`Unknown logo shape: ${name}`);
    }
    if (!Number.isInteger(count) || count < 32) {
        throw new RangeError('Logo particle count must be an integer of at least 32');
    }

    // Keep the original four figures' seeds stable when adding the brand shape.
    const shapeSeed = seed ^ ((name === 'fsp' ? 5 : LOGO_SHAPE_NAMES.indexOf(name)) * 0x9E3779B9);
    const random = createRandom(shapeSeed);
    if (name === 'fsp') return generateFsp(count, random, variant);
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
        const x = source.positions[sourceOffset], y = source.positions[sourceOffset + 1], z = source.positions[sourceOffset + 2];

        for (let targetIndex = 0; targetIndex < count; targetIndex++) {
            if (used[targetIndex]) continue;
            const targetOffset = targetIndex * 3;
            const dx = x - target.positions[targetOffset];
            const dy = y - target.positions[targetOffset + 1];
            const dz = z - target.positions[targetOffset + 2];
            const distance = dx * dx + dy * dy + dz * dz;
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = targetIndex;
            }
        }

        used[nearestIndex] = 1;
        const targetOffset = nearestIndex * 3;
        for (let axis = 0; axis < 3; axis++) {
            matched.positions[sourceOffset + axis] = target.positions[targetOffset + axis];
            matched.colors[sourceOffset + axis] = target.colors[targetOffset + axis];
        }
        matched.sizes[sourceIndex] = target.sizes[nearestIndex];
    }

    return matched;
}

export function buildLogoConnections(shape, neighboursPerParticle = 2, maxDistance = 0.42) {
    if (!Number.isInteger(neighboursPerParticle) || neighboursPerParticle < 0 || !Number.isFinite(maxDistance) || maxDistance < 0) {
        throw new RangeError('Logo connections need a non-negative neighbour count and finite distance');
    }
    if (shape.count > 65536) throw new RangeError('Logo connections exceed the 16-bit particle index limit');
    const pairs = [], seen = new Set(), positions = shape.positions, count = shape.count;
    const limit = Math.min(neighboursPerParticle, count - 1), maximum = maxDistance * maxDistance;
    if (limit <= 0) return new Uint16Array();
    // Reuse a small sorted shortlist instead of allocating a candidate object
    // for every nearby point. Ascending source indices break distance ties.
    const indices = new Uint32Array(limit), distances = new Float64Array(limit);
    for (let index = 0; index < count; index++) {
        const offset = index * 3, px = positions[offset], py = positions[offset + 1], pz = positions[offset + 2];
        let found = 0;
        for (let other = 0; other < count; other++) {
            if (other === index) continue;
            const target = other * 3;
            const dx = px - positions[target], dy = py - positions[target + 1], dz = pz - positions[target + 2];
            const distance = dx * dx + dy * dy + dz * dz;
            if (distance > maximum || (found === limit && distance >= distances[found - 1])) continue;
            let at = Math.min(found, limit - 1);
            while (at > 0 && distance < distances[at - 1]) {
                distances[at] = distances[at - 1]; indices[at] = indices[at - 1]; at--;
            }
            distances[at] = distance; indices[at] = other;
            found = Math.min(limit, found + 1);
        }
        for (let i = 0; i < found; i++) {
            const low = Math.min(index, indices[i]), high = Math.max(index, indices[i]), key = low * count + high;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push(low, high);
        }
    }
    return new Uint16Array(pairs);
}
