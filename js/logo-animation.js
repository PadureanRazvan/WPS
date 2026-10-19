import { createGlobeCore, createHeartCore, createSummitCore, createInfinityCore } from './logo-cores.js?v=2026.10.19';
import { createFspCore, loadFspTextures } from './logo-fsp-core.js?v=2026.10.19';
import { createLogoStudioLighting } from './logo-materials.js?v=2026.10.19';
import { createAnimationScheduler } from './animation-scheduler.js';
import { prepareLogoGeometries } from './logo-preparation.js';
import { createLogoInteraction } from './logo-interaction.js?v=2026.10.19';
import {
    HOLD_DURATIONS, LOGO_STORY_DURATION, getLogoChapter, getChapterAge,
    getStoryMotion, getStoryVelocity, getStoryBeat, nearestStoryAngle,
    blendStoryPose, writeStoryParticle, getStoryDissolve, getStoryChapterAt
} from './logo-story.js?v=2026.10.19';
export { HOLD_DURATIONS } from './logo-story.js?v=2026.10.19';
import {
    LOGO_PARTICLE_COUNT,
    LOGO_SHAPE_NAMES,
    buildLogoConnections,
    createLogoShape,
    matchLogoShape,
    copyLogoPosePositions
} from './logo-shapes.js?v=2026.10.19&fsp=20260906.3';

const TAU = Math.PI * 2;
const MANUAL_MORPH_DURATION = 1400;
const CONNECTIONS_PER_PARTICLE = 2;
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

export function getLogoMotion({ shapeName = 'fsp', age = 0, reducedMotion = false } = {}) {
    const motion = getStoryMotion(shapeName, age, reducedMotion);
    return { ...motion, rotX: motion.rotation[0], rotY: motion.rotation[1], rotZ: motion.rotation[2], displayRotY: motion.rotation[1] };
}

export const getHeartBeatScale = (age = 0) => 1 + getStoryBeat(age);

export function getInterfacePulseScale(age = Infinity) {
    if (!Number.isFinite(age) || age < 0 || age > 620) return 1;
    const t = age / 620;
    return 1 + 0.018 * 16 * t * t * (1 - t) * (1 - t);
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

function setCoreDissolve(core, direction) {
    core.traverse(object => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material?.userData.logoDissolve?.value.set(direction));
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

export function getLogoAccessibilityLabel({ language = 'ro', shapeName = 'fsp', paused = false, reducedMotion = false } = {}) {
    const names = {
        ro: { fsp: 'FSP Global', globe: 'glob', heart: 'inimă', summit: 'vârf de munte', infinity: 'infinit' },
        en: { fsp: 'FSP Global', globe: 'globe', heart: 'heart', summit: 'mountain summit', infinity: 'infinity ribbon' },
        it: { fsp: 'FSP Global', globe: 'globo', heart: 'cuore', summit: 'vetta di montagna', infinity: 'nastro infinito' }
    };
    const locale = names[language] ? language : 'ro';
    const readableShape = names[locale][shapeName] || shapeName;
    const tilt = !paused && !reducedMotion ? { it: ' Trascina per inclinare.', ro: ' Trage pentru înclinare.', en: ' Drag to tilt.' }[locale] : '';
    if (locale === 'it') return `Sherpa — ${readableShape}. Attiva per la forma successiva.${tilt}${reducedMotion ? ' Movimento ridotto.' : paused ? " P: riprendi l'animazione." : ' P: metti in pausa.'}`;
    return locale === 'ro'
        ? `Sherpa — ${readableShape}. Click: forma următoare.${tilt}${reducedMotion ? ' Mișcare redusă.' : paused ? ' P: reia animația.' : ' P: oprește animația.'}`
        : `Sherpa — ${readableShape}. Activate for the next shape.${tilt}${reducedMotion ? ' Reduced motion.' : paused ? ' P: resume animation.' : ' P: pause animation.'}`;
}

function setCanvasAccessibility(canvas, shapeName, paused = false, reducedMotion = false) {
    canvas.setAttribute('role', 'button');
    canvas.setAttribute('tabindex', '0');
    const action = getLogoAccessibilityLabel({ language: document.documentElement.lang, shapeName, paused, reducedMotion });
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

export async function createLogoScene(THREE, canvas, size, control, textures, options = {}) {
    const sceneStartedAt = performance.now();
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionPreference.matches;
    let paused = false;
    let autoCycle = options.autoCycle !== false;
    let inspectionRotation = null;
    let frameScheduler = null;
    let disposed = false;
    let hasRendered = false;
    let renderedFrames = 0;
    let renderCpuTotal = 0;
    let renderCpuMaximum = 0;
    let captureRequest = null;
    const invalidate = () => { if (!disposed) frameScheduler?.invalidate(); };
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
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
    const shapeSeedOffsets = { fsp: 0, globe: 0, heart: 701, summit: 1402, infinity: 2103 };
    const shapes = Object.fromEntries(LOGO_SHAPE_NAMES.map(name => [
        name,
        createLogoShape(name, LOGO_PARTICLE_COUNT, shapeSeed + shapeSeedOffsets[name], variant)
    ]));
    let currentIndex = 0;
    let currentShape = shapes[LOGO_SHAPE_NAMES[currentIndex]];
    let firstMorph = { source: currentShape, target: matchLogoShape(currentShape, shapes[LOGO_SHAPE_NAMES[1]]) };
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
        opacity: 0,
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
    root.add(glow, coreRoot, lines, points);
    scene.add(root);
    let studioLighting = createLogoStudioLighting(THREE, renderer, scene);

    const colorScratch = new THREE.Color();
    const sizeScratch = new THREE.Vector2();
    let interaction = null;
    let poseCurrent = getStoryMotion('fsp', 0).rotation;
    const particleFrom = [0, 0, 0], particleTo = [0, 0, 0], particleOut = [0, 0, 0];
    let transition = null;
    let queuedAdvance = false;
    let timeline = 0;
    let playbackRate = 1;
    let holdStartedAt = 0;
    let queuedReadyAt = 0;
    let visible = true;
    let running = true;
    let contextLost = false;
    let interactionPulseStartedAt = -Infinity;
    let lightSurface = false;
    const preparedFigures = new Set(['fsp']);
    const preparationFailures = new Set();
    let preparationQueue = LOGO_SHAPE_NAMES.filter(name => name !== 'fsp');
    let preparationTimer = null, preparingFigure = null, preparationEpoch = 0;
    let pendingAdvance = null, backgroundWarmMs = 0;
    let finishPreparation;
    const prepared = new Promise(resolve => { finishPreparation = resolve; });

    function preparationScene(name, effects = false) {
        const snapshot = new THREE.Scene();
        snapshot.environment = scene.environment;
        snapshot.environmentIntensity = scene.environmentIntensity;
        scene.children.filter(object => object.isLight).forEach(light => snapshot.add(light.clone()));
        const core = cores[name].clone();
        core.traverse(object => { object.visible = true; });
        snapshot.add(core, glow.clone());
        if (effects) {
            const particles = points.clone(), connections = lines.clone();
            particles.visible = connections.visible = true;
            snapshot.add(particles, connections);
        }
        return snapshot;
    }

    const figureReady = name => preparedFigures.has(name) || preparationFailures.has(name);
    function resumePendingAdvance() {
        if (!pendingAdvance || disposed || contextLost || !running || !visible || document.hidden
            || paused || reducedMotion || transition || interaction?.dragging) return;
        if (!figureReady(LOGO_SHAPE_NAMES[(currentIndex + 1) % LOGO_SHAPE_NAMES.length])) return;
        const request = pendingAdvance;
        pendingAdvance = null;
        beginMorph(timeline, request.manual);
        invalidate();
    }

    function cancelPreparation() {
        clearTimeout(preparationTimer);
        preparationTimer = null;
        preparingFigure = null;
        preparationEpoch++;
    }

    function schedulePreparation() {
        resumePendingAdvance();
        if (disposed || preparationTimer !== null || preparingFigure || contextLost || !running
            || !visible || document.hidden || paused || reducedMotion) return;
        if (!preparationQueue.length) { finishPreparation(true); return; }
        // Let the first real frame paint before asking the driver for another
        // program. Each later figure gets its own yielding preparation step.
        preparationTimer = setTimeout(async () => {
            preparationTimer = null;
            if (disposed || contextLost || !running || !visible || document.hidden || paused || reducedMotion) return;
            const name = preparationQueue.shift(), epoch = preparationEpoch;
            preparingFigure = name;
            const startedAt = performance.now();
            try {
                const snapshot = preparationScene(name, true);
                await renderer.compileAsync(snapshot, camera);
                if (disposed || epoch !== preparationEpoch) return;
                if (!visible || document.hidden || paused || reducedMotion) { preparationQueue.unshift(name); return; }
                const dimensions = renderer.getSize(new THREE.Vector2());
                try {
                    renderer.setSize(1, 1, false);
                    renderer.render(snapshot, camera);
                } finally {
                    renderer.setSize(dimensions.x, dimensions.y, false);
                    // Refill the visible buffer within the same task; a warm-up
                    // must never leave a one-pixel/blank canvas for the next paint.
                    if (!disposed && !contextLost) render(performance.now(), 0);
                }
                preparedFigures.add(name);
                backgroundWarmMs += performance.now() - startedAt;
            } catch (error) {
                if (!disposed && epoch === preparationEpoch) {
                    // Warming is optional. Let the normal renderer try this
                    // figure on demand instead of retrying forever or losing a tap.
                    preparationFailures.add(name);
                    finishPreparation(false);
                    console.warn('Sherpa could not prepare the next sculpture.', error);
                }
            } finally {
                if (epoch === preparationEpoch) { preparingFigure = null; schedulePreparation(); }
            }
        }, 32);
    }

    // Only the visible identity gates first paint. The other figures are warmed
    // during its long opening hold, while it is already moving and interactive.
    const warmStartedAt = performance.now();
    try {
        const snapshot = preparationScene('fsp');
        try {
            await renderer.compileAsync(snapshot, camera);
            // Warm the real framebuffer format while this canvas is hidden.
            // A separate render target would compile another output variant.
            renderer.setSize(1, 1, false);
            renderer.render(snapshot, camera);
        } finally {
            renderer.setSize(size, size, false);
        }
    }
    catch (error) { releaseSceneResources(); renderer.dispose(); throw error; }
    reducedMotion = motionPreference.matches;
    const warmDuration = performance.now() - warmStartedAt;
    const sceneDuration = performance.now() - sceneStartedAt;
    interaction = createLogoInteraction(control, {
        canMove: () => running && visible && !document.hidden && !paused && !reducedMotion && !contextLost,
        invalidate: () => frameScheduler?.sync()
    });

    function publishState(shapeName = transition ? `${currentShape.name}-to-${transition.target.name}` : currentShape.name) {
        if (disposed) return;
        for (const element of new Set([canvas, control])) {
            element.dataset.logoShape = shapeName;
            element.dataset.logoMotion = reducedMotion ? 'reduced' : paused ? 'paused' : 'playing';
            element.dataset.logoVariant = variant;
        }
        setCanvasAccessibility(control, transition?.target.name || currentShape.name, paused, reducedMotion);
    }

    function applyShape(shape, connections = null, requestRender = true) {
        currentShape = shape;
        positions.set(shape.positions);
        colors.set(shape.colors);
        sizes.set(shape.sizes);
        positionAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;
        sizeAttribute.needsUpdate = true;
        updateConnections(shape, connections);
        if (requestRender) invalidate();
        publishState();
    }

    function resize() {
        if (disposed) return;
        const bounds = control.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const width = Math.max(1, bounds.width || size), height = Math.max(1, bounds.height || size);
        const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const ratioChanged = renderer.getPixelRatio() !== nextPixelRatio;
        if (renderer.getPixelRatio() !== nextPixelRatio) renderer.setPixelRatio(nextPixelRatio);
        pointMaterial.uniforms.uPixelRatio.value = nextPixelRatio;
        const currentSize = renderer.getSize(sizeScratch);
        const sizeChanged = currentSize.x !== width || currentSize.y !== height;
        if (sizeChanged) renderer.setSize(width, height, false);
        pointMaterial.uniforms.uViewportScale.value = height / 150;
        const nextVariant = getVariant();
        const variantChanged = nextVariant !== variant;
        camera.aspect = width / height;
        // Fit the short dimension. Enlarging wide wordmark slots crops the
        // lower FSP lettering when a turn brings it closer to the camera.
        // Optical centering leaves room for the full mark's lower word line,
        // including its pointer tilt and brief interface pulse.
        // The compact slot also needs room for a particle's radius, shimmer
        // and the acknowledgement pulse at the deepest inspection angle.
        camera.zoom = Math.min(1, camera.aspect) * (nextVariant === 'full' ? 0.95 : 0.98);
        camera.position.y = nextVariant === 'full' ? -0.12 : 0;
        camera.updateProjectionMatrix();
        if (variantChanged) {
            variant = nextVariant;
            shapes.fsp = createLogoShape('fsp', LOGO_PARTICLE_COUNT, shapeSeed, variant);
            firstMorph = null;
            if (transition && (currentShape.name === 'fsp' || transition.target.name === 'fsp')) {
                if (currentShape.name === 'fsp') {
                    currentShape = shapes.fsp;
                    transition.fromPositions = currentShape.positions.slice();
                    transition.fromColors = currentShape.colors.slice();
                    transition.fromSizes = currentShape.sizes.slice();
                }
                transition.target = matchLogoShape({ count: LOGO_PARTICLE_COUNT, positions: transition.fromPositions }, shapes[LOGO_SHAPE_NAMES[transition.nextIndex]]);
                updateConnections(transition.target);
            } else if (currentShape.name === 'fsp') {
                applyShape(shapes.fsp, null, false);
            }
        }
        cores.fsp.userData.variants.full.visible = variant === 'full';
        cores.fsp.userData.variants.compact.visible = variant === 'compact';
        // Changing the drawing buffer clears it. ResizeObserver runs before
        // paint, so refill a visible canvas here instead of showing one blank
        // frame while waiting for the next animation callback.
        if (hasRendered && running && visible && !document.hidden && !contextLost && (sizeChanged || ratioChanged || variantChanged)) render(performance.now(), 0);
        else if (!hasRendered || sizeChanged || ratioChanged || variantChanged) invalidate();
        publishState();
    }

    function applyGlow(glowColor, transitionAmount = 0) {
        colorScratch.setRGB(glowColor[0], glowColor[1], glowColor[2]);
        glowMaterial.color.copy(colorScratch);
        const theme = document.documentElement.getAttribute('data-theme');
        const darkTheme = theme ? ['dark', 'aurora'].includes(theme) : document.body.classList.contains('dark-theme');
        lightSurface = !darkTheme;
        // Adding color to a near-white surface washes the entire midpoint out.
        // Normal alpha keeps the same colored silhouette legible in daylight.
        const blending = darkTheme ? THREE.AdditiveBlending : THREE.NormalBlending;
        pointMaterial.blending = lineMaterial.blending = glowMaterial.blending = blending;
        glowMaterial.opacity = (darkTheme ? 0.24 : 0.075) * (1 - transitionAmount * 0.22);
    }

    function finishCapture(request, error = null, blob = null) {
        if (captureRequest !== request) return;
        captureRequest = null;
        clearTimeout(request.timeout);
        if (error) request.reject(error);
        else request.resolve(blob);
    }

    function completeTransition(now) {
        const completedAt = transition.startedAt + transition.duration;
        currentIndex = transition.nextIndex;
        currentShape = transition.target;
        positions.set(transition.target.positions);
        colors.set(transition.target.colors);
        sizes.set(transition.target.sizes);
        transition = null;
        holdStartedAt = completedAt;
        queuedReadyAt = now + 180;
        publishState();
    }

    function applyStillShape(shape, connections = null) {
        // Selecting while paused is a new view; pausing an existing view still
        // freezes its exact pose. Keep an explicit studio inspection override.
        interaction.reset();
        playbackRate = 1;
        poseCurrent = getStoryMotion(shape.name, 0, reducedMotion).rotation;
        queuedAdvance = false;
        applyShape(shape, connections);
    }

    function beginMorph(now = timeline, manual = false, inspection = false) {
        if (disposed) return;
        if (!Number.isFinite(now)) now = timeline;
        if (transition) {
            if (paused || reducedMotion) {
                const target = transition.target;
                currentIndex = transition.nextIndex;
                transition = null;
                holdStartedAt = timeline;
                applyStillShape(target);
            }
            return;
        }
        const nextIndex = (currentIndex + 1) % LOGO_SHAPE_NAMES.length;
        const nextName = LOGO_SHAPE_NAMES[nextIndex];
        if (!inspection && !paused && !reducedMotion && !figureReady(nextName)) {
            pendingAdvance = { manual };
            preparationQueue = [nextName, ...preparationQueue.filter(name => name !== nextName && name !== preparingFigure)];
            if (preparingFigure === nextName) preparationQueue = preparationQueue.filter(name => name !== nextName);
            schedulePreparation();
            return;
        }
        // The Earth turns inside a stable orbit. Freeze its actual surface pose
        // before matching, including a manual departure halfway through a turn.
        copyLogoPosePositions(currentShape, now - holdStartedAt, positions, reducedMotion);
        const source = { count: LOGO_PARTICLE_COUNT, positions };
        const prepared = firstMorph?.source === currentShape ? firstMorph : null;
        const target = prepared?.target ?? matchLogoShape(source, shapes[nextName]);
        firstMorph = null;
        if ((reducedMotion || paused) && !inspection) {
            currentIndex = nextIndex;
            holdStartedAt = timeline;
            applyStillShape(target, prepared?.connections);
            return;
        }
        const departingMotion = getStoryMotion(currentShape.name, now - holdStartedAt);
        transition = {
            nextIndex,
            target,
            startedAt: now,
            duration: manual ? MANUAL_MORPH_DURATION : getLogoChapter(currentShape.name).duration,
            path: getLogoChapter(currentShape.name).transition,
            fromPose: departingMotion.rotation.map((angle, axis) => nearestStoryAngle(poseCurrent[axis], angle)),
            toPose: getStoryMotion(nextName, 0).rotation,
            fromVelocity: getStoryVelocity(currentShape.name, now - holdStartedAt),
            toVelocity: getStoryVelocity(nextName, 0),
            fromLift: departingMotion.lift,
            fromBeat: departingMotion.beat,
            fromPositions: positions.slice(),
            fromColors: colors.slice(),
            fromSizes: sizes.slice(),
            fromGlow: [...currentShape.glow]
        };
        setCoreDissolve(cores[currentShape.name], getStoryDissolve(transition.path));
        setCoreDissolve(cores[nextName], getStoryDissolve(transition.path, true));
        updateConnections(target, prepared?.connections);
        publishState();
    }

    function activateLogo(event) {
        if (!interaction.shouldActivate(event)) return;
        if (!interaction.dragging) playbackRate = 1;
        interactionPulseStartedAt = timeline;
        if ((transition || pendingAdvance) && !paused && !reducedMotion) queuedAdvance = true;
        else beginMorph(timeline, true);
        invalidate();
    }

    function updateMorph(now) {
        if (!transition) return 0;
        const progress = clamp01((now - transition.startedAt) / transition.duration);
        const wave = Math.sin(progress * Math.PI);

        for (let index = 0; index < LOGO_PARTICLE_COUNT; index++) {
            const offset = index * 3;
            for (let axis = 0; axis < 3; axis++) {
                particleFrom[axis] = transition.fromPositions[offset + axis];
                particleTo[axis] = transition.target.positions[offset + axis];
            }
            const localProgress = writeStoryParticle(particleOut, particleFrom, particleTo, seeds[index], progress, transition.path);
            positions.set(particleOut, offset);

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
        const glowColor = transition.fromGlow.map((value, index) => (
            value + (transition.target.glow[index] - value) * smoothstep(progress)
        ));
        applyGlow(glowColor, wave);

        if (progress >= 1) completeTransition(now);
        return progress;
    }

    function render(_wallTime, dt) {
        if (disposed) return;
        const frameStartedAt = performance.now();
        interaction.step(dt);
        if (interaction.dragging) playbackRate = 0;
        else {
            // A held object returns to its natural motion gently. Integrate
            // the exponential rate exactly so refresh rate does not alter it.
            const decay = Math.exp(-dt * 10);
            timeline += (dt - (1 - playbackRate) * (1 - decay) / 10) * 1000;
            playbackRate = 1 - (1 - playbackRate) * decay;
        }
        const now = timeline;
        resumePendingAdvance();

        if (queuedAdvance && !transition && !pendingAdvance && !paused && !reducedMotion && !interaction.dragging && now >= queuedReadyAt) {
            queuedAdvance = false;
            beginMorph(now, true);
        }

        // Start at the nominal chapter boundary and immediately sample the
        // elapsed handoff. Holding the previous rendered angle for one frame
        // made its departure depend on refresh rate.
        if (!transition && !pendingAdvance && autoCycle && !reducedMotion && !paused && !interaction.dragging && now - holdStartedAt >= HOLD_DURATIONS[currentShape.name]) beginMorph(holdStartedAt + HOLD_DURATIONS[currentShape.name]);
        const progress = updateMorph(now);
        if (!transition) applyGlow(currentShape.glow);

        const targetName = transition ? transition.target.name : currentShape.name;
        const transitionTarget = transition?.target.name ?? null;
        const shapePresences = Object.fromEntries(LOGO_SHAPE_NAMES.map(name => [
            name,
            getLogoShapePresence(name, currentShape.name, transitionTarget, progress)
        ]));
        const heartPresence = shapePresences.heart;
        const chapterAge = getChapterAge(currentShape.name, now - holdStartedAt);
        const motion = getLogoMotion({ shapeName: currentShape.name, age: chapterAge, reducedMotion });
        poseCurrent = transition
            ? blendStoryPose(transition.fromPose, transition.toPose, transition.fromVelocity, transition.toVelocity, progress, transition.duration)
            : motion.rotation.map((angle, axis) => nearestStoryAngle(poseCurrent[axis], angle));
        root.rotation.set(poseCurrent[0] + interaction.value.y, poseCurrent[1] + interaction.value.x, poseCurrent[2]);
        if (inspectionRotation) root.rotation.set(...inspectionRotation);

        const beat = 1 + (reducedMotion ? 0 : transition ? transition.fromBeat * (1 - smootherstep(progress)) : motion.beat);
        const settle = transition ? 1 + Math.pow(Math.sin(progress * Math.PI), 2) * 0.012 : 1;
        const interfacePulse = reducedMotion ? 1 : getInterfacePulseScale(now - interactionPulseStartedAt);
        const baseScale = settle * interfacePulse;
        const widthBeat = 1 + (beat - 1) * 0.28;
        root.scale.set(baseScale * widthBeat, baseScale * beat, baseScale / (widthBeat * beat));
        root.position.y = reducedMotion ? 0 : transition ? transition.fromLift * (1 - smootherstep(progress)) : motion.lift;
        for (const name of LOGO_SHAPE_NAMES) {
            const coverage = getLogoCorePresence(name, currentShape.name, transitionTarget, progress);
            setCorePresence(cores[name], coverage, name === 'heart' ? (beat - 1) * 2.2 : 0);
            if (cores[name].visible) cores[name].userData.animate?.(reducedMotion ? 0 : now, {
                age: transition ? (name === currentShape.name ? getChapterAge(name, transition.startedAt - holdStartedAt) : 0) : chapterAge,
                reducedMotion, compact: variant === 'compact'
            });
        }
        glow.scale.setScalar((3.18 + Math.sin(now * 0.0014) * 0.08) * beat * (1 + (interfacePulse - 1) * 1.8));
        const morphWave = transition ? Math.sin(progress * Math.PI) : 0;
        // Finished sculptures are opaque at rest. Particles briefly carry
        // their colors and silhouette between the departing and arriving core.
        pointMaterial.uniforms.uOpacity.value = Math.pow(morphWave, 0.7);
        lineMaterial.opacity = (lightSurface ? 0.07 : 0.045) * morphWave;
        glowMaterial.opacity *= 1 - shapePresences.fsp * 0.94;
        points.visible = pointMaterial.uniforms.uOpacity.value > 0.002;
        lines.visible = lineMaterial.opacity > 0.002;
        // Keep the shader's float clock precise even in a tab left open for
        // days. Its only use is this periodic shimmer, so wrapping is seamless.
        pointMaterial.uniforms.uTime.value = (now / 1000) % (TAU / 1.35);
        pointMaterial.uniforms.uBreath.value = reducedMotion ? 0 : targetName === 'infinity'
            ? 0.32
            : targetName === 'summit'
                ? 0.24
                : heartPresence > 0.1 ? 0.22 : 0.55;

        renderer.render(scene, camera);
        if (captureRequest?.state === 'queued') {
            const request = captureRequest;
            request.state = 'encoding';
            // Read the actual frame before the browser clears its default
            // drawing buffer. A hidden preview waits until it becomes visible.
            try {
                canvas.toBlob(blob => finishCapture(request, blob ? null : new Error('Sculpture frame could not be encoded'), blob), 'image/png');
            } catch (error) { finishCapture(request, error); }
        }
        renderedFrames++;
        const frameCpu = performance.now() - frameStartedAt;
        renderCpuTotal += frameCpu;
        renderCpuMaximum = Math.max(renderCpuMaximum, frameCpu);
        // Reveal only after the first complete frame, never an empty canvas.
        if (!hasRendered) {
            hasRendered = true;
            canvas.dataset.logoRenderer = control.dataset.logoRenderer = 'three';
        }
    }

    function handleKeydown(event) {
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.repeat && ['p', 'enter', ' '].includes(event.key.toLowerCase())) { event.preventDefault(); return; }
        if (event.key.toLowerCase() === 'p') {
            event.preventDefault();
            setPaused(!paused);
            return;
        }
        // Native buttons already dispatch one click for Enter/Space.
        if (control.tagName === 'BUTTON') return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activateLogo();
    }

    function handleInterfaceMotion() {
        invalidate();
        if (reducedMotion || paused || !visible || document.hidden) return;
        interactionPulseStartedAt = timeline;
    }

    function setPaused(value) {
        if (disposed) return;
        paused = Boolean(value);
        if (paused) { queuedAdvance = false; pendingAdvance = null; interaction.cancel(); }
        frameScheduler?.resetClock();
        publishState();
        schedulePreparation();
    }

    function handleMotionPreference() {
        reducedMotion = motionPreference.matches;
        if (reducedMotion) {
            queuedAdvance = false;
            pendingAdvance = null;
            interactionPulseStartedAt = -Infinity;
            transition = null;
            currentIndex = 0;
            interaction.reset();
            playbackRate = 1;
            applyShape(shapes.fsp);
        }
        holdStartedAt = timeline;
        invalidate();
        frameScheduler?.resetClock();
        publishState();
        schedulePreparation();
    }

    function handleContextLost(event) {
        event.preventDefault();
        contextLost = true;
        cancelPreparation();
        interaction.cancel();
        running = false;
        frameScheduler?.sync();
        // Release listeners tied to the old GPU context while it is lost.
        // Three's dispose methods retain the CPU geometry/image source data.
        releaseSceneResources();
        canvas.dataset.logoRenderer = control.dataset.logoRenderer = 'context-lost';
        setCanvasAccessibility(control, 'fsp', true, true);
    }

    function handleContextRestored() {
        if (disposed || !contextLost) return;
        try {
            // Geometry and image textures can be uploaded again by Three.
            // The generated softbox environment needs a fresh GPU render.
            studioLighting.dispose();
            studioLighting = createLogoStudioLighting(THREE, renderer, scene);
            contextLost = false;
            running = true;
            hasRendered = false;
            preparedFigures.clear();
            preparationFailures.clear();
            preparedFigures.add(currentShape.name);
            preparationQueue = LOGO_SHAPE_NAMES.filter(name => name !== currentShape.name);
            publishState();
            frameScheduler?.resetClock();
            invalidate();
            schedulePreparation();
        } catch (error) {
            console.warn('Sherpa sculpture could not restore its studio lighting.', error);
        }
    }

    function releaseSceneResources() {
        pointGeometry.dispose();
        lineGeometry.dispose();
        pointMaterial.dispose();
        lineMaterial.dispose();
        Object.values(cores).forEach(disposeCore);
        Object.values(textures).forEach(texture => texture.dispose());
        glowMaterial.map.dispose();
        glowMaterial.dispose();
        studioLighting.dispose();
    }

    const observer = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(entries => {
            visible = entries.some(entry => entry.isIntersecting);
            if (!visible) interaction.cancel();
            frameScheduler?.resetClock();
            invalidate();
            schedulePreparation();
        }, { threshold: 0.05 })
        : null;
    observer?.observe(control);

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(control);
    const languageObserver = new MutationObserver(() => publishState());
    languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    control.addEventListener('click', activateLogo);
    control.addEventListener('keydown', handleKeydown);
    motionPreference.addEventListener?.('change', handleMotionPreference);
    window.addEventListener('sherpa:navigation', handleInterfaceMotion);
    window.addEventListener('sherpa-theme-changed', handleInterfaceMotion);
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);
    const handleVisibilityChange = () => {
        if (document.hidden) interaction.cancel();
        frameScheduler?.resetClock();
        invalidate();
        schedulePreparation();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', resize);

    frameScheduler = createAnimationScheduler({
        isActive: () => running && visible && !document.hidden,
        isAnimated: () => !paused && !reducedMotion,
        onFrame: render
    });
    resize();
    publishState();
    applyGlow(currentShape.glow);
    render(performance.now(), 0);
    invalidate();
    schedulePreparation();

    return {
        prepared,
        next: beginMorph,
        pause: () => setPaused(true),
        resume: () => setPaused(false),
        setAutoCycle(value) {
            if (disposed) return;
            const enabled = Boolean(value);
            if (enabled && !autoCycle && !transition) holdStartedAt = timeline - getChapterAge(currentShape.name, timeline - holdStartedAt);
            autoCycle = enabled;
        },
        setInspectionRotation(rotation = null) {
            if (disposed) return;
            if (rotation !== null && (!Array.isArray(rotation) || rotation.length !== 3 || !rotation.every(Number.isFinite))) {
                throw new TypeError('Inspection rotation must contain three finite angles or be null');
            }
            inspectionRotation = rotation?.slice() ?? null;
            invalidate();
        },
        setInspectionTime(time) {
            if (disposed) return;
            if (!Number.isFinite(time) || time < 0) throw new RangeError('Inspection time must be a finite non-negative number');
            setPaused(true);
            interaction.reset();
            timeline = time % LOGO_STORY_DURATION;
            playbackRate = 1;
            const frame = getStoryChapterAt(timeline);
            transition = null;
            currentIndex = frame.index;
            holdStartedAt = timeline - frame.age;
            const motion = getStoryMotion(frame.name, frame.age);
            poseCurrent = motion.rotation;
            root.position.y = motion.lift;
            applyShape(shapes[frame.name]);
            if (frame.transition) beginMorph(timeline - frame.progress * getLogoChapter(frame.name).duration, false, true);
            invalidate();
            publishState();
        },
        captureFrame() {
            if (disposed) return Promise.reject(new Error('Sculpture has been disposed'));
            if (typeof canvas.toBlob !== 'function') return Promise.reject(new Error('Sculpture frame export is unavailable'));
            if (captureRequest) finishCapture(captureRequest, new Error('A newer sculpture frame was requested'));
            return new Promise((resolve, reject) => {
                const request = { resolve, reject, state: 'queued', timeout: null };
                request.timeout = setTimeout(() => finishCapture(request, new Error('Sculpture is not visible or its graphics context is unavailable')), 5000);
                captureRequest = request;
                invalidate();
            });
        },
        getDiagnostics: () => ({
            shape: currentShape.name, transitioning: Boolean(transition),
            chapter: getLogoChapter(currentShape.name).meaning,
            chapterAgeMs: getChapterAge(currentShape.name, timeline - holdStartedAt),
            storyDurationMs: LOGO_STORY_DURATION,
            timelineMs: timeline,
            playbackRate,
            transition: transition ? { path: transition.path, target: transition.target.name, durationMs: transition.duration, progress: clamp01((timeline - transition.startedAt) / transition.duration) } : null,
            queuedAdvance, pendingAdvance: Boolean(pendingAdvance),
            running, visible, paused, reducedMotion, autoCycle, contextLost,
            inspectionRotation: inspectionRotation?.slice() ?? null,
            interaction: interaction.getDiagnostics(),
            rotation: [root.rotation.x, root.rotation.y, root.rotation.z],
            frame: renderer.info.render.frame,
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
            preparation: options.preparation?.mode || 'main-thread',
            lightingPreparation: studioLighting.preparation,
            preparationMs: options.preparation?.duration || 0,
            sceneMs: sceneDuration, shaderWarmMs: warmDuration, backgroundWarmMs,
            preparedFigures: [...preparedFigures], preparationFailures: [...preparationFailures], preparingFigure,
            framesRendered: renderedFrames,
            averageFrameCpuMs: renderedFrames ? renderCpuTotal / renderedFrames : 0,
            maximumFrameCpuMs: renderCpuMaximum,
            scheduler: frameScheduler.getDiagnostics()
        }),
        dispose() {
            if (disposed) return;
            disposed = true;
            cancelPreparation();
            finishPreparation(false);
            if (captureRequest) finishCapture(captureRequest, new Error('Sculpture has been disposed'));
            running = false;
            frameScheduler.dispose();
            observer?.disconnect();
            resizeObserver?.disconnect();
            languageObserver.disconnect();
            interaction.dispose();
            control.removeEventListener('click', activateLogo);
            control.removeEventListener('keydown', handleKeydown);
            motionPreference.removeEventListener?.('change', handleMotionPreference);
            canvas.removeEventListener('webglcontextlost', handleContextLost);
            canvas.removeEventListener('webglcontextrestored', handleContextRestored);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('resize', resize);
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
            const [textures, preparation] = await Promise.all([
                loadFspTextures(THREE),
                prepareLogoGeometries(THREE)
            ]);
            if (!control.isConnected) {
                Object.values(textures).forEach(texture => texture.dispose());
                if (imageHost) canvas.remove();
                instances.delete(control);
                return null;
            }
            let controller;
            try { controller = await createLogoScene(THREE, canvas, canvasSize, control, textures, { ...options, preparation }); }
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
