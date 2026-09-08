import { EARTH_LAND_POLYGONS } from '../assets/branding/earth-land-data.js?v=2026.09.09';

export { EARTH_LAND_POLYGONS };
export const GLOBE_RADII = Object.freeze({ ocean: 1.008, land: 1.034, orbit: 1.245 });
const RAD = Math.PI / 180;
const coastBounds = EARTH_LAND_POLYGONS.map(([outer]) => ({
    minX: Math.min(...outer.map(p => p[0])), maxX: Math.max(...outer.map(p => p[0])),
    minY: Math.min(...outer.map(p => p[1])), maxY: Math.max(...outer.map(p => p[1]))
}));

function insideRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

export function isGlobeLand(longitude, latitude) {
    const lon = ((longitude + 180) % 360 + 360) % 360 - 180;
    return EARTH_LAND_POLYGONS.some((rings, i) => {
        const box = coastBounds[i];
        return lon >= box.minX && lon <= box.maxX && latitude >= box.minY && latitude <= box.maxY
            && insideRing(lon, latitude, rings[0]) && !rings.slice(1).some(ring => insideRing(lon, latitude, ring));
    });
}

export function getGlobePoint(longitude, latitude, radius = 1) {
    const lon = longitude * RAD - 0.35, lat = latitude * RAD;
    return [radius * Math.cos(lat) * Math.sin(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.cos(lon)];
}

export function getGlobeColor(latitude, land) {
    if (land) {
        const ice = Math.max(0, Math.min(1, (Math.abs(latitude) - 56) / 22));
        return [0.18 + ice * 0.62, 0.64 + ice * 0.24, 0.46 + ice * 0.4];
    }
    const equator = Math.pow(Math.cos(latitude * RAD), 2);
    return [0.018 + equator * 0.01, 0.18 + equator * 0.16, 0.3 + equator * 0.12];
}

export function getGlobeOrbitPoint(angle) {
    const x = Math.cos(angle) * GLOBE_RADII.orbit;
    const y = Math.sin(angle) * GLOBE_RADII.orbit * Math.cos(0.88);
    const z = Math.sin(angle) * GLOBE_RADII.orbit * Math.sin(0.88);
    return [x * Math.cos(-0.38) - y * Math.sin(-0.38), x * Math.sin(-0.38) + y * Math.cos(-0.38), z];
}
