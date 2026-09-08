import { prepareLogoMaterial } from './logo-materials.js?v=2026.09.07';
import { createGlobeGeometry } from './logo-globe-geometry.js?v=2026.09.07';
import { GLOBE_RADII, getGlobeColor, getGlobeOrbitPoint, getGlobePoint } from './logo-globe-surface.js?v=2026.09.07';

const TAU = Math.PI * 2;

function rememberCoreOpacity(material, opacity) {
    material.userData.logoOpacity = opacity;
    material.userData.logoEmissiveIntensity = material.emissiveIntensity ?? 0;
    material.opacity = 0;
    return material;
}

function createGlobeGraticule(THREE) {
    const vertices = [];
    const point = (longitude, latitude) => getGlobePoint(longitude, latitude, GLOBE_RADII.ocean + 0.001);
    for (let latitude = -60; latitude <= 60; latitude += 30) {
        for (let longitude = -180; longitude < 180; longitude += 2) {
            vertices.push(...point(longitude, latitude), ...point(longitude + 2, latitude));
        }
    }
    for (let longitude = -180; longitude < 180; longitude += 30) {
        for (let latitude = -90; latitude < 90; latitude += 2) {
            vertices.push(...point(longitude, latitude), ...point(longitude, latitude + 2));
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const line = new THREE.LineSegments(geometry, prepareLogoMaterial(new THREE.LineBasicMaterial({
        color: 0x8ac8d4, toneMapped: false
    }), 0.11));
    line.name = 'ocean-engraving';
    return line;
}

export function createGlobeCore(THREE) {
    const group = new THREE.Group();
    const oceanGeometry = new THREE.SphereGeometry(GLOBE_RADII.ocean, 80, 48);
    const oceanColors = [];
    const color = new THREE.Color();
    const position = oceanGeometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
        const latitude = Math.asin(Math.max(-1, Math.min(1, position.getY(i) / GLOBE_RADII.ocean))) * 180 / Math.PI;
        color.setRGB(...getGlobeColor(latitude, false), THREE.SRGBColorSpace).toArray(oceanColors, i * 3);
    }
    oceanGeometry.setAttribute('color', new THREE.Float32BufferAttribute(oceanColors, 3));
    const ocean = new THREE.Mesh(oceanGeometry, prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        vertexColors: true, metalness: 0.28, roughness: 0.34,
        clearcoat: 0.65, clearcoatRoughness: 0.28, envMapIntensity: 0.7
    })));
    ocean.name = 'enamel-ocean';
    const geometry = createGlobeGeometry(THREE);
    const land = new THREE.Mesh(geometry.land, prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        vertexColors: true, metalness: 0.16, roughness: 0.47,
        clearcoat: 0.32, clearcoatRoughness: 0.3, envMapIntensity: 0.55
    })));
    land.name = 'raised-continents';
    const cliffs = new THREE.Mesh(geometry.cliffs, prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        color: 0x08624a, metalness: 0.24, roughness: 0.42,
        clearcoat: 0.35, envMapIntensity: 0.55
    })));
    const coastline = new THREE.LineSegments(geometry.coastline, prepareLogoMaterial(new THREE.LineBasicMaterial({
        color: 0xa9e5cb, toneMapped: false
    }), 0.18));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(GLOBE_RADII.orbit, 0.009, 8, 160), prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        color: 0xe5c891, metalness: 0.7, roughness: 0.3, clearcoat: 0.3, envMapIntensity: 0.85
    })));
    const orbitalFrame = new THREE.Group();
    ring.rotation.x = 0.88;
    orbitalFrame.rotation.z = -0.38;
    orbitalFrame.add(ring);
    const satellite = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 12), prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        color: 0xf0dcb1, metalness: 0.64, roughness: 0.23, clearcoat: 0.6, envMapIntensity: 0.8
    })));
    satellite.name = 'orbital-bead';
    group.userData.animate = now => satellite.position.set(...getGlobeOrbitPoint(0.8 + now * 0.00018));
    group.userData.animate(0);
    group.add(ocean, land, cliffs, coastline, createGlobeGraticule(THREE), orbitalFrame, satellite);
    group.visible = false;
    return group;
}

export function createHeartCore(THREE) {
    const heart = new THREE.Shape();
    heart.moveTo(0, -1.08);
    heart.bezierCurveTo(-1.15, -0.34, -1.12, 0.48, -0.62, 0.72);
    heart.bezierCurveTo(-0.25, 0.9, 0, 0.64, 0, 0.37);
    heart.bezierCurveTo(0, 0.64, 0.25, 0.9, 0.62, 0.72);
    heart.bezierCurveTo(1.12, 0.48, 1.15, -0.34, 0, -1.08);

    const geometry = new THREE.ExtrudeGeometry(heart, {
        curveSegments: 24,
        steps: 1,
        depth: 0.42,
        bevelEnabled: true,
        bevelThickness: 0.12,
        bevelSize: 0.1,
        bevelSegments: 4
    });
    geometry.center();
    const material = rememberCoreOpacity(new THREE.MeshStandardMaterial({
        color: 0xd8143a,
        emissive: 0x5a0017,
        emissiveIntensity: 0.78,
        metalness: 0.16,
        roughness: 0.28,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    }), 0.28);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;

    const edgeMaterial = rememberCoreOpacity(new THREE.LineBasicMaterial({
        color: 0xff778f,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }), 0.36);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 22), edgeMaterial);
    edge.renderOrder = 2;

    const group = new THREE.Group();
    group.add(mesh, edge);
    group.scale.setScalar(0.92);
    group.position.y = -0.02;
    group.visible = false;
    return group;
}

export function createSummitCore(THREE) {
    const group = new THREE.Group();
    const mountainGeometry = new THREE.ConeGeometry(1.08, 1.9, 4, 1, false);
    const mountainMaterial = rememberCoreOpacity(new THREE.MeshStandardMaterial({
        color: 0x0a6c85,
        emissive: 0x053847,
        emissiveIntensity: 0.5,
        metalness: 0.2,
        roughness: 0.38,
        transparent: true,
        depthWrite: false,
        flatShading: true
    }), 0.17);
    const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
    mountain.position.y = 0.18;
    mountain.rotation.y = Math.PI / 4;
    mountain.renderOrder = 1;

    const ridgeMaterial = rememberCoreOpacity(new THREE.LineBasicMaterial({
        color: 0x6af5d3,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }), 0.3);
    const ridges = new THREE.LineSegments(new THREE.EdgesGeometry(mountainGeometry, 10), ridgeMaterial);
    ridges.position.copy(mountain.position);
    ridges.rotation.copy(mountain.rotation);
    ridges.renderOrder = 2;

    const snowGeometry = new THREE.ConeGeometry(0.33, 0.47, 4, 1, false);
    const snowMaterial = rememberCoreOpacity(new THREE.MeshStandardMaterial({
        color: 0xf2fff7,
        emissive: 0x5fd7ad,
        emissiveIntensity: 0.7,
        roughness: 0.3,
        transparent: true,
        depthWrite: false,
        flatShading: true
    }), 0.36);
    const snow = new THREE.Mesh(snowGeometry, snowMaterial);
    snow.position.y = 0.895;
    snow.rotation.y = Math.PI / 4;
    snow.renderOrder = 2;

    group.add(mountain, ridges, snow);
    group.visible = false;
    return group;
}

export function createInfinityCore(THREE) {
    class InfinityCurve extends THREE.Curve {
        getPoint(t, target = new THREE.Vector3()) {
            const angle = t * TAU;
            return target.set(
                1.23 * Math.sin(angle),
                0.56 * Math.sin(angle * 2),
                0.13 * Math.cos(angle * 2)
            );
        }
    }

    const geometry = new THREE.TubeGeometry(new InfinityCurve(), 112, 0.065, 8, true);
    const material = rememberCoreOpacity(new THREE.MeshStandardMaterial({
        color: 0x159fe7,
        emissive: 0x075c9a,
        emissiveIntensity: 0.9,
        metalness: 0.22,
        roughness: 0.24,
        transparent: true,
        depthWrite: false
    }), 0.24);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    const group = new THREE.Group();
    group.add(mesh);
    group.visible = false;
    return group;
}

