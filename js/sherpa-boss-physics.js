// Small, deterministic screen-space physics. No DOM or renderer dependencies.
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function clampBossPosition(x, y, bounds) {
    return {
        x: clamp(finite(x), bounds.left, bounds.right),
        y: clamp(finite(y), bounds.top, bounds.bottom)
    };
}

// An exact damped spring step, stable even when the display changes refresh rate.
export function stepBossSpring(position, velocity, target, dt, frequency = 10, damping = 0.52) {
    if (!(dt > 0)) return [position, velocity];
    const omega = frequency;
    const decay = Math.exp(-damping * omega * dt);
    const frequencyDamped = omega * Math.sqrt(1 - damping * damping);
    const offset = position - target;
    const sin = Math.sin(frequencyDamped * dt);
    const cos = Math.cos(frequencyDamped * dt);
    const nextPosition = decay * (offset * cos + (velocity + damping * omega * offset) / frequencyDamped * sin);
    const nextVelocity = decay * (velocity * cos - (damping * omega * velocity + omega * omega * offset) / frequencyDamped * sin);
    return [target + nextPosition, nextVelocity];
}

export function createBossPhysics({ x = 0, y = 0, bounds, reducedMotion = false }) {
    let limits = { ...bounds };
    const initial = clampBossPosition(x, y, limits);
    const state = {
        ...initial, vx: 0, vy: 0, dragging: false, falling: false, impact: 0,
        torso: 0, torsoVelocity: 0, swing: 0, swingVelocity: 0,
        legSwing: 0, legVelocity: 0, dragX: 0, dragY: 0
    };
    let reduced = reducedMotion;
    let lastDrag = null;
    const stop = () => {
        state.vx = state.vy = 0;
        state.falling = false;
        state.impact = 0;
    };
    const setPosition = (nextX, nextY) => Object.assign(state, clampBossPosition(nextX, nextY, limits));

    return {
        state,
        setBounds(nextBounds) {
            limits = { ...nextBounds };
            setPosition(state.x, state.y);
        },
        setReducedMotion(value) {
            reduced = Boolean(value);
            if (reduced) {
                stop();
                state.torso = state.torsoVelocity = state.swing = state.swingVelocity = state.legSwing = state.legVelocity = 0;
            }
        },
        move(nextX, nextY) { stop(); setPosition(nextX, nextY); },
        grab(time = 0) {
            stop();
            state.dragging = true;
            lastDrag = { x: state.x, y: state.y, time };
        },
        drag(nextX, nextY, time = 0) {
            if (!state.dragging) return;
            setPosition(nextX, nextY);
            const elapsed = lastDrag ? (time - lastDrag.time) / 1000 : 0;
            if (elapsed > 0 && elapsed < 0.2) {
                const vx = clamp((state.x - lastDrag.x) / Math.max(elapsed, 0.008), -2000, 2000);
                const vy = clamp((state.y - lastDrag.y) / Math.max(elapsed, 0.008), -1800, 1800);
                const weight = 1 - Math.exp(-elapsed * 24);
                state.vx += (vx - state.vx) * weight;
                state.vy += (vy - state.vy) * weight;
                state.dragX = vx;
                state.dragY = vy;
                if (!reduced) {
                    state.swingVelocity += clamp((vx - state.vx) * 0.0018, -1.7, 1.7);
                    state.legVelocity += clamp((vx - state.vx) * -0.0012, -1.2, 1.2);
                }
            }
            lastDrag = { x: state.x, y: state.y, time };
        },
        release({ cancel = false, time = 0 } = {}) {
            if (!state.dragging) return;
            state.dragging = false;
            if (cancel || reduced) stop();
            else {
                // A held pointer must not retain the last fling's velocity.
                if (lastDrag && time - lastDrag.time > 120) state.vx = state.vy = 0;
                state.vx *= .75; state.vy *= .75;
                state.falling = true;
                state.torsoVelocity += clamp(state.vx * -0.003, -3, 3);
            }
            state.dragX = state.dragY = 0;
            lastDrag = null;
        },
        stop,
        step(seconds) {
            if (reduced) return state;
            const duration = clamp(finite(seconds), 0, 0.08);
            const steps = Math.max(1, Math.ceil(duration / (1 / 120)));
            const dt = duration / steps;
            for (let step = 0; step < steps; step++) {
                if (state.falling && !reduced) {
                    state.vy += 1500 * dt;
                    state.vx *= Math.exp(-1.15 * dt);
                    state.x += state.vx * dt;
                    state.y += state.vy * dt;
                    if (state.x < limits.left || state.x > limits.right) {
                        state.x = clamp(state.x, limits.left, limits.right);
                        state.vx *= -0.28;
                        state.torsoVelocity += state.vx * 0.002;
                    }
                    if (state.y < limits.top) { state.y = limits.top; state.vy = Math.abs(state.vy) * 0.22; }
                    if (state.y >= limits.bottom) {
                        state.y = limits.bottom;
                        state.impact = Math.min(1, Math.abs(state.vy) / 850);
                        state.swingVelocity += state.vy * 0.0035;
                        state.legVelocity -= state.vy * 0.002;
                        state.vy *= -0.19;
                        state.vx *= 0.64;
                        if (Math.abs(state.vy) < 65) stop();
                    }
                }
                const hanging = state.dragging ? clamp(-state.vx / 1600, -0.55, 0.55) : 0;
                [state.torso, state.torsoVelocity] = stepBossSpring(state.torso, state.torsoVelocity, hanging, dt, 9, 0.56);
                [state.swing, state.swingVelocity] = stepBossSpring(state.swing, state.swingVelocity, state.dragging ? clamp(state.vx / 1050, -0.9, 0.9) : 0, dt, 7.5, 0.32);
                [state.legSwing, state.legVelocity] = stepBossSpring(state.legSwing, state.legVelocity, state.dragging ? clamp(state.vx / -1800, -0.55, 0.55) : 0, dt, 8.5, 0.4);
                state.torso = clamp(state.torso, -0.95, 0.95);
                state.swing = clamp(state.swing, -1.3, 1.3);
                state.legSwing = clamp(state.legSwing, -0.7, 0.7);
                state.impact *= Math.exp(-dt * 7);
                if (state.dragging) { state.vx *= Math.exp(-dt * 4); state.vy *= Math.exp(-dt * 4); }
            }
            return state;
        }
    };
}
