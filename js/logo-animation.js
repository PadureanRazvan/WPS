import { createGlobeCore, createHeartCore, createSummitCore, createInfinityCore } from './logo-cores.js?v=2026.09.07';
import { createFspCore, loadFspTextures } from './logo-fsp-core.js?v=2026.09.07';
import { createLogoStudioLighting } from './logo-materials.js?v=2026.09.07';
import {
    LOGO_PARTICLE_COUNT,
    LOGO_SHAPE_NAMES,
    buildLogoConnections,
    createLogoShape,
    matchLogoShape
} from './logo-shapes.js?v=2026.09.07&fsp=20260906.3';

const TAU = Math.PI * 2;
const HEART_REVEAL_ANGLE = 0.32;
const SUMMIT_REVEAL_ANGLE = 0.36;
const MORPH_DURATION = 1900;
const CONNECTIONS_PER_PARTICLE = 2;
export const HOLD_DURATIONS = Object.freeze({
    fsp: 14000,
    globe: 6200,
    heart: 6400,
    summit: 6200,
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

function easeLogoAngle(current, target, dt, rate) {
    const change = (target - current) * (1 - Math.exp(-dt * rate));
    const limit = Math.max(0, dt) * 2.4;
    return current + Math.max(-limit, Math.min(limit, change));
}

function getFspSpinSpeed(angle) {
    // Linger on the readable front, then smoothly accelerate past the back.
    return 0.22 + 0.88 * (1 - Math.cos(angle)) / 2;
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

    if (resolvedShape === 'heart') {
        const reveal = HEART_REVEAL_ANGLE + Math.sin(now * 0.00068) * 0.08;
        const target = nearestEquivalentAngle(rotY, reveal);
        const rate = 4.6 + heartPresence * 2.8;
        const nextRotY = easeLogoAngle(rotY, target, dt, rate);
        return {
            rotY: nextRotY,
            displayRotY: nextRotY + Math.sin(now * 0.00115) * 0.02 * heartPresence,
            rotX: 0.08 + Math.sin(now * 0.00082) * 0.055,
            rotZ: Math.sin(now * 0.00054) * 0.035,
            heartPresence
        };
    }

    if (resolvedShape === 'infinity') {
        const target = nearestEquivalentAngle(rotY, 0);
        const nextRotY = easeLogoAngle(rotY, target, dt, 3.4);
        return {
            rotY: nextRotY,
            displayRotY: nextRotY + Math.sin(now * 0.00062) * 0.14,
            rotX: 0.08 + Math.sin(now * 0.00044) * 0.04,
            rotZ: Math.sin(now * 0.00038) * 0.055,
            heartPresence: 0
        };
    }

    if (resolvedShape === 'summit') {
        const reveal = SUMMIT_REVEAL_ANGLE + Math.sin(now * 0.00034) * 0.14;
        const target = nearestEquivalentAngle(rotY, reveal);
        const nextRotY = easeLogoAngle(rotY, target, dt, 3.1);
        return {
            rotY: nextRotY,
            displayRotY: nextRotY + Math.sin(now * 0.00051) * 0.025,
            rotX: 0.17 + Math.sin(now * 0.00038) * 0.035,
            rotZ: Math.sin(now * 0.00029) * 0.022,
            heartPresence: 0
        };
    }

    // Sample halfway through the frame so the easing stays consistent across
    // display refresh rates, including when a frame spans the front/back seam.
    const speed = resolvedShape === 'fsp'
        ? getFspSpinSpeed(rotY + dt * getFspSpinSpeed(rotY) / 2)
        : resolvedShape === 'globe' ? 0.22 : 0.3;
    const nextRotY = rotY + dt * speed;
    return {
        rotY: nextRotY,
        displayRotY: nextRotY,
        rotX: resolvedShape === 'fsp' ? 0.055 + Math.sin(now * 0.0003) * 0.035 : 0.2 + Math.sin(now * 0.0003) * 0.07,
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

export function getLogoCorePresence(shapeName, currentName, targetName = null, progress = 0) {
    if (!targetName || currentName === targetName) return shapeName === currentName ? 1 : 0;
    // Give the moving particles the middle of the transition. Two opaque
    // sculptures should never intersect while their silhouettes change.
    if (shapeName === currentName) return 1 - smootherstep(progress / 0.5);
    if (shapeName === targetName) return smootherstep((progress - 0.5) / 0.5);
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

function setCorePresence(core, presence, energy = 0) {
    const amount = clamp01(presence);
    core.visible = amount > 0.004;
    if (!core.visible) return;
    core.traverse(object => {
        if (!object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if (material.userData.logoPresence) {
                material.userData.logoPresence.value = amount;
            } else {
                material.opacity = (material.userData.logoOpacity ?? 0) * amount;
                material.depthWrite = (material.userData.logoOpacity ?? 0) >= 0.99 && amount > 0.98;
            }
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
            uViewportScale: { value: 1 },
            uBreath: { value: 0.55 },
            uOpacity: { value: 1 }
        },
        vertexShader: `
            uniform float uTime;
            uniform float uPixelRatio;
            uniform float uViewportScale;
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
                gl_PointSize = clamp(aSize * uPixelRatio * uViewportScale * (7.15 / max(1.0, -viewPosition.z)), 0.8, 16.0 * uPixelRatio);
                float depthLight = clamp((viewPosition.z + 5.9) / 1.7, 0.0, 1.0);
                vColor = color * (0.82 + depthLight * 0.46);
                vAlpha = 0.76 + shimmer * 0.14;
            }
        `,
        fragmentShader: `
            uniform float uOpacity;
            varying vec3 vColor;
            varying float vAlpha;

            void main() {
                float distanceToCenter = length(gl_PointCoord - vec2(0.5));
                if (distanceToCenter > 0.5) discard;
                float edge = 1.0 - smoothstep(0.18, 0.5, distanceToCenter);
                float core = 1.0 - smoothstep(0.0, 0.17, distanceToCenter);
                vec3 luminousColor = vColor + core * vec3(0.24);
                gl_FragColor = vec4(luminousColor, edge * vAlpha * uOpacity);
            }
        `
    });
}

function setCanvasAccessibility(canvas, shapeName, paused = false, reducedMotion = false) {
    const romanian = document.documentElement.lang !== 'en';
    const names = romanian
        ? { fsp: 'FSP Global', globe: 'glob', heart: 'inimă', summit: 'vârf de munte', infinity: 'infinit' }
        : { fsp: 'FSP Global', globe: 'globe', heart: 'heart', summit: 'mountain summit', infinity: 'infinity ribbon' };
    const readableShape = names[shapeName] || shapeName;
    canvas.setAttribute('role', 'button');
    canvas.setAttribute('tabindex', '0');
    const action = romanian
        ? `Sherpa — ${readableShape}. Click: forma următoare.${reducedMotion ? ' Mișcare redusă.' : paused ? ' P: reia animația.' : ' P: oprește animația.'}`
        : `Sherpa — ${readableShape}. Activate for the next shape.${reducedMotion ? ' Reduced motion.' : paused ? ' P: resume animation.' : ' P: pause animation.'}`;
    canvas.setAttribute('aria-label', action);
    canvas.title = action;
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

async function createLogoScene(THREE, canvas, size, control, textures, options) {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionPreference.matches;
    let paused = false;
    let autoCycle = options.autoCycle !== false;
    let inspectionRotation = null;
    let needsRender = true;
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.z = 5.25;

    const shapeSeed = 0x51E2A + size * 97;
    function getVariant() {
        return control.closest('.sidebar') && (window.matchMedia('(max-width: 1024px)').matches || control.closest('.sidebar').classList.contains('collapsed')) ? 'compact' : 'full';
    }
    let variant = getVariant();
    const shapes = Object.fromEntries(LOGO_SHAPE_NAMES.map((name, index) => [
        name,
        createLogoShape(name, LOGO_PARTICLE_COUNT, shapeSeed + Math.max(0, index - 1) * 701, variant)
    ]));
    let currentIndex = 0;
    let currentShape = shapes[LOGO_SHAPE_NAMES[currentIndex]];
    let firstMorph = { source: currentShape, target: matchLogoShape(currentShape, shapes.globe) };
    firstMorph.connections = buildLogoConnections(firstMorph.target, CONNECTIONS_PER_PARTICLE);

    const positions = currentShape.positions.slice();
    const colors = currentShape.colors.slice();
    const sizes = currentShape.sizes.slice();
    const seeds = new Float32Array(LOGO_PARTICLE_COUNT);
    for (let index = 0; index < seeds.length; index++) {
        seeds[index] = (index * 0.6180339887498949 + 0.37) % 1;
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
    const lineIndices = new Uint16Array(LOGO_PARTICLE_COUNT * CONNECTIONS_PER_PARTICLE * 2);
    const lineIndexAttribute = new THREE.BufferAttribute(lineIndices, 1).setUsage(THREE.DynamicDrawUsage);
    lineGeometry.setIndex(lineIndexAttribute);
    function updateConnections(shape, prepared = null) {
        const connections = prepared ?? buildLogoConnections(shape, CONNECTIONS_PER_PARTICLE);
        lineIndices.set(connections);
        lineIndexAttribute.needsUpdate = true;
        lineGeometry.setDrawRange(0, connections.length);
    }
    updateConnections(currentShape);
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
        fsp: createFspCore(THREE, textures),
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
    let studioLighting = createLogoStudioLighting(THREE, renderer, scene);

    const colorScratch = new THREE.Color();
    const pointerTarget = { x: 0, y: 0 };
    const pointerCurrent = { x: 0, y: 0 };
    let transition = null;
    let timeline = 0;
    let holdStartedAt = 0;
    let rotY = 0;
    let lastTime = performance.now();
    let visible = true;
    let running = true;
    let contextLost = false;
    let frameId = 0;
    let interactionPulseStartedAt = -Infinity;

    // Compile hidden figures and particle materials while the approved image
    // remains visible. First-use program linking otherwise stalls a morph.
    try {
        await renderer.compileAsync(scene, camera);
        const warming = [...Object.values(cores), ...Object.values(cores.fsp.userData.variants)];
        const visibility = warming.map(object => object.visible);
        try {
            warming.forEach(object => { object.visible = true; });
            // Warm the real framebuffer format while this canvas is hidden.
            // A separate render target would compile another output variant.
            renderer.setSize(1, 1, false);
            renderer.render(scene, camera);
        } finally {
            warming.forEach((object, index) => { object.visible = visibility[index]; });
            renderer.setSize(size, size, false);
        }
    }
    catch (error) { releaseSceneResources(); renderer.dispose(); throw error; }
    reducedMotion = motionPreference.matches;
    lastTime = performance.now();

    function publishState(shapeName = transition ? `${currentShape.name}-to-${transition.target.name}` : currentShape.name) {
        for (const element of new Set([canvas, control])) {
            element.dataset.logoShape = shapeName;
            element.dataset.logoMotion = reducedMotion ? 'reduced' : paused ? 'paused' : 'playing';
            element.dataset.logoVariant = variant;
        }
        setCanvasAccessibility(control, transition?.target.name || currentShape.name, paused, reducedMotion);
    }

    function applyShape(shape, connections = null) {
        currentShape = shape;
        positions.set(shape.positions);
        colors.set(shape.colors);
        sizes.set(shape.sizes);
        positionAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;
        sizeAttribute.needsUpdate = true;
        updateConnections(shape, connections);
        needsRender = true;
        publishState();
    }

    function resize() {
        const bounds = control.getBoundingClientRect();
        const width = Math.max(1, bounds.width || size), height = Math.max(1, bounds.height || size);
        renderer.setSize(width, height, false);
        pointMaterial.uniforms.uViewportScale.value = height / 150;
        camera.aspect = width / height;
        camera.zoom = Math.max(1, camera.aspect);
        camera.updateProjectionMatrix();
        const nextVariant = getVariant();
        if (nextVariant !== variant) {
            variant = nextVariant;
            shapes.fsp = createLogoShape('fsp', LOGO_PARTICLE_COUNT, shapeSeed, variant);
            if (currentShape.name === 'fsp' || transition?.target.name === 'fsp') {
                transition = null;
                currentIndex = 0;
                applyShape(shapes.fsp);
            }
        }
        cores.fsp.userData.variants.full.visible = variant === 'full';
        cores.fsp.userData.variants.compact.visible = variant === 'compact';
        needsRender = true;
        publishState();
    }

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
        publishState();
    }

    function beginMorph(now = timeline) {
        if (!Number.isFinite(now)) now = timeline;
        if (transition) {
            if (paused || reducedMotion) {
                const target = transition.target;
                currentIndex = transition.nextIndex;
                transition = null;
                holdStartedAt = timeline;
                applyShape(target);
            }
            return;
        }
        const nextIndex = (currentIndex + 1) % LOGO_SHAPE_NAMES.length;
        const nextName = LOGO_SHAPE_NAMES[nextIndex];
        const source = { count: LOGO_PARTICLE_COUNT, positions };
        const prepared = firstMorph?.source === currentShape ? firstMorph : null;
        const target = prepared?.target ?? matchLogoShape(source, shapes[nextName]);
        firstMorph = null;
        if (reducedMotion || paused) {
            currentIndex = nextIndex;
            holdStartedAt = timeline;
            applyShape(target, prepared?.connections);
            return;
        }
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
        updateConnections(target, prepared?.connections);
        publishState();
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

    function render(wallTime) {
        if (!running) return;
        frameId = requestAnimationFrame(render);
        let dt = Math.max(0, Math.min((wallTime - lastTime) / 1000, 0.08));
        lastTime = wallTime;
        if (!visible || document.hidden) return;
        if (paused || reducedMotion) {
            if (!needsRender) return;
            dt = 0;
        }
        timeline += dt * 1000;
        const now = timeline;
        needsRender = false;

        const progress = updateMorph(now);
        if (!transition) {
            applyGlow(currentShape.glow, currentShape.orbitOpacity);
            lineMaterial.opacity = currentShape.lineOpacity;
            if (autoCycle && !reducedMotion && !paused && now - holdStartedAt >= HOLD_DURATIONS[currentShape.name]) beginMorph(now);
        }

        const targetName = transition ? transition.target.name : currentShape.name;
        const transitionTarget = transition?.target.name ?? null;
        const shapePresences = Object.fromEntries(LOGO_SHAPE_NAMES.map(name => [
            name,
            getLogoShapePresence(name, currentShape.name, transitionTarget, progress)
        ]));
        const heartPresence = shapePresences.heart;
        const motionShape = transition && progress < 0.42 ? currentShape.name : targetName;
        const motion = getLogoMotion({ rotY, dt, now, shapeName: motionShape, heartFactor: heartPresence });
        rotY = motion.rotY;
        pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * Math.min(1, dt * 5.5);
        pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * Math.min(1, dt * 5.5);
        root.rotation.y = reducedMotion ? 0 : motion.displayRotY + pointerCurrent.x;
        root.rotation.x = reducedMotion ? 0 : motion.rotX + pointerCurrent.y;
        root.rotation.z = reducedMotion ? 0 : motion.rotZ;
        if (inspectionRotation) root.rotation.set(...inspectionRotation);
        orbit.rotation.z += dt * (targetName === 'infinity' ? 0.28 : 0.12);

        const beat = reducedMotion ? 1 : 1 + (getHeartBeatScale(now) - 1) * heartPresence;
        const settle = transition ? 1 + Math.sin(progress * Math.PI) * 0.025 : 1;
        const interfacePulse = reducedMotion ? 1 : getInterfacePulseScale(now - interactionPulseStartedAt);
        const baseScale = settle * interfacePulse;
        root.scale.set(baseScale * (1 + (beat - 1) * 0.65), baseScale * beat, baseScale * (1 - (beat - 1) * 0.35));
        root.position.y = reducedMotion ? 0 : Math.sin(now * 0.00105) * 0.022;
        for (const name of LOGO_SHAPE_NAMES) {
            const coverage = getLogoCorePresence(name, currentShape.name, transitionTarget, progress);
            if (coverage > 0.004 && !cores[name].visible) cores[name].userData.revealedAt = now;
            setCorePresence(cores[name], coverage, name === 'heart' ? (beat - 1) * 4.2 : 0);
            if (cores[name].visible) cores[name].userData.animate?.(reducedMotion ? 0 : now, {
                age: now - (cores[name].userData.revealedAt ?? now), reducedMotion
            });
        }
        glow.scale.setScalar((3.18 + Math.sin(now * 0.0014) * 0.08) * beat * (1 + (interfacePulse - 1) * 1.8));
        const morphWave = transition ? Math.sin(progress * Math.PI) : 0;
        // Finished sculptures are opaque at rest. Particles briefly carry
        // their colors and silhouette between the departing and arriving core.
        const sculptedRest = ['fsp', 'globe', 'heart', 'summit'].includes(currentShape.name);
        pointMaterial.uniforms.uOpacity.value = transition ? Math.pow(morphWave, 0.7) : sculptedRest ? 0 : 1;
        lineMaterial.opacity = transition ? 0.045 * morphWave : sculptedRest ? 0 : currentShape.lineOpacity;
        orbit.material.opacity *= 1 - shapePresences.globe;
        glowMaterial.opacity *= 1 - shapePresences.fsp * 0.94;
        points.visible = pointMaterial.uniforms.uOpacity.value > 0.002;
        lines.visible = lineMaterial.opacity > 0.002;
        orbit.visible = orbit.material.opacity > 0.002;
        pointMaterial.uniforms.uTime.value = now / 1000;
        pointMaterial.uniforms.uBreath.value = reducedMotion ? 0 : targetName === 'infinity'
            ? 0.32
            : targetName === 'summit'
                ? 0.24
                : heartPresence > 0.1 ? 0.22 : 0.55;

        renderer.render(scene, camera);
    }

    function handlePointerMove(event) {
        if (paused || reducedMotion || event.pointerType === 'touch') return;
        const rect = control.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        pointerTarget.x = ((event.clientX - rect.left) / rect.width - 0.5) * 0.24;
        pointerTarget.y = ((event.clientY - rect.top) / rect.height - 0.5) * 0.18;
    }

    function resetPointer() {
        pointerTarget.x = 0;
        pointerTarget.y = 0;
    }

    function handleKeydown(event) {
        if (event.key.toLowerCase() === 'p') {
            event.preventDefault();
            setPaused(!paused);
            return;
        }
        // Native buttons already dispatch one click for Enter/Space.
        if (control.tagName === 'BUTTON') return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        beginMorph();
    }

    function handleInterfaceMotion() {
        needsRender = true;
        if (reducedMotion || paused || !visible || document.hidden) return;
        interactionPulseStartedAt = timeline;
        beginMorph(interactionPulseStartedAt);
    }

    function setPaused(value) {
        paused = Boolean(value);
        needsRender = true;
        publishState();
    }

    function handleMotionPreference() {
        reducedMotion = motionPreference.matches;
        if (reducedMotion) {
            transition = null;
            currentIndex = 0;
            rotY = 0;
            pointerCurrent.x = pointerCurrent.y = 0;
            resetPointer();
            applyShape(shapes.fsp);
        }
        holdStartedAt = timeline;
        needsRender = true;
        publishState();
    }

    function handleContextLost(event) {
        event.preventDefault();
        contextLost = true;
        running = false;
        cancelAnimationFrame(frameId);
        // Release listeners tied to the old GPU context while it is lost.
        // Three's dispose methods retain the CPU geometry/image source data.
        releaseSceneResources();
        canvas.dataset.logoRenderer = control.dataset.logoRenderer = 'context-lost';
        setCanvasAccessibility(control, 'fsp', true, true);
    }

    function handleContextRestored() {
        if (!contextLost) return;
        try {
            // Geometry and image textures can be uploaded again by Three.
            // The generated softbox environment needs a fresh GPU render.
            studioLighting.dispose();
            studioLighting = createLogoStudioLighting(THREE, renderer, scene);
            contextLost = false;
            running = true;
            needsRender = true;
            lastTime = performance.now();
            canvas.dataset.logoRenderer = control.dataset.logoRenderer = 'three';
            publishState();
            frameId = requestAnimationFrame(render);
        } catch (error) {
            console.warn('Sherpa sculpture could not restore its studio lighting.', error);
        }
    }

    function releaseSceneResources() {
        pointGeometry.dispose();
        lineGeometry.dispose();
        pointMaterial.dispose();
        lineMaterial.dispose();
        orbit.geometry.dispose();
        orbit.material.dispose();
        Object.values(cores).forEach(disposeCore);
        Object.values(textures).forEach(texture => texture.dispose());
        glowMaterial.map.dispose();
        glowMaterial.dispose();
        studioLighting.dispose();
    }

    const observer = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(entries => {
            visible = entries.some(entry => entry.isIntersecting);
            needsRender = true;
        }, { threshold: 0.05 })
        : null;
    observer?.observe(control);

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(control);
    const languageObserver = new MutationObserver(() => publishState());
    languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    control.addEventListener('pointermove', handlePointerMove);
    control.addEventListener('pointerleave', resetPointer);
    control.addEventListener('blur', resetPointer);
    control.addEventListener('click', beginMorph);
    control.addEventListener('keydown', handleKeydown);
    motionPreference.addEventListener?.('change', handleMotionPreference);
    window.addEventListener('sherpa:navigation', handleInterfaceMotion);
    window.addEventListener('sherpa-theme-changed', handleInterfaceMotion);
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    canvas.dataset.logoRenderer = control.dataset.logoRenderer = 'three';
    resize();
    publishState();
    applyGlow(currentShape.glow, currentShape.orbitOpacity);
    frameId = requestAnimationFrame(render);

    return {
        next: beginMorph,
        pause: () => setPaused(true),
        resume: () => setPaused(false),
        setAutoCycle(value) { autoCycle = Boolean(value); holdStartedAt = timeline; },
        setInspectionRotation(rotation = null) {
            if (rotation !== null && (!Array.isArray(rotation) || rotation.length !== 3 || !rotation.every(Number.isFinite))) {
                throw new TypeError('Inspection rotation must contain three finite angles or be null');
            }
            inspectionRotation = rotation?.slice() ?? null;
            needsRender = true;
        },
        getDiagnostics: () => ({
            shape: currentShape.name, transitioning: Boolean(transition),
            running, visible, paused, reducedMotion, autoCycle, contextLost,
            inspectionRotation: inspectionRotation?.slice() ?? null,
            frame: renderer.info.render.frame,
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures
        }),
        dispose() {
            running = false;
            cancelAnimationFrame(frameId);
            observer?.disconnect();
            resizeObserver?.disconnect();
            languageObserver.disconnect();
            control.removeEventListener('pointermove', handlePointerMove);
            control.removeEventListener('pointerleave', resetPointer);
            control.removeEventListener('blur', resetPointer);
            control.removeEventListener('click', beginMorph);
            control.removeEventListener('keydown', handleKeydown);
            motionPreference.removeEventListener?.('change', handleMotionPreference);
            canvas.removeEventListener('webglcontextlost', handleContextLost);
            canvas.removeEventListener('webglcontextrestored', handleContextRestored);
            window.removeEventListener('sherpa:navigation', handleInterfaceMotion);
            window.removeEventListener('sherpa-theme-changed', handleInterfaceMotion);
            releaseSceneResources();
            renderer.dispose();
            if (control !== canvas) canvas.remove();
            control.dataset.logoRenderer = 'fallback';
            instances.delete(control);
        }
    };
}

export function initLogoAnimation(canvasId = 'sherpaLogo', canvasSize = 120, options = {}) {
    const control = document.getElementById(canvasId);
    if (!control) return null;
    const existing = instances.get(control);
    if (existing) return existing;

    const imageHost = control.hasAttribute('data-fsp-logo');
    const canvas = imageHost ? document.createElement('canvas') : control;
    if (imageHost) {
        canvas.className = 'fsp-logo-scene';
        canvas.setAttribute('aria-hidden', 'true');
        control.append(canvas);
    }

    canvas.dataset.logoRenderer = control.dataset.logoRenderer = 'loading';
    const pending = loadThree()
        .then(async THREE => {
            if (!control.isConnected) {
                if (imageHost) canvas.remove();
                instances.delete(control);
                return null;
            }
            const textures = await loadFspTextures(THREE);
            if (!control.isConnected) {
                Object.values(textures).forEach(texture => texture.dispose());
                if (imageHost) canvas.remove();
                instances.delete(control);
                return null;
            }
            let controller;
            try { controller = await createLogoScene(THREE, canvas, canvasSize, control, textures, options); }
            catch (error) { Object.values(textures).forEach(texture => texture.dispose()); throw error; }
            if (!control.isConnected) { controller.dispose(); return null; }
            instances.set(control, controller);
            return controller;
        })
        .catch(error => {
            console.warn('Sherpa logo switched to its canvas fallback.', error);
            if (imageHost) {
                canvas.remove();
                control.dataset.logoRenderer = 'fallback';
                control.dataset.logoShape = 'fsp';
                control.setAttribute('aria-label', 'FSP Global');
            } else drawFallbackLogo(canvas, canvasSize);
            const controller = { next() {}, dispose() { instances.delete(control); } };
            instances.set(control, controller);
            return controller;
        });
    instances.set(control, pending);
    return pending;
}
