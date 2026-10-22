// Build the sculpture meshes away from input, layout and painting.
import * as THREE from '../assets/vendor/three.module.min.js';
import { createFspCore } from './logo-fsp-core.js?v=2026.10.22.2';
import { createGlobeGeometry } from './logo-globe-geometry.js?v=2026.10.22.2';
import { createHeartGeometry, createHeartInlayGeometry } from './logo-heart-geometry.js?v=2026.10.22.2';
import { createSummitGeometry } from './logo-summit-geometry.js?v=2026.10.22.2';
import { createInfinityGeometry } from './logo-infinity-geometry.js?v=2026.10.22.2';
import { serializeLogoGeometry } from './logo-geometry-cache.js?v=2026.10.22.2';
import { createLogoStudioLighting } from './logo-materials.js?v=2026.10.22.2';

function prepareEnvironment() {
    if (typeof OffscreenCanvas !== 'function') return null;
    let renderer, lighting;
    try {
        const canvas = new OffscreenCanvas(8, 8);
        const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'low-power' });
        if (!gl) return null;
        renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, powerPreference: 'low-power' });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        lighting = createLogoStudioLighting(THREE, renderer, new THREE.Scene());
        const target = lighting.environment;
        renderer.setRenderTarget(target);
        const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
        const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
        if (format !== gl.RGBA || ![gl.FLOAT, gl.HALF_FLOAT].includes(type)) return null;
        const length = target.width * target.height * 4;
        const buffer = type === gl.FLOAT ? new Float32Array(length) : new Uint16Array(length);
        gl.readPixels(0, 0, target.width, target.height, format, type, buffer);
        if (gl.getError() !== gl.NO_ERROR) return null;
        const pixels = buffer instanceof Uint16Array ? buffer : Uint16Array.from(buffer, value => THREE.DataUtils.toHalfFloat(value));
        if (!pixels.some(value => value > 0) || pixels.some(value => (value & 0x7c00) === 0x7c00)) return null;
        const texture = Object.fromEntries(['mapping', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'colorSpace', 'flipY', 'generateMipmaps'].map(key => [key, target.texture[key]]));
        return { pixels, width: target.width, height: target.height, texture };
    } catch (_) { return null; }
    finally {
        lighting?.dispose();
        renderer?.dispose();
    }
}

self.onmessage = ({ data: request } = {}) => {
    try {
        const startedAt = performance.now();
        const textures = { full: new THREE.Texture(), compact: new THREE.Texture() };
        const identity = createFspCore(THREE, textures);
        const geometries = Object.fromEntries(Object.entries(identity.userData.variants).map(([name, mesh]) => [`fsp-${name}`, mesh.geometry]));
        for (const [name, geometry] of Object.entries(createGlobeGeometry(THREE))) geometries[`globe-${name}`] = geometry;
        geometries.heart = createHeartGeometry(THREE);
        geometries['heart-inlay'] = createHeartInlayGeometry(THREE);
        for (const [name, geometry] of Object.entries(createSummitGeometry(THREE))) geometries[`summit-${name}`] = geometry;
        geometries.infinity = createInfinityGeometry(THREE);
        const transfers = new Set();
        const data = Object.fromEntries(Object.entries(geometries).map(([name, geometry]) => [name, serializeLogoGeometry(geometry, transfers)]));
        const environment = request?.lighting === false ? null : prepareEnvironment();
        if (environment) transfers.add(environment.pixels.buffer);
        self.postMessage({ data, environment, duration: performance.now() - startedAt }, [...transfers]);
    } catch (error) {
        self.postMessage({ error: error.message || 'Sculpture preparation failed' });
    }
};
