import { FSP_SHAPE_DATA } from '../assets/branding/fsp-shape-data.js?v=2026.09.07';
import { prepareLogoMaterial } from './logo-materials.js?v=2026.09.07';
import { FSP_BEVEL, FSP_GLOBE_PROFILES, getFspRelief } from './logo-surfaces.js?v=2026.09.07';

// Templates stay on the CPU. Each instance owns a disposable GPU geometry copy.
const geometryTemplates = new WeakMap();

function simplifyContour(ring, tolerance) {
    function simplify(points) {
        if (points.length < 3) return points;
        const [ax, ay] = points[0], [bx, by] = points.at(-1);
        const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2;
        let furthest = 0, distance = tolerance * tolerance;
        for (let i = 1; i < points.length - 1; i++) {
            const [x, y] = points[i];
            const t = lengthSquared ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / lengthSquared)) : 0;
            const candidate = (x - ax - (bx - ax) * t) ** 2 + (y - ay - (by - ay) * t) ** 2;
            if (candidate > distance) { furthest = i; distance = candidate; }
        }
        return furthest ? [...simplify(points.slice(0, furthest + 1)).slice(0, -1), ...simplify(points.slice(furthest))] : [points[0], points.at(-1)];
    }
    let opposite = 1, distance = 0;
    for (let i = 1; i < ring.length; i++) {
        const candidate = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
        if (candidate > distance) { opposite = i; distance = candidate; }
    }
    const result = [...simplify(ring.slice(0, opposite + 1)).slice(0, -1), ...simplify([...ring.slice(opposite), ring[0]]).slice(0, -1)];
    return result.length >= 3 ? result : ring;
}

function sculptFspGeometry(THREE, source, data, variant) {
    const position = source.getAttribute('position');
    const normal = source.getAttribute('normal');
    const groups = [[], []];
    const readVertex = index => [
        position.getX(index), position.getY(index), position.getZ(index),
        normal.getX(index), normal.getY(index), normal.getZ(index)
    ];
    function clip(polygon, axis, bound, above) {
        const result = [];
        for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i], b = polygon[(i + 1) % polygon.length];
            const aInside = above ? a[axis] >= bound : a[axis] <= bound;
            const bInside = above ? b[axis] >= bound : b[axis] <= bound;
            if (aInside) result.push(a);
            if (aInside !== bInside) {
                const t = (bound - a[axis]) / (b[axis] - a[axis]);
                result.push(a.map((value, index) => value + (b[index] - value) * t));
            }
        }
        return result;
    }
    function triangle(a, b, c, material) {
        const profile = FSP_GLOBE_PROFILES[variant];
        if (Math.max(a[0], b[0], c[0]) < profile.x - profile.radius
            || Math.min(a[0], b[0], c[0]) > profile.x + profile.radius
            || Math.max(a[1], b[1], c[1]) < profile.y - profile.radius
            || Math.min(a[1], b[1], c[1]) > profile.y + profile.radius) {
            groups[material].push(a, b, c);
            return;
        }
        // Clip every face to the same grid before bending. Adjacent triangles
        // then share edge samples, preventing cracks in the curved relief.
        const grid = 0.12;
        const minX = Math.floor(Math.min(a[0], b[0], c[0]) / grid);
        const maxX = Math.floor(Math.max(a[0], b[0], c[0]) / grid);
        for (let x = minX; x <= maxX; x++) {
            const strip = clip(clip([a, b, c], 0, x * grid, true), 0, (x + 1) * grid, false);
            if (strip.length < 3) continue;
            const minY = Math.floor(Math.min(...strip.map(vertex => vertex[1])) / grid);
            const maxY = Math.floor(Math.max(...strip.map(vertex => vertex[1])) / grid);
            for (let y = minY; y <= maxY; y++) {
                const cell = clip(clip(strip, 1, y * grid, true), 1, (y + 1) * grid, false);
                for (let i = 1; i < cell.length - 1; i++) {
                    const [p, q, r] = [cell[0], cell[i], cell[i + 1]];
                    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
                    const v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
                    const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
                    if (area > 1e-12) groups[material].push(p, q, r);
                }
            }
        }
    }
    for (const group of source.groups) {
        for (let i = group.start; i < group.start + group.count; i += 3) {
            triangle(readVertex(i), readVertex(i + 1), readVertex(i + 2), group.materialIndex);
        }
    }
    const vertices = groups.flat();
    const positions = new Float32Array(vertices.length * 3);
    const normals = new Float32Array(vertices.length * 3);
    const uvs = new Float32Array(vertices.length * 2);
    const colors = new Float32Array(vertices.length * 3);
    const color = new THREE.Color();
    const normalScratch = new THREE.Vector3();
    const colorCache = new Map();
    const edgeSamples = [];
    for (let p = 0; p < data.samples.length; p += 5) {
        const r = data.samples[p + 2], g = data.samples[p + 3], b = data.samples[p + 4];
        if (Math.max(r, g, b) - Math.min(r, g, b) >= 0.18) edgeSamples.push(...data.samples.slice(p, p + 5));
    }
    vertices.forEach(([x, y, z, nx, ny, nz], i) => {
        const relief = getFspRelief(x, y, variant);
        const halfDepth = (data.depth + FSP_BEVEL.depth) / 2 + FSP_BEVEL.thickness;
        const side = z / halfDepth;
        const depthScale = 1 + relief.height / halfDepth;
        positions.set([x, y, z + side * relief.height], i * 3);
        normalScratch.set(nx * depthScale - side * relief.dx * nz, ny * depthScale - side * relief.dy * nz, nz).normalize();
        normalScratch.toArray(normals, i * 3);
        uvs.set([x / data.width + 0.5, y / data.height + 0.5], i * 2);
        if (i < groups[0].length) { colors.set([1, 1, 1], i * 3); return; }
        const key = `${x.toFixed(4)},${y.toFixed(4)}`;
        if (!colorCache.has(key)) {
            let closest = 0, distance = Infinity;
            for (let p = 0; p < edgeSamples.length; p += 5) {
                // White belongs to the ocean face. The cut edge follows the
                // green/blue enamel rim rather than picking a nearby ocean pixel.
                const candidate = (x - edgeSamples[p]) ** 2 + (y - edgeSamples[p + 1]) ** 2;
                if (candidate < distance) { distance = candidate; closest = p; }
            }
            const green = edgeSamples[closest + 3] > edgeSamples[closest + 4] * 1.1;
            // One pigment per component avoids painting the photograph's
            // baked highlights onto a second, independently lit sidewall.
            color.set(green ? 0x066c36 : variant === 'compact' || y > -0.035 ? 0x0877a6 : 0x054572);
            colorCache.set(key, color.toArray());
        }
        colors.set(colorCache.get(key), i * 3);
    });
    const edgeNormals = new Map();
    for (let i = groups[0].length; i < vertices.length; i++) {
        const offset = i * 3;
        const key = `${Math.round(positions[offset] * 1e5)},${Math.round(positions[offset + 1] * 1e5)},${Math.round(positions[offset + 2] * 1e5)}`;
        if (!edgeNormals.has(key)) edgeNormals.set(key, { indices: [], directions: new Map() });
        const bucket = edgeNormals.get(key);
        const nx = normals[offset], ny = normals[offset + 1], nz = normals[offset + 2];
        const directionKey = `${Math.round(nx * 1e4)},${Math.round(ny * 1e4)},${Math.round(nz * 1e4)}`;
        bucket.indices.push(i);
        if (!bucket.directions.has(directionKey)) bucket.directions.set(directionKey, [nx, ny, nz]);
    }
    for (const { indices, directions } of edgeNormals.values()) {
        for (const index of indices) {
            const [nx, ny, nz] = normals.subarray(index * 3, index * 3 + 3);
            normalScratch.set(0, 0, 0);
            for (const [x, y, z] of directions.values()) {
                if (nx * x + ny * y + nz * z > 0.65) {
                    normalScratch.x += x; normalScratch.y += y; normalScratch.z += z;
                }
            }
            normalScratch.normalize().toArray(normals, index * 3);
        }
    }
    // Weld equal vertices after shaping and normal smoothing. The relief has
    // many shared grid edges; indexing keeps their GPU cost small in the rail.
    const unique = new Map(), indices = [];
    const packed = { position: [], normal: [], uv: [], color: [] };
    for (let i = 0; i < vertices.length; i++) {
        const offset = i * 3;
        const key = `${Math.round(positions[offset] * 1e5)},${Math.round(positions[offset + 1] * 1e5)},${Math.round(positions[offset + 2] * 1e5)},`
            + `${Math.round(normals[offset] * 1e5)},${Math.round(normals[offset + 1] * 1e5)},${Math.round(normals[offset + 2] * 1e5)},`
            + `${Math.round(colors[offset] * 1e5)},${Math.round(colors[offset + 1] * 1e5)},${Math.round(colors[offset + 2] * 1e5)}`;
        if (!unique.has(key)) {
            unique.set(key, unique.size);
            packed.position.push(...positions.subarray(i * 3, i * 3 + 3));
            packed.normal.push(...normals.subarray(i * 3, i * 3 + 3));
            packed.uv.push(...uvs.subarray(i * 2, i * 2 + 2));
            packed.color.push(...colors.subarray(i * 3, i * 3 + 3));
        }
        indices.push(unique.get(key));
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, values] of Object.entries(packed)) {
        geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, name === 'uv' ? 2 : 3));
    }
    geometry.setIndex(indices);
    geometry.addGroup(0, groups[0].length, 0);
    geometry.addGroup(groups[0].length, groups[1].length, 1);
    source.dispose();
    return geometry;
}

function createFspFaceMaterial(THREE, texture) {
    const material = prepareLogoMaterial(new THREE.MeshBasicMaterial({
        map: texture, alphaTest: 0.04, toneMapped: false
    }));
    const compileDissolve = material.onBeforeCompile;
    material.onBeforeCompile = shader => {
        compileDissolve(shader);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vFspNormal;\nvarying vec3 vFspView;')
            .replace('#include <project_vertex>', `
                #include <project_vertex>
                vFspNormal = normalize(normalMatrix * normal);
                vFspView = -mvPosition.xyz;
            `);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vFspNormal;\nvarying vec3 vFspView;')
            .replace('#include <opaque_fragment>', `
                vec3 reliefNormal = normalize(vFspNormal);
                vec3 reliefView = normalize(vFspView);
                vec3 reliefLight = normalize(vec3(-0.45, 0.65, 1.0));
                float reliefShade = 0.92 + 0.08 * max(dot(reliefNormal, reliefLight), 0.0);
                float reliefGleam = pow(max(dot(reliefNormal, normalize(reliefLight + reliefView)), 0.0), 52.0);
                outgoingLight = outgoingLight * reliefShade + vec3(0.012) * reliefGleam;
                #include <opaque_fragment>
            `);
    };
    material.customProgramCacheKey = () => 'sherpa-fsp-relief-v1';
    return material;
}

function createVariantGeometry(THREE, data, variant) {
    const shapes = data.contours.map(contour => {
        const shape = new THREE.Shape(simplifyContour(contour.outline, 0.0045).map(([x, y]) => new THREE.Vector2(x, y)));
        shape.holes = contour.holes.map(ring => new THREE.Path(simplifyContour(ring, 0.002).map(([x, y]) => new THREE.Vector2(x, y))));
        return shape;
    });
    const extrusion = new THREE.ExtrudeGeometry(shapes, {
        depth: data.depth + FSP_BEVEL.depth, steps: 1, curveSegments: 1,
        bevelEnabled: true, bevelSize: FSP_BEVEL.size, bevelOffset: -FSP_BEVEL.size,
        bevelThickness: FSP_BEVEL.thickness, bevelSegments: 3
    });
    extrusion.translate(0, 0, -(data.depth + FSP_BEVEL.depth) / 2);
    return sculptFspGeometry(THREE, extrusion, data, variant);
}

function createVariant(THREE, data, texture, variant) {
    if (!geometryTemplates.has(THREE)) geometryTemplates.set(THREE, new Map());
    const templates = geometryTemplates.get(THREE);
    if (!templates.has(variant)) templates.set(variant, createVariantGeometry(THREE, data, variant));
    const geometry = templates.get(variant).clone();
    const face = createFspFaceMaterial(THREE, texture);
    const edge = prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        vertexColors: true, roughness: 0.46, metalness: 0.18,
        clearcoat: 0.2, clearcoatRoughness: 0.3, envMapIntensity: 0.28
    }));
    const mesh = new THREE.Mesh(geometry, [face, edge]);
    mesh.renderOrder = 1;
    return mesh;
}

/** A cutout with actual side walls, never a rectangular textured plane. */
export function createFspCore(THREE, textures) {
    const group = new THREE.Group();
    const variants = Object.fromEntries(Object.entries(FSP_SHAPE_DATA).map(([name, data]) => [
        name, createVariant(THREE, data, textures[name], name)
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
