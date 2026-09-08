/** Material controls shared by the sculptural logo figures. */
export function prepareLogoMaterial(material, opacity = 1) {
    material.userData.logoOpacity = opacity;
    material.userData.logoEmissiveIntensity = material.emissiveIntensity ?? 0;
    material.userData.logoPresence = { value: 0 };
    material.transparent = opacity < 1;
    material.opacity = opacity;
    material.depthWrite = opacity >= 0.99;
    material.onBeforeCompile = shader => {
        shader.uniforms.uLogoPresence = material.userData.logoPresence;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vLogoPosition;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLogoPosition = position;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
            #include <common>
            uniform float uLogoPresence;
            varying vec3 vLogoPosition;
            // Device-pixel coverage stays fine at every preview size, with a
            // shared threshold across overlapping parts of the same sculpture.
            float logoCoverageNoise(vec2 pixel) {
                return fract(52.9829189 * fract(dot(floor(pixel), vec2(0.06711056, 0.00583715))));
            }
        `).replace('#include <clipping_planes_fragment>', `
            #include <clipping_planes_fragment>
            if (uLogoPresence < 0.999) {
                float field = logoCoverageNoise(gl_FragCoord.xy) * 0.9
                    + clamp((vLogoPosition.y + 1.5) / 3.0, 0.0, 1.0) * 0.1;
                if (field > uLogoPresence) discard;
            }
        `);
    };
    material.customProgramCacheKey = () => 'sherpa-sculpture-dissolve-v4';
    return material;
}

/** Soft boxes are generated locally; no remote HDR download or extra request. */
export function createLogoStudioLighting(THREE, renderer, scene) {
    const room = new THREE.Scene();
    room.background = new THREE.Color(0.14, 0.18, 0.2);
    const panelGeometry = new THREE.PlaneGeometry(1, 1);
    const panelMaterials = [];
    function panel(position, width, height, color) {
        const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), toneMapped: false });
        panelMaterials.push(material);
        const mesh = new THREE.Mesh(panelGeometry, material);
        mesh.position.set(...position);
        mesh.scale.set(width, height, 1);
        mesh.lookAt(0, 0, 0);
        room.add(mesh);
    }
    panel([-3, 3.5, 4], 3.5, 5.5, [5, 4.8, 4.5]);
    panel([4, 0.5, 2], 2, 5, [2.1, 2.6, 3]);
    panel([-2, 1, -4], 3, 4, [1.7, 2.3, 2.5]);
    panel([0, -4, 1], 5, 2, [0.65, 0.8, 0.85]);
    const generator = new THREE.PMREMGenerator(renderer);
    let environment;
    try { environment = generator.fromScene(room, 0.035, 0.1, 30, { size: 128 }); }
    finally {
        generator.dispose();
        panelGeometry.dispose();
        panelMaterials.forEach(material => material.dispose());
    }
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.8;
    // Explicit maps let each finish keep its own reflection strength. Three
    // otherwise substitutes Scene.environmentIntensity for envMapIntensity.
    scene.traverse(object => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if (material?.isMeshStandardMaterial && !material.envMap) material.envMap = environment.texture;
        }
    });
    const ambient = new THREE.HemisphereLight(0xe2f2ef, 0x344653, 1.3);
    const key = new THREE.DirectionalLight(0xfff2de, 2.7);
    key.position.set(-3, 4, 5);
    const fill = new THREE.DirectionalLight(0xbedfff, 0.8);
    fill.position.set(3, 1, 2);
    const rim = new THREE.DirectionalLight(0xb2f3e6, 1.8);
    rim.position.set(-2, 1.5, -3);
    scene.add(ambient, key, fill, rim);
    let disposed = false;
    return {
        dispose() {
            if (disposed) return;
            disposed = true;
            scene.traverse(object => {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                for (const material of materials) {
                    if (material?.envMap === environment.texture) {
                        material.envMap = null;
                        material.needsUpdate = true;
                    }
                }
            });
            scene.environment = null;
            scene.remove(ambient, key, fill, rim);
            environment.dispose();
        }
    };
}
