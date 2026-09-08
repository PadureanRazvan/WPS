const TAU = Math.PI * 2;
// Scene units. Width and depth are half extents of the rounded ribbon profile.
export const INFINITY_DIMENSIONS = Object.freeze({
    x: 1.12, y: 0.51, lift: 0.31,
    width: 0.19, depth: 0.055, bevel: 0.022
});

const normalize = vector => {
    const length = Math.hypot(...vector);
    return vector.map(value => value / length);
};
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
];

export function getInfinityCenter(t) {
    const { x, y, lift } = INFINITY_DIMENSIONS;
    // Opposite depths at t=0 and t=PI make a real overpass at the central cross.
    return [x * Math.sin(t), y * Math.sin(2 * t), lift * Math.cos(t)];
}

function frameAt(t) {
    const { x, y, lift } = INFINITY_DIMENSIONS;
    const derivative = [x * Math.cos(t), 2 * y * Math.cos(2 * t), -lift * Math.sin(t)];
    const tangent = normalize(derivative);
    // The planar tangent never vanishes. This periodic frame closes cleanly
    // without the sudden flips a Frenet frame can produce at an inflection.
    const side = normalize([-tangent[1], tangent[0], 0]);
    const front = normalize(cross(tangent, side));
    const twist = 0.42 * Math.sin(2 * t) + 0.08 * Math.sin(t);
    const c = Math.cos(twist), s = Math.sin(twist);
    return {
        center: getInfinityCenter(t), derivative,
        side: side.map((value, axis) => value * c + front[axis] * s),
        front: front.map((value, axis) => value * c - side[axis] * s)
    };
}

export function getInfinityFrame(t) {
    const frame = frameAt(t), h = 0.0001, before = frameAt(t - h), after = frameAt(t + h);
    // Include the changing frame in surface normals, so the twisted faces
    // reflect light smoothly instead of shading like an untwisted tube.
    frame.sideDerivative = before.side.map((value, axis) => (after.side[axis] - value) / (2 * h));
    frame.frontDerivative = before.front.map((value, axis) => (after.front[axis] - value) / (2 * h));
    return frame;
}

const { width: w, depth: d, bevel: r } = INFINITY_DIMENSIONS;
const line = (from, to, segments, part) => ({
    type: 'line', from, to, segments, part,
    length: Math.hypot(to[0] - from[0], to[1] - from[1])
});
const arc = (center, start) => ({
    type: 'arc', center, start, segments: 6, part: 'edge', length: Math.PI / 2 * r
});
const sections = [
    line([w-r,d], [-w+r,d], 10, 'body'), arc([-w+r,d-r], Math.PI/2),
    line([-w,d-r], [-w,-d+r], 2, 'edge'), arc([-w+r,-d+r], Math.PI),
    line([-w+r,-d], [w-r,-d], 10, 'body'), arc([w-r,-d+r], Math.PI*1.5),
    line([w,-d+r], [w,d-r], 2, 'edge'), arc([w-r,d-r], 0)
];
const perimeter = sections.reduce((sum, section) => sum + section.length, 0);

function profileOnSection(section, t) {
    if (section.type === 'line') {
        const [a, b] = section.from, [x, y] = section.to;
        return { width: a + (x-a)*t, depth: b + (y-b)*t,
            dw: (x-a)/section.length, dd: (y-b)/section.length, part: section.part };
    }
    const angle = section.start + t * Math.PI / 2;
    return { width: section.center[0] + Math.cos(angle)*r, depth: section.center[1] + Math.sin(angle)*r,
        dw: -Math.sin(angle), dd: Math.cos(angle), part: section.part };
}

export const INFINITY_PROFILE = sections.flatMap(section =>
    Array.from({ length: section.segments }, (_, i) => profileOnSection(section, i / section.segments))
);

export function getInfinityProfile(fraction) {
    let distance = (((fraction % 1) + 1) % 1) * perimeter;
    for (const section of sections) {
        if (distance <= section.length) return profileOnSection(section, distance / section.length);
        distance -= section.length;
    }
    return profileOnSection(sections[0], 0);
}

export function getInfinitySurfacePoint(t, profile, frame = getInfinityFrame(t)) {
    const point = frame.center.map((value, axis) => value + frame.side[axis]*profile.width + frame.front[axis]*profile.depth);
    const along = frame.derivative.map((value, axis) => value + frame.sideDerivative[axis]*profile.width + frame.frontDerivative[axis]*profile.depth);
    const across = frame.side.map((value, axis) => value*profile.dw + frame.front[axis]*profile.dd);
    return { point, normal: normalize(cross(across, along)) };
}

let pathLength = 0;
const pathLengths = [0];
for (let i = 1; i <= 1024; i++) {
    const a = getInfinityCenter((i-1)/1024*TAU), b = getInfinityCenter(i/1024*TAU);
    pathLength += Math.hypot(...a.map((value, axis) => b[axis]-value));
    pathLengths.push(pathLength);
}

export function getInfinityPathAngle(fraction) {
    const target = Math.max(0, Math.min(1, fraction)) * pathLength;
    let low = 0, high = pathLengths.length - 1;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (pathLengths[middle] < target) low = middle + 1;
        else high = middle;
    }
    const i = Math.max(1, low), t = (target - pathLengths[i-1]) / (pathLengths[i]-pathLengths[i-1]);
    return (i - 1 + t) / 1024 * TAU;
}

export function getInfinityColor(t) {
    const phase = (Math.sin(t) + 1) / 2;
    const stops = [[0.035,0.59,0.55], [0.055,0.43,0.72], [0.28,0.36,0.77]];
    const side = phase < 0.5 ? 0 : 1, q = side ? phase*2-1 : phase*2;
    const blend = q*q*(3-2*q);
    return stops[side].map((value, axis) => value + (stops[side+1][axis]-value)*blend);
}

export function getInfinityOcclusion(t, normal) {
    const phase = ((t % TAU) + TAU) % TAU;
    const frontCrossing = Math.min(phase, TAU-phase), backCrossing = Math.abs(phase-Math.PI);
    return Math.exp(-((backCrossing/0.22)**2)) * Math.max(0, normal[2])
        + Math.exp(-((frontCrossing/0.22)**2)) * Math.max(0, -normal[2]);
}
