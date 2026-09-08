// Splits a planar triangle on a shared grid before bending it onto a surface.
// Matching edge samples prevent cracks between independently triangulated faces.
export function getGridEdgeParameters(a, b, grid) {
    const parameters = [0, 1];
    for (let axis = 0; axis < 2; axis++) {
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) < 1e-12) continue;
        const low = Math.min(a[axis], b[axis]), high = Math.max(a[axis], b[axis]);
        for (let line = Math.floor(low / grid) + 1; line * grid < high; line++) {
            const t = (line * grid - a[axis]) / delta;
            if (t > 1e-10 && t < 1 - 1e-10) parameters.push(t);
        }
    }
    parameters.sort((x, y) => x - y);
    return parameters.filter((t, i) => i === 0 || t - parameters[i - 1] > 1e-10);
}

export function forEachGridTriangle(vertices, grid, emit) {
    function clip(polygon, axis, bound, above) {
        const result = [];
        for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i], b = polygon[(i + 1) % polygon.length];
            const aInside = above ? a[axis] >= bound : a[axis] <= bound;
            const bInside = above ? b[axis] >= bound : b[axis] <= bound;
            if (aInside) result.push(a);
            if (aInside !== bInside) {
                const t = (bound - a[axis]) / (b[axis] - a[axis]);
                result.push(a.map((value, index) => value + (b[index] - value) * t));
            }
        }
        return result;
    }
    const minX = Math.floor(Math.min(...vertices.map(vertex => vertex[0])) / grid);
    const maxX = Math.floor(Math.max(...vertices.map(vertex => vertex[0])) / grid);
    for (let x = minX; x <= maxX; x++) {
        const strip = clip(clip(vertices, 0, x * grid, true), 0, (x + 1) * grid, false);
        if (strip.length < 3) continue;
        const minY = Math.floor(Math.min(...strip.map(vertex => vertex[1])) / grid);
        const maxY = Math.floor(Math.max(...strip.map(vertex => vertex[1])) / grid);
        for (let y = minY; y <= maxY; y++) {
            const cell = clip(clip(strip, 1, y * grid, true), 1, (y + 1) * grid, false);
            for (let i = 1; i < cell.length - 1; i++) {
                const [p, q, r] = [cell[0], cell[i], cell[i + 1]];
                const u = [q[0] - p[0], q[1] - p[1], (q[2] ?? 0) - (p[2] ?? 0)];
                const v = [r[0] - p[0], r[1] - p[1], (r[2] ?? 0) - (p[2] ?? 0)];
                const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
                if (area > 1e-12) emit(p, q, r);
            }
        }
    }
}
