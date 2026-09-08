import { prepareLogoMaterial } from './logo-materials.js?v=2026.09.09';
import { createGlobeGeometry } from './logo-globe-geometry.js?v=2026.09.09';
import { createHeartGeometry, createHeartInlayGeometry } from './logo-heart-geometry.js?v=2026.09.09';
import { getSummitRoutePoint, getSummitAscentState } from './logo-summit-surface.js?v=2026.09.09';
import { createSummitGeometry } from './logo-summit-geometry.js?v=2026.09.09';
import { GLOBE_RADII, getGlobeColor, getGlobeOrbitPoint, getGlobePoint } from './logo-globe-surface.js?v=2026.09.09';

import { createInfinityGeometry } from './logo-infinity-geometry.js?v=2026.09.09';
import { createInfinityMaterials } from './logo-infinity-material.js?v=2026.09.09';

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
    const group = new THREE.Group();
    const material = prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        vertexColors: true, metalness: 0.3, roughness: 0.35, specularIntensity: 0.7,
        clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.4,
        emissive: 0x310009, emissiveIntensity: 0.1
    }));
    const heart = new THREE.Mesh(createHeartGeometry(THREE), material);
    heart.name = 'ruby-heart';
    const inlay = new THREE.Mesh(createHeartInlayGeometry(THREE), prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        color: 0xe1b881, metalness: 0.72, roughness: 0.3,
        clearcoat: 0.25, envMapIntensity: 0.65, emissive: 0x2a0d04, emissiveIntensity: 0.04
    })));
    inlay.name = 'pulse-inlay';
    group.add(heart, inlay);
    group.visible = false;
    return group;
}
export function createSummitCore(THREE) {
    const group = new THREE.Group();
    const geometry = createSummitGeometry(THREE);
    const rock = new THREE.Mesh(geometry.rock, prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        vertexColors: true, metalness: 0.28, roughness: 0.4,
        clearcoat: 0.4, clearcoatRoughness: 0.32, envMapIntensity: 0.6
    })));
    rock.name = 'alpine-rock';
    const snow = new THREE.Mesh(geometry.snow, prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        vertexColors: true, metalness: 0.06, roughness: 0.53,
        clearcoat: 0.28, clearcoatRoughness: 0.3, envMapIntensity: 0.45
    })));
    snow.name = 'glacial-snow';
    const route = new THREE.Mesh(geometry.route, prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        color: 0xdcb67b, metalness: 0.74, roughness: 0.3, clearcoat: 0.25, envMapIntensity: 0.7
    })));
    route.name = 'golden-ascent';
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.023, 16, 10), prepareLogoMaterial(new THREE.MeshPhysicalMaterial({
        color: 0xf1d49a, metalness: 0.58, roughness: 0.26, clearcoat: 0.4,
        envMapIntensity: 0.8, emissive: 0x80541a, emissiveIntensity: 0.18
    })));
    beacon.name = 'ascent-beacon';
    group.userData.animate = (now, { age = now, reducedMotion = false } = {}) => {
        const { progress, strength } = getSummitAscentState(age, reducedMotion);
        const [x, y, z] = getSummitRoutePoint(progress);
        beacon.position.set(x, y, z + 0.014);
        beacon.scale.setScalar(strength);
        beacon.visible = strength > 0.002;
    };
    group.userData.animate(0);
    group.add(rock, snow, route, beacon);
    group.visible = false;
    return group;
}

export function createInfinityCore(THREE) {
    const group = new THREE.Group();
    const { materials, animate } = createInfinityMaterials(THREE);
    const ribbon = new THREE.Mesh(createInfinityGeometry(THREE), materials);
    ribbon.name = 'continuous-ribbon';
    group.add(ribbon);
    group.userData.animate = animate;
    group.visible = false;
    return group;
}
