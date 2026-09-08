// TubeGeometry leaves open ends. These small metal inlays need closed cut faces
// with independent normals, so their caps remain flat under studio lighting.
export function createCappedTubeGeometry(THREE, curve, segments, radius, radialSegments = 8) {
    const geometry = new THREE.TubeGeometry(curve, segments, radius, radialSegments, false);
    const positions = Array.from(geometry.attributes.position.array);
    const normals = Array.from(geometry.attributes.normal.array);
    const uv = Array.from(geometry.attributes.uv.array);
    const indices = Array.from(geometry.index.array);
    for (const end of [0, 1]) {
        const center = curve.getPoint(end), normal = curve.getTangent(end).multiplyScalar(end ? 1 : -1);
        const first = positions.length / 3;
        positions.push(...center.toArray()); normals.push(...normal.toArray()); uv.push(end, 0.5);
        const ring = [];
        for (let i = 0; i < radialSegments; i++) {
            const point = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, end * segments * (radialSegments + 1) + i);
            ring.push(point);
            positions.push(...point.toArray()); normals.push(...normal.toArray()); uv.push(end, i / radialSegments);
        }
        for (let i = 0; i < radialSegments; i++) {
            const next = (i + 1) % radialSegments;
            const winding = ring[i].clone().sub(center).cross(ring[next].clone().sub(center)).dot(normal);
            indices.push(first, first + 1 + (winding > 0 ? i : next), first + 1 + (winding > 0 ? next : i));
        }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
}
