// One quiet journey: a shared identity, care, progress, wider horizons,
// and a promise to keep going. Timing belongs to the action each figure tells.
const chapter = (name, meaning, hold, transition, duration) => Object.freeze({ name, meaning, hold, transition, duration });
export const LOGO_STORY = Object.freeze([
    chapter('fsp', 'belonging', 15000, 'gather', 1900),
    chapter('heart', 'care', 8800, 'rise', 2100),
    chapter('summit', 'progress', 10500, 'horizon', 2200),
    chapter('globe', 'possibility', 14000, 'flow', 2100),
    chapter('infinity', 'continuity', 10800, 'return', 2300)
]);
export const LOGO_SHAPE_NAMES = Object.freeze(LOGO_STORY.map(item => item.name));
export const HOLD_DURATIONS = Object.freeze(Object.fromEntries(LOGO_STORY.map(item => [item.name, item.hold])));
export const LOGO_STORY_DURATION = LOGO_STORY.reduce((sum, item) => sum + item.hold + item.duration, 0);
const byName = Object.fromEntries(LOGO_STORY.map(item => [item.name, item]));
const TAU = Math.PI * 2;
export const clampUnit = value => Math.max(0, Math.min(1, value));
export function easeStory(value) {
    const t = clampUnit(value);
    return t * t * t * (t * (t * 6 - 15) + 10);
}
export const getLogoChapter = name => byName[name] || byName.fsp;
export const getChapterAge = (name, age = 0) => {
    const hold = getLogoChapter(name).hold;
    return ((age % hold) + hold) % hold;
};

export function getStoryBeat(age = 0) {
    // Three complete, soft double beats; room to arrive and room to leave.
    if (age < 800 || age > 8000) return 0;
    const phase = ((age - 800) % 2400) / 2400;
    const first = Math.exp(-(((phase - 0.19) / 0.048) ** 2)) * 0.04;
    const second = Math.exp(-(((phase - 0.33) / 0.064) ** 2)) * 0.022;
    const envelope = easeStory((age - 800) / 320) * (1 - easeStory((age - 7560) / 440));
    return (first + second) * envelope;
}

export function getHeartSignalState(age = 0, reducedMotion = false) {
    if (reducedMotion || age < 800 || age > 8000) return { progress: 0, strength: 0 };
    const phase = (age - 800) % 2400;
    return {
        progress: clampUnit(phase / 1200),
        strength: easeStory(phase / 160) * (1 - easeStory((phase - 1020) / 180))
    };
}

export function getGlobeOrbitState(age = 0, reducedMotion = false) {
    const progress = reducedMotion ? 0 : easeStory((getChapterAge('globe', age) - 650) / 12300);
    return { progress, angle: 0.8 + progress * TAU };
}

export function getGlobeSpinState(age = 0, reducedMotion = false) {
    const progress = reducedMotion ? 0 : easeStory((getChapterAge('globe', age) / HOLD_DURATIONS.globe - 0.055) / 0.89);
    return { progress, angle: progress * TAU };
}

export function getInfinityFlowState(age = 0, reducedMotion = false) {
    if (reducedMotion) return { progress: 0, strength: 0 };
    const localAge = getChapterAge('infinity', age);
    return {
        progress: clampUnit((localAge - 750) / 8500),
        strength: easeStory((localAge - 300) / 600) * (1 - easeStory((localAge - 9700) / 700))
    };
}

export function getStoryMotion(name, age = 0, reducedMotion = false) {
    const localAge = getChapterAge(name, age);
    const phase = reducedMotion ? 0 : localAge / getLogoChapter(name).hold;
    const wave = Math.sin(phase * TAU);
    const sway = Math.sin(phase * TAU * 2);
    let rotation;
    switch (name) {
        case 'heart': rotation = [0.08 + wave * 0.035, 0.28 + wave * 0.11, sway * 0.018]; break;
        case 'summit': rotation = [0.15 + wave * 0.025, 0.32 + wave * 0.12, sway * 0.012]; break;
        case 'globe': rotation = [0.18 + wave * 0.035, 0.1 + wave * 0.1, wave * 0.015]; break;
        case 'infinity': rotation = [0.11 + wave * 0.045, 0.16 + wave * 0.16, sway * 0.035]; break;
        // The name stays readable. The globe owns the full exploratory turn;
        // the identity welcomes with a shallow, light-catching arc.
        default: rotation = [0.055 + wave * 0.025, 0.1 + wave * 0.28, sway * 0.012];
    }
    const beat = !reducedMotion && name === 'heart' ? getStoryBeat(localAge) : 0;
    return { rotation, beat, lift: reducedMotion ? 0 : wave * (name === 'summit' ? 0.008 : 0.014), age: localAge };
}

export function nearestStoryAngle(reference, angle) {
    return angle + Math.round((reference - angle) / TAU) * TAU;
}

export function getStoryVelocity(name, age = 0) {
    const before = getStoryMotion(name, age - 1).rotation;
    const after = getStoryMotion(name, age + 1).rotation;
    return after.map((angle, axis) => (nearestStoryAngle(before[axis], angle) - before[axis]) * 500);
}

// Quintic Hermite interpolation preserves the departing velocity, arrives with
// the next chapter's velocity, and has zero acceleration at both ends.
export function blendStoryPose(from, to, fromVelocity, toVelocity, progress, duration) {
    const t = clampUnit(progress), t2 = t * t, t3 = t2 * t, t4 = t3 * t, t5 = t4 * t;
    const blend = 6 * t5 - 15 * t4 + 10 * t3;
    const departure = t - 6 * t3 + 8 * t4 - 3 * t5;
    const arrival = -4 * t3 + 7 * t4 - 3 * t5;
    const seconds = duration / 1000;
    return from.map((angle, axis) => angle + (nearestStoryAngle(angle, to[axis]) - angle) * blend
        + fromVelocity[axis] * seconds * departure + toVelocity[axis] * seconds * arrival);
}

// A spatial delay and one coherent bend replace the same random swirl between
// every pair. No allocation in the particle loop; output is a reusable triple.
export function writeStoryParticle(out, from, to, seed, progress, path = 'gather') {
    const p = clampUnit(progress);
    const height = clampUnit((to[1] + 1.35) / 2.7);
    const direction = path === 'rise' ? height : path === 'flow' ? clampUnit((to[0] + 1.4) / 2.8) : seed;
    const delay = direction * 0.12;
    const t = easeStory((p - delay) / (1 - delay));
    // This envelope and its derivative both vanish at the endpoints.
    const arc = 16 * t * t * (1 - t) * (1 - t);
    const x = from[0] + (to[0] - from[0]) * t;
    const y = from[1] + (to[1] - from[1]) * t;
    const z = from[2] + (to[2] - from[2]) * t;
    switch (path) {
        case 'rise':
            out[0] = x + arc * Math.sin(height * Math.PI) * 0.055;
            out[1] = y + arc * 0.17;
            out[2] = z + arc * 0.09;
            break;
        case 'horizon': {
            const side = Math.tanh(from[0] * 2.1);
            out[0] = x + arc * side * 0.17;
            out[1] = y + arc * (0.06 - Math.abs(side) * 0.06);
            out[2] = z + arc * (0.14 - side * side * 0.1);
            break;
        }
        case 'flow':
            out[0] = x + arc * Math.tanh(to[0] * 2) * 0.12;
            out[1] = y + arc * Math.sin(to[0] * 2.3) * 0.1;
            out[2] = z + arc * Math.cos(to[0] * 2.3) * 0.1;
            break;
        case 'return':
            out[0] = x * (1 - arc * 0.08);
            out[1] = y + arc * 0.065;
            out[2] = z * (1 - arc * 0.12);
            break;
        default:
            out[0] = x * (1 - arc * 0.12);
            out[1] = y * (1 - arc * 0.08);
            out[2] = z + arc * 0.09;
    }
    return t;
}

export function getStoryChapterAt(time = 0) {
    let remaining = ((time % LOGO_STORY_DURATION) + LOGO_STORY_DURATION) % LOGO_STORY_DURATION;
    for (let index = 0; index < LOGO_STORY.length; index++) {
        const item = LOGO_STORY[index];
        if (remaining < item.hold) return { name: item.name, index, age: remaining, transition: null, progress: 0 };
        remaining -= item.hold;
        if (remaining < item.duration) return { name: item.name, index, age: item.hold, transition: LOGO_STORY[(index + 1) % LOGO_STORY.length].name, progress: remaining / item.duration };
        remaining -= item.duration;
    }
    return { name: 'fsp', index: 0, age: 0, transition: null, progress: 0 };
}

export function getStoryDissolve(path, arriving = false) {
    // [radial field, horizontal sweep, vertical sweep]. The incoming form
    // grows behind the same directional movement that releases the old one.
    if (path === 'rise') return [0, 0, arriving ? 1 : -1];
    if (path === 'flow') return [0, arriving ? 1 : -1, 0];
    if (path === 'return' && arriving) return [0, 0, -1];
    return [1, 0, 0];
}
