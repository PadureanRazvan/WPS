function smoothstep(low, high, value) {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
}

// A softened implicit heart. Taking the real cube root of the conventional
// cubic heart field keeps its gradient well-conditioned around the equator.
export function getHeartField(x, y, z) {
    const height = y + 0.16;
    const cleft = 0.25 * Math.exp(-x * x / 0.11) * smoothstep(0.15, 0.9, height);
    const q = height + cleft;
    return x * x + 2.65 * z * z + q * q - 1 - q * Math.cbrt(x * x + 0.3 * z * z + 0.004);
}

export function getHeartPoint(angle, depthAngle) {
    const radial = Math.cos(depthAngle);
    const dx = Math.sin(angle) * radial, dy = Math.cos(angle) * radial, dz = Math.sin(depthAngle);
    let low = 0, high = 1.6;
    for (let iteration = 0; iteration < 21; iteration++) {
        const radius = (low + high) / 2;
        if (getHeartField(dx * radius, dy * radius, dz * radius) > 0) high = radius;
        else low = radius;
    }
    const radius = (low + high) / 2;
    return [dx * radius, dy * radius, dz * radius];
}

export function getHeartNormal(x, y, z) {
    const h = 0.0001;
    const dx = getHeartField(x + h, y, z) - getHeartField(x - h, y, z);
    const dy = getHeartField(x, y + h, z) - getHeartField(x, y - h, z);
    const dz = getHeartField(x, y, z + h) - getHeartField(x, y, z - h);
    const length = Math.hypot(dx, dy, dz);
    return [dx / length, dy / length, dz / length];
}

export function getHeartColor(x, y, z) {
    const height = Math.max(0, Math.min(1, (y + 1.08) / 2.16));
    const warmth = Math.max(0, z) * 0.025;
    return [0.52 + height * 0.32 + warmth, 0.018 + height * 0.037, 0.085 + height * 0.135];
}

const PULSE_PATH = [[-0.59, -0.05], [-0.36, -0.05], [-0.28, 0.04], [-0.18, -0.05], [-0.07, -0.05], [0.025, 0.18], [0.12, -0.24], [0.21, -0.05], [0.55, -0.05]];

export function getHeartPulsePoint(progress) {
    const phase = Math.max(0, Math.min(1, progress)) * (PULSE_PATH.length - 1);
    const segment = Math.min(PULSE_PATH.length - 2, Math.floor(phase)), t = phase - segment;
    const p0 = PULSE_PATH[Math.max(0, segment - 1)], p1 = PULSE_PATH[segment];
    const p2 = PULSE_PATH[segment + 1], p3 = PULSE_PATH[Math.min(PULSE_PATH.length - 1, segment + 2)];
    const [pathX, y] = [0, 1].map(axis => {
        const v0 = (p2[axis] - p0[axis]) * 0.12, v1 = (p3[axis] - p1[axis]) * 0.12;
        return (2 * p1[axis] - 2 * p2[axis] + v0 + v1) * t * t * t
            + (-3 * p1[axis] + 3 * p2[axis] - 2 * v0 - v1) * t * t + v0 * t + p1[axis];
    });
    const x = pathX - 0.08;
    let low = 0, high = 1;
    for (let iteration = 0; iteration < 21; iteration++) {
        const z = (low + high) / 2;
        if (getHeartField(x, y, z) > 0) high = z;
        else low = z;
    }
    return [x, y, (low + high) / 2 + 0.0025];
}
