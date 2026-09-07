import { FSP_SHAPE_DATA } from '../assets/branding/fsp-shape-data.js?v=2026.09.07';

function createVariant(THREE, data, texture) {
    const shapes = data.contours.map(contour => {
        const shape = new THREE.Shape(contour.outline.map(([x, y]) => new THREE.Vector2(x, y)));
        shape.holes = contour.holes.map(ring => new THREE.Path(ring.map(([x, y]) => new THREE.Vector2(x, y))));
        return shape;
    });
    const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: data.depth, bevelEnabled: false, steps: 1, curveSegments: 1
    });
    geometry.translate(0, 0, -data.depth / 2);
    const positions = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color(), colorCache = new Map();
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i);
        uv.setXY(i, x / data.width + 0.5, y / data.height + 0.5);
        const key = `${x.toFixed(5)},${y.toFixed(5)}`;
        if (!colorCache.has(key)) {
            let closest = 0, distance = Infinity;
            for (let p = 0; p < data.samples.length; p += 5) {
                const candidate = (x - data.samples[p]) ** 2 + (y - data.samples[p + 1]) ** 2;
                if (candidate < distance) { distance = candidate; closest = p; }
            }
            color.setRGB(...data.samples.slice(closest + 2, closest + 5), THREE.SRGBColorSpace);
            colorCache.set(key, color.toArray());
        }
        colors.set(colorCache.get(key), i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const face = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, opacity: 0, alphaTest: 0.04,
        depthWrite: false, toneMapped: false
    });
    const edge = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.42, metalness: 0.16,
        transparent: true, opacity: 0, depthWrite: false
    });
    face.userData.logoOpacity = 1;
    edge.userData.logoOpacity = 1;
    const mesh = new THREE.Mesh(geometry, [face, edge]);
    mesh.renderOrder = 1;
    return mesh;
}

/** A cutout with actual side walls, never a rectangular textured plane. */
export function createFspCore(THREE, textures) {
    const group = new THREE.Group();
    const variants = Object.fromEntries(Object.entries(FSP_SHAPE_DATA).map(([name, data]) => [
        name, createVariant(THREE, data, textures[name])
    ]));
    group.add(...Object.values(variants));
    group.userData.variants = variants;
    group.visible = false;
    return group;
}

export async function loadFspTextures(THREE) {
    const loader = new THREE.TextureLoader();
    const textures = {};
    try {
        for (const [name, filename] of Object.entries({ full: 'fsp-global-still.webp', compact: 'fsp-global-compact-still.webp' })) {
            const texture = await loader.loadAsync(new URL(`../assets/branding/${filename}?v=20260906.3`, import.meta.url).href);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            textures[name] = texture;
        }
        return textures;
    } catch (error) {
        Object.values(textures).forEach(texture => texture.dispose());
        throw error;
    }
}
