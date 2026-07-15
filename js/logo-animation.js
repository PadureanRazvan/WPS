import {
    LOGO_PARTICLE_COUNT,
    LOGO_SHAPE_NAMES,
    buildLogoConnections,
    createLogoShape,
    matchLogoShape
} from './logo-shapes.js?v=2026.07.15.11';

const TAU = Math.PI * 2;
const HEART_REVEAL_ANGLE = 0.48;
const SUMMIT_REVEAL_ANGLE = 0.36;
const MORPH_DURATION = 1900;
const HOLD_DURATIONS = Object.freeze({
    globe: 4300,
    heart: 5400,
    summit: 4300,
    infinity: 5000
});
const THREE_MODULE_URL = new URL('../assets/vendor/three.module.min.js', import.meta.url).href;
const instances = new WeakMap();
let threeModulePromise = null;

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
}

function smootherstep(value) {
    const t = clamp01(value);
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function nearestEquivalentAngle(current, baseAngle) {
    return Math.round((current - baseAngle) / TAU) * TAU + baseAngle;
}

export function getLogoMotion({
    rotY = 0,
    dt = 0,
    now = 0,
    shapeName,
    globeFactor = 0,
    heartFactor = 0
} = {}) {
    const resolvedShape = shapeName || (heartFactor > 0.08 ? 'heart' : globeFactor > 0.5 ? 'globe' : 'infinity');
    const heartPresence = resolvedShape === 'heart' ? smoothstep(Math.max(heartFactor, 1)) : smoothstep(heartFactor);

    if (heartPresence > 0.01) {
        const reveal = HEART_REVEAL_ANGLE + Math.sin(now * 0.00068) * 0.17;
        const target = nearestEquivalentAngle(rotY, reveal);
        const rate = 4.6 + heartPresence * 2.8;
        const nextRotY = rotY + (target - rotY) * (1 - Math.exp(-dt * rate));
        return {
            rotY: nextRotY,
            displayRotY: nextRotY + Math.sin(now * 0.00115) * 0.045 * heartPresence,
            rotX: 0.08 + Math.sin(now * 0.00082) * 0.055,
            rotZ: Math.sin(now * 0.00054) * 0.035,
            heartPresence
        };
    }

    if (resolvedShape === 'infinity') {
        const target = nearestEquivalentAngle(rotY, 0);
        const nextRotY = rotY + (target - rotY) * (1 - Math.exp(-dt * 3.4));
        return {
            rotY: nextRotY,
            displayRotY: nextRotY + Math.sin(now * 0.00062) * 0.14,
            rotX: 0.08 + Math.sin(now * 0.00044) * 0.04,
            rotZ: Math.sin(now * 0.00038) * 0.055,
            heartPresence: 0
        };
    }

    if (resolvedShape === 'summit') {
        const reveal = SUMMIT_REVEAL_ANGLE + Math.sin(now * 0.00034) * 0.055;
        const target = nearestEquivalentAngle(rotY, reveal);
        const nextRotY = rotY + (target - rotY) * (1 - Math.exp(-dt * 3.1));
        return {
            rotY: nextRotY,
            displayRotY: nextRotY + Math.sin(now * 0.00051) * 0.025,
            rotX: 0.17 + Math.sin(now * 0.00038) * 0.035,
            rotZ: Math.sin(now * 0.00029) * 0.022,
            heartPresence: 0
        };
    }

    const speed = resolvedShape === 'globe' ? 0.22 : 0.3;
    const nextRotY = rotY + dt * speed;
    return {
        rotY: nextRotY,
        displayRotY: nextRotY,
        rotX: 0.2 + Math.sin(now * 0.0003) * 0.07,
        rotZ: 0,
        heartPresence: 0
    };
}

export function getHeartBeatScale(now = 0) {
    const phase = ((now % 1600) + 1600) % 1600 / 1600;
    const wrappedDistance = center => {
        const direct = Math.abs(phase - center);
        return Math.min(direct, 1 - direct);
    };
    const firstBeat = Math.exp(-Math.pow(wrappedDistance(0.08) / 0.045, 2)) * 0.055;
    const secondBeat = Math.exp(-Math.pow(wrappedDistance(0.24) / 0.06, 2)) * 0.032;
    return 1 + firstBeat + secondBeat;
}

export function getInterfacePulseScale(age = Infinity) {
    if (!Number.isFinite(age) || age < 0 || age > 900) return 1;
    return 1 + Math.sin(age / 900 * Math.PI) * 0.045;
}

export function getLogoShapePresence(shapeName, currentName, targetName = null, progress = 0) {
    if (!targetName || currentName === targetName) return shapeName === currentName ? 1 : 0;
    const amount = smootherstep(progress);
    if (shapeName === currentName) return 1 - amount;
    if (shapeName === targetName) return amount;
    return 0;
}

function loadThree() {
    if (!threeModulePromise) threeModulePromise = import(THREE_MODULE_URL);
    return threeModulePromise;
}

function createGlowTexture(THREE) {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 128;
    textureCanvas.height = 128;
    const context = textureCanvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.48)');
    gradient.addColorStop(0.28, 'rgba(255,255,255,0.16)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function createOrbit(THREE, radius = 1.31) {
    const vertices = [];
    for (let index = 0; index < 96; index++) {
        const angle = index / 96 * TAU;
        vertices.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
    const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const orbit = new THREE.LineLoop(geometry, material);
    orbit.rotation.x = Math.PI * 0.52;
    orbit.rotation.z = Math.PI * 0.08;
    return orbit;
}

function rememberCoreOpacity(material, opacity) {
    material.userData.logoOpacity = opacity;
    material.userData.logoEmissiveIntensity = material.emissiveIntensity ?? 0;
    material.opacity = 0;
    return material;
}

function createCircleLine(THREE, radius, material) {
    const vertices = [];
    for (let index = 0; index < 72; index++) {
        const angle = index / 72 * TAU;
        vertices.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
    }
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(vertices), material);
}

function createGlobeCore(THREE) {
    const group = new THREE.Group();
    const sphereMaterial = rememberCoreOpacity(new THREE.MeshStandardMaterial({
        color: 0x087ccc,
        emissive: 0x032d4f,
        emissiveIntensity: 0.45,
        metalness: 0.08,
        roughness: 0.48,
        transparent: true,
        depthWrite: false
    }), 0.075);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.015, 24, 16), sphereMaterial);
    sphere.renderOrder = 1;
    group.add(sphere);

    const ringMaterial = rememberCoreOpacity(new THREE.LineBasicMaterial({
        color: 0x6ff7bd,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }), 0.13);
    const equator = createCircleLine(THREE, 1.035, ringMaterial);
    equator.rotation.x = Math.PI / 2;
    const meridian = createCircleLine(THREE, 1.035, ringMaterial);
    const crossMeridian = createCircleLine(THREE, 1.035, ringMaterial);
    crossMeridian.rotation.y = Math.PI / 2;
    group.add(equator, meridian, crossMeridian);
    group.visible = false;
    return group;
}

function createHeartCore(THREE) {
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

function createSummitCore(THREE) {
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

function createInfinityCore(THREE) {
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

function setCorePresence(core, presence, energy = 0) {
    const amount = smootherstep(presence);
    core.visible = amount > 0.004;
    if (!core.visible) return;
    core.traverse(object => {
        if (!object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            material.opacity = (material.userData.logoOpacity ?? 0) * amount;
            if ('emissiveIntensity' in material) {
                material.emissiveIntensity = (material.userData.logoEmissiveIntensity ?? 0) + energy;
            }
        }
    });
}

function disposeCore(core) {
    const geometries = new Set();
    const materials = new Set();
    core.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (!object.material) return;
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.forEach(material => materials.add(material));
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
}

function createPointMaterial(THREE, pixelRatio) {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        toneMapped: false,
        uniforms: {
            uTime: { value: 0 },
            uPixelRatio: { value: pixelRatio },
            uBreath: { value: 0.55 }
        },
        vertexShader: `
            uniform float uTime;
            uniform float uPixelRatio;
            uniform float uBreath;
            attribute float aSize;
            attribute float aSeed;
            varying vec3 vColor;
            varying float vAlpha;

            void main() {
                float shimmer = sin(uTime * 1.35 + aSeed * 6.2831853);
                vec3 animatedPosition = position * (1.0 + shimmer * 0.012 * uBreath);
                vec4 viewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
                gl_Position = projectionMatrix * viewPosition;
                gl_PointSize = clamp(aSize * uPixelRatio * (7.15 / max(1.0, -viewPosition.z)), 1.1, 8.5);
                float depthLight = clamp((viewPosition.z + 5.9) / 1.7, 0.0, 1.0);
                vColor = color * (0.82 + depthLight * 0.46);
                vAlpha = 0.76 + shimmer * 0.14;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vAlpha;

            void main() {
                float distanceToCenter = length(gl_PointCoord - vec2(0.5));
                if (distanceToCenter > 0.5) discard;
                float edge = 1.0 - smoothstep(0.18, 0.5, distanceToCenter);
                float core = 1.0 - smoothstep(0.0, 0.17, distanceToCenter);
                vec3 luminousColor = vColor + core * vec3(0.24);
                gl_FragColor = vec4(luminousColor, edge * vAlpha);
            }
        `
    });
}

function setCanvasAccessibility(canvas, shapeName) {
    const readableShape = shapeName === 'summit' ? 'mountain summit' : shapeName === 'infinity' ? 'infinity ribbon' : shapeName;
    canvas.setAttribute('role', 'button');
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('aria-label', `Sherpa animated ${readableShape}. Activate to show the next shape.`);
}

function drawFallbackLogo(canvas, size) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    const center = size / 2;
    const radius = size * 0.27;
    const glow = context.createRadialGradient(center, center, 2, center, center, radius * 1.5);
    glow.addColorStop(0, 'rgba(76, 220, 138, 0.38)');
    glow.addColorStop(1, 'rgba(76, 220, 138, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);
    context.strokeStyle = '#4cdd8a';
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(center, center, radius, 0, TAU);
    context.stroke();
    canvas.dataset.logoRenderer = 'fallback';
    canvas.dataset.logoShape = 'globe';
    setCanvasAccessibility(canvas, 'globe');
}

function createLogoScene(THREE, canvas, size) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'low-power'
    });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.z = 5.25;

    const shapeSeed = 0x51E2A + size * 97;
    const shapes = Object.fromEntries(LOGO_SHAPE_NAMES.map((name, index) => [
        name,
        createLogoShape(name, LOGO_PARTICLE_COUNT, shapeSeed + index * 701)
    ]));
    let currentIndex = reducedMotion ? 1 : 0;
    let currentShape = shapes[LOGO_SHAPE_NAMES[currentIndex]];

    const positions = currentShape.positions.slice();
    const colors = currentShape.colors.slice();
    const sizes = currentShape.sizes.slice();
    const seeds = new Float32Array(LOGO_PARTICLE_COUNT);
    for (let index = 0; index < seeds.length; index++) {
        seeds[index] = ((index * 16807 + 17) % 2147483647) / 2147483647;
    }

    const pointGeometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const colorAttribute = new THREE.BufferAttribute(colors, 3);
    const sizeAttribute = new THREE.BufferAttribute(sizes, 1);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    sizeAttribute.setUsage(THREE.DynamicDrawUsage);
    pointGeometry.setAttribute('position', positionAttribute);
    pointGeometry.setAttribute('color', colorAttribute);
    pointGeometry.setAttribute('aSize', sizeAttribute);
    pointGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const pointMaterial = createPointMaterial(THREE, pixelRatio);
    const points = new THREE.Points(pointGeometry, pointMaterial);
    points.renderOrder = 2;

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', positionAttribute);
    lineGeometry.setAttribute('color', colorAttribute);
    lineGeometry.setIndex(new THREE.BufferAttribute(buildLogoConnections(currentShape), 1));
    const lineMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: currentShape.lineOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    lines.renderOrder = 1;

    const glowMaterial = new THREE.SpriteMaterial({
        map: createGlowTexture(THREE),
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.setScalar(3.25);
    glow.position.z = -0.9;
    glow.renderOrder = 0;

    const orbit = createOrbit(THREE);
    const cores = {
        globe: createGlobeCore(THREE),
        heart: createHeartCore(THREE),
        summit: createSummitCore(THREE),
        infinity: createInfinityCore(THREE)
    };
    const coreRoot = new THREE.Group();
    coreRoot.add(...Object.values(cores));
    const root = new THREE.Group();
    root.add(glow, orbit, coreRoot, lines, points);
    scene.add(root);
    scene.add(new THREE.AmbientLight(0xe4f8ff, 1.35));
    const keyLight = new THREE.DirectionalLight(0xfff4ed, 3.6);
    keyLight.position.set(2.5, 3.2, 4.5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x49aaff, 1.8);
    rimLight.position.set(-3, -1.5, -2);
    scene.add(rimLight);

    const colorScratch = new THREE.Color();
    const pointerTarget = { x: 0, y: 0 };
    const pointerCurrent = { x: 0, y: 0 };
    let transition = null;
    let holdStartedAt = performance.now();
    let rotY = 0;
    let lastTime = performance.now();
    let visible = true;
    let running = true;
    let frameId = 0;
    let interactionPulseStartedAt = -Infinity;

    function applyGlow(glowColor, orbitOpacity, transitionAmount = 0) {
        colorScratch.setRGB(glowColor[0], glowColor[1], glowColor[2]);
        glowMaterial.color.copy(colorScratch);
        orbit.material.color.copy(colorScratch);
        const darkTheme = ['dark', 'aurora'].includes(document.documentElement.getAttribute('data-theme'))
            || document.body.classList.contains('dark-theme');
        glowMaterial.opacity = (darkTheme ? 0.24 : 0.15) * (1 - transitionAmount * 0.22);
        orbit.material.opacity = orbitOpacity * (1 - transitionAmount * 0.7);
    }

    function completeTransition(now) {
        currentIndex = transition.nextIndex;
        currentShape = transition.target;
        positions.set(transition.target.positions);
        colors.set(transition.target.colors);
        sizes.set(transition.target.sizes);
        transition = null;
        holdStartedAt = now;
        canvas.dataset.logoShape = currentShape.name;
        setCanvasAccessibility(canvas, currentShape.name);
    }

    function beginMorph(now = performance.now()) {
        if (!Number.isFinite(now)) now = performance.now();
        if (transition) return;
        const nextIndex = (currentIndex + 1) % LOGO_SHAPE_NAMES.length;
        const nextName = LOGO_SHAPE_NAMES[nextIndex];
        const source = { count: LOGO_PARTICLE_COUNT, positions };
        const target = matchLogoShape(source, shapes[nextName]);
        transition = {
            nextIndex,
            target,
            startedAt: now,
            duration: reducedMotion ? 1 : MORPH_DURATION,
            fromPositions: positions.slice(),
            fromColors: colors.slice(),
            fromSizes: sizes.slice(),
            fromGlow: [...currentShape.glow],
            fromOrbitOpacity: currentShape.orbitOpacity,
            fromLineOpacity: currentShape.lineOpacity
        };
        lineGeometry.setIndex(new THREE.BufferAttribute(buildLogoConnections(target), 1));
        canvas.dataset.logoShape = `${currentShape.name}-to-${nextName}`;
    }

    function updateMorph(now) {
        if (!transition) return 0;
        const progress = clamp01((now - transition.startedAt) / transition.duration);
        const wave = Math.sin(progress * Math.PI);

        for (let index = 0; index < LOGO_PARTICLE_COUNT; index++) {
            const offset = index * 3;
            const delay = seeds[index] * 0.115;
            const localProgress = smootherstep((progress - delay) / (1 - delay));
            const fromX = transition.fromPositions[offset];
            const fromY = transition.fromPositions[offset + 1];
            const fromZ = transition.fromPositions[offset + 2];
            const toX = transition.target.positions[offset];
            const toY = transition.target.positions[offset + 1];
            const toZ = transition.target.positions[offset + 2];
            const radius = Math.hypot(fromX + toX, fromY + toY) || 1;
            const swirl = wave * (0.08 + seeds[index] * 0.11);
            positions[offset] = fromX + (toX - fromX) * localProgress - (fromY + toY) / radius * swirl;
            positions[offset + 1] = fromY + (toY - fromY) * localProgress + (fromX + toX) / radius * swirl;
            positions[offset + 2] = fromZ + (toZ - fromZ) * localProgress
                + Math.sin(seeds[index] * TAU * 2) * swirl * 0.75;

            colors[offset] = transition.fromColors[offset]
                + (transition.target.colors[offset] - transition.fromColors[offset]) * localProgress;
            colors[offset + 1] = transition.fromColors[offset + 1]
                + (transition.target.colors[offset + 1] - transition.fromColors[offset + 1]) * localProgress;
            colors[offset + 2] = transition.fromColors[offset + 2]
                + (transition.target.colors[offset + 2] - transition.fromColors[offset + 2]) * localProgress;
            sizes[index] = transition.fromSizes[index]
                + (transition.target.sizes[index] - transition.fromSizes[index]) * localProgress;
        }

        positionAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;
        sizeAttribute.needsUpdate = true;
        const lineOpacity = transition.fromLineOpacity
            + (transition.target.lineOpacity - transition.fromLineOpacity) * smoothstep(progress);
        lineMaterial.opacity = lineOpacity * (1 - wave * 0.62);

        const glowColor = transition.fromGlow.map((value, index) => (
            value + (transition.target.glow[index] - value) * smoothstep(progress)
        ));
        const orbitOpacity = transition.fromOrbitOpacity
            + (transition.target.orbitOpacity - transition.fromOrbitOpacity) * smoothstep(progress);
        applyGlow(glowColor, orbitOpacity, wave);

        if (progress >= 1) completeTransition(now);
        return progress;
    }

    function render(now) {
        if (!running) return;
        frameId = requestAnimationFrame(render);
        const dt = Math.min((now - lastTime) / 1000, 0.08);
        lastTime = now;
        if (!visible) return;

        const progress = updateMorph(now);
        if (!transition) {
            applyGlow(currentShape.glow, currentShape.orbitOpacity);
            lineMaterial.opacity = currentShape.lineOpacity;
            if (!reducedMotion && now - holdStartedAt >= HOLD_DURATIONS[currentShape.name]) beginMorph(now);
        }

        const targetName = transition ? transition.target.name : currentShape.name;
        const transitionTarget = transition?.target.name ?? null;
        const shapePresences = Object.fromEntries(LOGO_SHAPE_NAMES.map(name => [
            name,
            getLogoShapePresence(name, currentShape.name, transitionTarget, progress)
        ]));
        const heartPresence = shapePresences.heart;
        const motionShape = heartPresence > 0.06
            ? 'heart'
            : transition && progress < 0.52 ? currentShape.name : targetName;
        const motion = getLogoMotion({ rotY, dt, now, shapeName: motionShape, heartFactor: heartPresence });
        rotY = motion.rotY;
        pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * Math.min(1, dt * 5.5);
        pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * Math.min(1, dt * 5.5);
        root.rotation.y = motion.displayRotY + pointerCurrent.x;
        root.rotation.x = motion.rotX + pointerCurrent.y;
        root.rotation.z = motion.rotZ;
        orbit.rotation.z += dt * (targetName === 'infinity' ? 0.28 : 0.12);

        const beat = 1 + (getHeartBeatScale(now) - 1) * heartPresence;
        const settle = transition ? 1 + Math.sin(progress * Math.PI) * 0.025 : 1;
        const interfacePulse = reducedMotion ? 1 : getInterfacePulseScale(now - interactionPulseStartedAt);
        root.scale.setScalar(beat * settle * interfacePulse);
        root.position.y = Math.sin(now * 0.00105) * (heartPresence > 0.1 ? 0.045 : 0.022);
        for (const name of LOGO_SHAPE_NAMES) {
            setCorePresence(cores[name], shapePresences[name], name === 'heart' ? (beat - 1) * 4.2 : 0);
        }
        glow.scale.setScalar((3.18 + Math.sin(now * 0.0014) * 0.08) * beat * (1 + (interfacePulse - 1) * 1.8));
        pointMaterial.uniforms.uTime.value = now / 1000;
        pointMaterial.uniforms.uBreath.value = targetName === 'infinity'
            ? 0.32
            : targetName === 'summit'
                ? 0.24
                : heartPresence > 0.1 ? 0.22 : 0.55;

        renderer.render(scene, camera);
    }

    function handlePointerMove(event) {
        const rect = canvas.getBoundingClientRect();
        pointerTarget.x = ((event.clientX - rect.left) / rect.width - 0.5) * 0.24;
        pointerTarget.y = ((event.clientY - rect.top) / rect.height - 0.5) * 0.18;
    }

    function resetPointer() {
        pointerTarget.x = 0;
        pointerTarget.y = 0;
    }

    function handleKeydown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        beginMorph();
    }

    function handleInterfaceMotion() {
        if (reducedMotion) return;
        interactionPulseStartedAt = performance.now();
        beginMorph(interactionPulseStartedAt);
    }

    const observer = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(entries => {
            visible = entries.some(entry => entry.isIntersecting);
        }, { threshold: 0.05 })
        : null;
    observer?.observe(canvas);

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', resetPointer);
    canvas.addEventListener('click', beginMorph);
    canvas.addEventListener('keydown', handleKeydown);
    window.addEventListener('sherpa:navigation', handleInterfaceMotion);
    window.addEventListener('sherpa-theme-changed', handleInterfaceMotion);
    canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        running = false;
        canvas.dataset.logoRenderer = 'context-lost';
    });

    canvas.dataset.logoRenderer = 'three';
    canvas.dataset.logoShape = currentShape.name;
    setCanvasAccessibility(canvas, currentShape.name);
    applyGlow(currentShape.glow, currentShape.orbitOpacity);
    frameId = requestAnimationFrame(render);

    return {
        next: beginMorph,
        dispose() {
            running = false;
            cancelAnimationFrame(frameId);
            observer?.disconnect();
            canvas.removeEventListener('pointermove', handlePointerMove);
            canvas.removeEventListener('pointerleave', resetPointer);
            canvas.removeEventListener('click', beginMorph);
            canvas.removeEventListener('keydown', handleKeydown);
            window.removeEventListener('sherpa:navigation', handleInterfaceMotion);
            window.removeEventListener('sherpa-theme-changed', handleInterfaceMotion);
            pointGeometry.dispose();
            lineGeometry.dispose();
            pointMaterial.dispose();
            lineMaterial.dispose();
            orbit.geometry.dispose();
            orbit.material.dispose();
            Object.values(cores).forEach(disposeCore);
            glowMaterial.map.dispose();
            glowMaterial.dispose();
            renderer.dispose();
            instances.delete(canvas);
        }
    };
}

export function initLogoAnimation(canvasId = 'sherpaLogo', canvasSize = 120) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const existing = instances.get(canvas);
    if (existing) return existing;

    canvas.dataset.logoRenderer = 'loading';
    const pending = loadThree()
        .then(THREE => {
            if (!canvas.isConnected) return null;
            const controller = createLogoScene(THREE, canvas, canvasSize);
            instances.set(canvas, controller);
            return controller;
        })
        .catch(error => {
            console.warn('Sherpa logo switched to its canvas fallback.', error);
            drawFallbackLogo(canvas, canvasSize);
            const controller = { next() {}, dispose() { instances.delete(canvas); } };
            instances.set(canvas, controller);
            return controller;
        });
    instances.set(canvas, pending);
    return pending;
}
