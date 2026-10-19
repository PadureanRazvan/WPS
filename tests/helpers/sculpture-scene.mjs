// Real Three.js geometry, scene graph and controller; a recording renderer
// replaces the GPU. These tests prove orchestration, not rendered appearance.
import * as THREE from '../../assets/vendor/three.module.min.js';
import { createLogoScene } from '../../js/logo-animation.js';
import { SHERPA_VERSION } from '../../js/version.js';
const { installPreparedLogoGeometries } = await import(`../../js/logo-geometry-cache.js?v=${SHERPA_VERSION.number}`);

export class SculptureTarget {
    constructor({ width = 220, height = 185 } = {}) {
        this.dataset = {}; this.attributes = new Map(); this.listeners = new Map();
        this.width = width; this.height = height; this.tagName = 'BUTTON'; this.lang = 'en';
        this.classes = new Set(); this.captures = new Set(); this.isConnected = true;
        this.classList = { contains: name => this.classes.has(name) };
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name); }
    addEventListener(name, handler) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(handler); }
    removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
    emit(name, details = {}) {
        const event = { key: '', pointerId: 1, pointerType: 'mouse', button: 0, clientX: 110, clientY: 92, detail: 1, defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true; }, ...details };
        [...this.listeners.get(name) || []].forEach(handler => handler(event)); return event;
    }
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
    closest() { return this.sidebar || null; }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
    getContext() { return { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }; }
    remove() { this.isConnected = false; }
    listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

export async function sculptureFixture(testContext, { autoCycle = true, reduced = false, compact = false, onCompile = null, waitForPreparation = true } = {}) {
    const frames = new Map(), saved = new Map(), observers = {};
    let nextId = 1, time = 0, renderer;
    const document = new SculptureTarget(), window = new SculptureTarget();
    const canvas = new SculptureTarget(), control = new SculptureTarget(compact ? { width: 44, height: 44 } : {});
    const motion = new SculptureTarget(); motion.matches = reduced;
    document.documentElement = new SculptureTarget(); document.documentElement.setAttribute('data-theme', 'dark');
    document.body = new SculptureTarget(); document.hidden = false;
    document.createElement = () => new SculptureTarget();
    window.devicePixelRatio = 1;
    window.matchMedia = query => query.includes('prefers-reduced-motion') ? motion : { matches: compact };
    if (compact) control.sidebar = { classList: { contains: () => true } };
    const observerClass = name => class {
        constructor(callback) { this.callback = callback; this.disconnected = false; (observers[name] ||= []).push(this); }
        observe() {}
        disconnect() { this.disconnected = true; }
    };
    class RecordingRenderer {
        constructor() {
            renderer = this; this.size = new THREE.Vector2(); this.pixelRatio = 1; this.disposals = 0;
            this.info = { render: { frame: 0, calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 1 } };
        }
        setPixelRatio(value) { this.pixelRatio = value; }
        getPixelRatio() { return this.pixelRatio; }
        setSize(width, height) { this.size.set(width, height); }
        getSize(target) { return target.copy(this.size); }
        setClearColor() {}
        async compileAsync(scene) {
            await onCompile?.({ scene, canvas, control, renderer: this });
            scene.traverse(object => {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                for (const material of materials) {
                    if (!material || material.isShaderMaterial) continue;
                    const source = material.isMeshStandardMaterial ? THREE.ShaderLib.physical : THREE.ShaderLib.basic;
                    const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: {} };
                    material.onBeforeCompile(shader);
                    const attributes = [...shader.vertexShader.matchAll(/attribute\s+float\s+(aLogo\w+)/g)].map(match => match[1]);
                    for (const attribute of attributes) if (!object.geometry?.getAttribute(attribute)) throw new Error(`Missing shader attribute: ${attribute}`);
                }
            });
        }
        render(scene, camera) {
            scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
            this.scene = scene; this.camera = camera; this.info.render.frame++;
            const geometries = new Set();
            scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
            this.info.memory.geometries = geometries.size;
        }
        dispose() { this.disposals++; }
    }
    const namespace = { ...THREE, WebGLRenderer: RecordingRenderer };
    installPreparedLogoGeometries(namespace, {}, { pixels: Uint16Array.from([0x3c00, 0x3c00, 0x3c00, 0x3c00]), width: 1, height: 1, texture: {} });
    const globals = {
        document, window, MutationObserver: observerClass('mutation'), ResizeObserver: observerClass('resize'), IntersectionObserver: observerClass('intersection'),
        requestAnimationFrame: callback => { const id = nextId++; frames.set(id, callback); return id; },
        cancelAnimationFrame: id => frames.delete(id)
    };
    for (const [name, value] of Object.entries(globals)) { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); }
    let controller;
    const restore = () => {
        controller?.dispose(); controller = null;
        for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
    };
    testContext?.after(restore);
    try {
        controller = await createLogoScene(namespace, canvas, 220, control, { full: new THREE.Texture(), compact: new THREE.Texture() }, { autoCycle });
        if (waitForPreparation && !reduced) await controller.prepared;
    }
    catch (error) { restore(); throw error; }
    function tick(delta = 1000 / 60) {
        time += delta; const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(time));
    }
    function advance(milliseconds, fps = 60) {
        const count = Math.ceil(milliseconds / (1000 / fps));
        for (let i = 0; i < count; i++) tick(milliseconds / count);
    }
    tick(0);
    return {
        controller, renderer, control, canvas, window, document, motion, observers, frames, tick, advance, restore,
        root: () => renderer.scene.children.find(child => child.isGroup),
        visible(value) { observers.intersection.forEach(observer => observer.callback([{ isIntersecting: value }])); },
        hidden(value) { document.hidden = value; document.emit('visibilitychange'); },
        reduced(value) { motion.matches = value; motion.emit('change'); },
        resize(width, height, dpr = 1) { control.width = width; control.height = height; window.devicePixelRatio = dpr; observers.resize.forEach(observer => observer.callback()); }
    };
}
