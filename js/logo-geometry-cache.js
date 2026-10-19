// CPU templates are shared. Every rendered sculpture still clones its own buffers.
const prepared = new WeakMap();
const environments = new WeakMap();

export function getPreparedLogoEnvironment(THREE) {
    return environments.get(THREE) || null;
}

export function getPreparedLogoGeometry(THREE, name) {
    return prepared.get(THREE)?.get(name) || null;
}

export function serializeLogoGeometry(geometry, transfers = new Set()) {
    const attribute = value => {
        transfers.add(value.array.buffer);
        return { array: value.array, itemSize: value.itemSize, normalized: value.normalized };
    };
    return {
        attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, value]) => [name, attribute(value)])),
        index: geometry.index ? attribute(geometry.index) : null,
        groups: geometry.groups.map(group => ({ ...group }))
    };
}

export function installPreparedLogoGeometries(THREE, data, environment = null) {
    const geometries = new Map();
    try {
        for (const [name, source] of Object.entries(data)) {
            const geometry = new THREE.BufferGeometry();
            geometries.set(name, geometry);
            for (const [key, attribute] of Object.entries(source.attributes)) {
                geometry.setAttribute(key, new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized));
            }
            if (source.index) geometry.setIndex(new THREE.BufferAttribute(source.index.array, 1));
            for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
            geometry.computeBoundingSphere();
        }
    } catch (error) {
        geometries.forEach(geometry => geometry.dispose());
        throw error;
    }
    prepared.set(THREE, geometries);
    if (environment?.pixels instanceof Uint16Array && environment.pixels.length === environment.width * environment.height * 4) {
        environments.set(THREE, environment);
    }
}
