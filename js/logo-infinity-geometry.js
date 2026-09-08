import {
    INFINITY_PROFILE, getInfinityFrame, getInfinitySurfacePoint,
    getInfinityPathAngle, getInfinityColor, getInfinityOcclusion
} from './logo-infinity-surface.js?v=2026.09.07';

const templates = new WeakMap();

export function createInfinityGeometry(THREE) {
    if (!templates.has(THREE)) {
        const segments = 256, columns = INFINITY_PROFILE.length;
        const positions = [], normals = [], colors = [], paths = [], occlusion = [];
        const groups = { body: [], edge: [] }, color = new THREE.Color();
        // Duplicate the closing row so the flow coordinate can wrap from 1
        // to 0 without interpolating across the whole path at the seam.
        for (let row = 0; row <= segments; row++) {
            const fraction = row / segments, angle = getInfinityPathAngle(fraction), frame = getInfinityFrame(angle);
            color.setRGB(...getInfinityColor(angle), THREE.SRGBColorSpace);
            for (const profile of INFINITY_PROFILE) {
                const { point, normal } = getInfinitySurfacePoint(angle, profile, frame);
                positions.push(...point); normals.push(...normal); colors.push(...color.toArray());
                paths.push(fraction); occlusion.push(getInfinityOcclusion(angle, normal));
            }
        }
        for (let row = 0; row < segments; row++) for (let column = 0; column < columns; column++) {
            const next = (column + 1) % columns;
            const a = row*columns+column, b = (row+1)*columns+column, c = row*columns+next, d = (row+1)*columns+next;
            groups[INFINITY_PROFILE[column].part].push(a,c,b,b,c,d);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('aLogoPath', new THREE.Float32BufferAttribute(paths, 1));
        geometry.setAttribute('aLogoOcclusion', new THREE.Float32BufferAttribute(occlusion, 1));
        geometry.setIndex([...groups.body, ...groups.edge]);
        geometry.addGroup(0, groups.body.length, 0);
        geometry.addGroup(groups.body.length, groups.edge.length, 1);
        geometry.computeBoundingSphere();
        templates.set(THREE, geometry);
    }
    return templates.get(THREE).clone();
}
