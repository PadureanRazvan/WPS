import { prepareLogoMaterial } from './logo-materials.js?v=2026.09.07';

export function createInfinityMaterials(THREE) {
    const flow = { value: 0 }, strength = { value: 1 };
    const materials = [
        new THREE.MeshPhysicalMaterial({
            vertexColors: true, metalness: 0.34, roughness: 0.34,
            clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 0.55
        }),
        new THREE.MeshPhysicalMaterial({
            color: 0xdcc492, metalness: 0.75, roughness: 0.3,
            clearcoat: 0.25, envMapIntensity: 0.65
        })
    ].map(material => {
        prepareLogoMaterial(material);
        const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
        material.onBeforeCompile = shader => {
            compile(shader);
            shader.uniforms.uLogoFlow = flow;
            shader.uniforms.uLogoFlowStrength = strength;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute float aLogoPath; attribute float aLogoOcclusion; varying float vLogoPath; varying float vLogoOcclusion;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLogoPath = aLogoPath; vLogoOcclusion = aLogoOcclusion;');
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform float uLogoFlow; uniform float uLogoFlowStrength; varying float vLogoPath; varying float vLogoOcclusion;')
                .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - vLogoOcclusion * 0.34;')
                .replace('#include <emissivemap_fragment>', `
                    #include <emissivemap_fragment>
                    float flowDistance = abs(vLogoPath - uLogoFlow);
                    flowDistance = min(flowDistance, 1.0 - flowDistance);
                    float flowGleam = exp(-pow(flowDistance / 0.026, 2.0)) * uLogoFlowStrength;
                    totalEmissiveRadiance += vec3(0.055, 0.075, 0.09) * flowGleam;
                `);
        };
        material.customProgramCacheKey = () => `${cacheKey()}:infinity-flow-v1`;
        return material;
    });
    return {
        materials,
        animate(now, { reducedMotion = false } = {}) {
            flow.value = ((now * 0.000065) % 1 + 1) % 1;
            strength.value = reducedMotion ? 0 : 1;
        }
    };
}
