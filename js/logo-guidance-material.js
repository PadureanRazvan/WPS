// One warm highlight links the heart's pulse to the climb. It follows actual
// arc length in the capped inlay, rather than flashing the entire sculpture.
export function addGuidanceHighlight(material, { width = 0.065, intensity = 0.32 } = {}) {
    const progress = { value: 0 }, strength = { value: 0 };
    const bandWidth = { value: width }, radiance = { value: intensity };
    const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
    material.onBeforeCompile = shader => {
        compile(shader);
        shader.uniforms.uGuidanceProgress = progress;
        shader.uniforms.uGuidanceStrength = strength;
        shader.uniforms.uGuidanceWidth = bandWidth;
        shader.uniforms.uGuidanceIntensity = radiance;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float aLogoPath; varying float vGuidancePath;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGuidancePath = aLogoPath;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uGuidanceProgress; uniform float uGuidanceStrength; uniform float uGuidanceWidth; uniform float uGuidanceIntensity; varying float vGuidancePath;')
            .replace('#include <emissivemap_fragment>', `
                #include <emissivemap_fragment>
                float guidanceDistance = (vGuidancePath - uGuidanceProgress) / uGuidanceWidth;
                float guidanceLight = exp(-guidanceDistance * guidanceDistance) * uGuidanceStrength;
                totalEmissiveRadiance += vec3(1.0, 0.69, 0.32) * guidanceLight * uGuidanceIntensity;
            `);
    };
    material.customProgramCacheKey = () => `${cacheKey()}:guidance-v1`;
    return { set(state) { progress.value = state.progress; strength.value = state.strength; }, progress, strength };
}
