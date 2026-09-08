// Rebuild with the ne_110m_land.shp from Natural Earth's public-domain 110m land ZIP.
// Source: https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/
// Archive: https://naciscdn.org/naturalearth/110m/physical/ne_110m_land.zip
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

if (!process.argv[2]) throw new Error('Usage: node scripts/build-logo-earth-data.mjs path/to/ne_110m_land.shp');
const bytes = await readFile(process.argv[2]);
if (bytes.readInt32BE(0) !== 9994 || bytes.readInt32LE(32) !== 5) throw new Error('Expected a polygon Shapefile');
const signedArea = ring => ring.reduce((area, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return area + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;
const polygons = [];
for (let offset = 100; offset < bytes.length;) {
    const length = bytes.readInt32BE(offset + 4) * 2;
    const record = bytes.subarray(offset + 8, offset + 8 + length);
    offset += length + 8;
    if (record.readInt32LE(0) !== 5) continue;
    const parts = record.readInt32LE(36), count = record.readInt32LE(40);
    const pointsOffset = 44 + parts * 4;
    let polygon;
    for (let part = 0; part < parts; part++) {
        const start = record.readInt32LE(44 + part * 4);
        const end = part + 1 < parts ? record.readInt32LE(48 + part * 4) : count;
        const ring = [];
        for (let i = start; i < end; i++) {
            const lon = Math.round(record.readDoubleLE(pointsOffset + i * 16) * 10) / 10;
            const lat = Math.round(record.readDoubleLE(pointsOffset + i * 16 + 8) * 10) / 10;
            if (Math.abs(lon) > 180.001 || Math.abs(lat) > 90.001) throw new Error('Invalid geographic coordinates');
            if (!ring.length || ring.at(-1)[0] !== lon || ring.at(-1)[1] !== lat) ring.push([lon, lat]);
        }
        if (ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1]) ring.pop();
        // Triangulation omits collinear contour points. Remove them here too,
        // so the spherical top and its raised coastline use identical edges.
        let simplified = true;
        while (simplified && ring.length > 3) {
            simplified = false;
            for (let i = ring.length - 1; i >= 0 && ring.length > 3; i--) {
                const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
                const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
                const between = (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]) <= 0;
                if (Math.abs(cross) < 1e-9 && between) {
                    ring.splice(i, 1);
                    simplified = true;
                }
            }
        }
        if (ring.length < 3) continue;
        const area = signedArea(ring);
        if (area < 0) {
            polygon = [ring.reverse()];
            polygons.push(polygon);
        } else if (polygon) polygon.push(ring.reverse());
        else throw new Error('Interior ring appeared before its exterior');
    }
}
const hash = createHash('sha256').update(bytes).digest('hex');
const source = `// Natural Earth 110m land, public domain; rounded to 0.1 degrees for a small sculptural globe.\n`
    + `// https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/\n`
    + `// Terms: https://www.naturalearthdata.com/about/terms-of-use/\n`
    + `// Source SHP SHA-256: ${hash}\n`
    + `// Regenerate with scripts/build-logo-earth-data.mjs and the original Shapefile.\n`
    + `export const EARTH_LAND_POLYGONS = ${JSON.stringify(polygons)};\n`;
await writeFile(new URL('../assets/branding/earth-land-data.js', import.meta.url), source);
console.log(JSON.stringify({polygons:polygons.length, rings:polygons.flat().length, points:polygons.flat(2).length, bytes:Buffer.byteLength(source), sourceSha256:hash}));
