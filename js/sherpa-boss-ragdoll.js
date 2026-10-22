// A small position-based articulated body in screen pixels. The grabbed point is
// a constraint on a bone, so hands, feet and head each carry the body differently.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const MAX_SPEED = 1200;
const NECK_LIMIT = .58;
export const BOSS_BONES = {
    torso: ['hip', 'neck'], head: ['headBase', 'head'],
    leftUpperArm: ['leftShoulder', 'leftElbow'], rightUpperArm: ['rightShoulder', 'rightElbow'],
    leftForearm: ['leftElbow', 'leftWrist'], rightForearm: ['rightElbow', 'rightWrist'],
    leftHand: ['leftElbow', 'leftWrist'], rightHand: ['rightElbow', 'rightWrist'],
    leftThigh: ['leftHip', 'leftKnee'], rightThigh: ['rightHip', 'rightKnee'],
    leftShin: ['leftKnee', 'leftAnkle'], rightShin: ['rightKnee', 'rightAnkle'],
    leftFoot: ['leftKnee', 'leftAnkle'], rightFoot: ['rightKnee', 'rightAnkle']
};
const REST = {
    hip: [0, 1.46, .19, .32], neck: [0, 2.43, .17, .32], headBase: [0, 2.72, .10, .4], head: [0, 3.085, .56, 1],
    leftShoulder: [-.44, 2.43, .13, .65], rightShoulder: [.44, 2.43, .13, .65],
    leftElbow: [-.50, 1.914, .105, 1.5], rightElbow: [.50, 1.914, .105, 1.5],
    leftWrist: [-.55, 1.38, .075, 2], rightWrist: [.55, 1.38, .075, 2],
    leftHip: [-.19, 1.46, .14, .6], rightHip: [.19, 1.46, .14, .6],
    leftKnee: [-.19, .81, .105, 1.25], rightKnee: [.19, .81, .105, 1.25],
    leftAnkle: [-.19, .11, .10, 1.8], rightAnkle: [.19, .11, .10, 1.8]
};

export function bossRestPoints({ x, y, scale }) {
    return Object.fromEntries(Object.entries(REST).map(([name, [px, py]]) => [name, { x: x + px * scale, y: y - (py - 1.46) * scale }]));
}

export function pickBossBone(points, x, y, scale = 50) {
    let nearest = { part: 'torso', t: .5, distance: Infinity };
    for (const [part, [a, b]] of Object.entries(BOSS_BONES)) {
        if (part.endsWith('Hand') || part.endsWith('Foot')) continue;
        const p = points[a], q = points[b], dx = q.x - p.x, dy = q.y - p.y;
        const t = clamp(((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        const distance = Math.hypot(x - mix(p.x, q.x, t), y - mix(p.y, q.y, t));
        const radius = (part === 'head' ? .43 : part === 'torso' ? .34 : .13) * scale;
        const score = distance - radius;
        if (score < nearest.distance) nearest = { part, t, distance: score };
    }
    return nearest;
}

export function createBossRagdoll({ points: seed, scale = 50, bounds }) {
    let limits = { ...bounds }, accumulator = 0, releasedFor = 0, settledFor = 0, recovery = null;
    let grip = null, previousDrag = null, reversal = { x: 0, y: 0, time: -Infinity }, cooldown = 0;
    let contacts = new Map(), previousContacts = new Set(), dragSpeed = 0, dragVelocityX = 0;
    const points = Object.fromEntries(Object.entries(REST).map(([name, [, , radius, mass]]) => {
        const p = seed[name];
        return [name, { x: p.x, y: p.y, px: p.x, py: p.y, radius: radius * scale, weight: mass }];
    }));
    const state = { points, dragging: false, falling: false, recovering: false, done: false, part: null,
        discomfort: 0, impact: 0, impactSide: null, impactPart: null, impactCount: 0, recovery: 0 };
    const constraints = [];
    const connect = (a, b) => {
        if (constraints.some(c => c.a === a && c.b === b || c.a === b && c.b === a)) return;
        constraints.push({ a, b, length: Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) });
    };
    // This complete frame behaves as a rigid torso. Head and limbs remain free.
    const frame = ['hip', 'neck', 'headBase', 'leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'];
    frame.forEach((a, i) => frame.slice(i + 1).forEach(b => connect(a, b)));
    for (const [a, b] of Object.values(BOSS_BONES)) connect(a, b);
    const headLength = Math.hypot(points.head.x - points.headBase.x, points.head.y - points.headBase.y);
    const impact = (side, part, speed) => {
        if (speed < 110 || cooldown > 0) return;
        state.impact = Math.max(state.impact, clamp(speed / 1200, .15, .78));
        state.impactSide = side; state.impactPart = part; state.impactCount++;
        state.discomfort = Math.max(state.discomfort, state.impact * .85);
        cooldown = .22;
    };
    function constrainGrip() {
        if (!grip) return;
        const [a, b] = BOSS_BONES[grip.part], p = points[a], q = points[b], t = grip.t;
        const dx = grip.x - mix(p.x, q.x, t), dy = grip.y - mix(p.y, q.y, t);
        const wa = p.weight * (1 - t), wb = q.weight * t;
        const sum = wa * (1 - t) + wb * t || 1;
        p.x += dx * wa / sum; p.y += dy * wa / sum;
        q.x += dx * wb / sum; q.y += dy * wb / sum;
    }
    function constrainBody() {
        for (const { a, b, length } of constraints) {
            const p = points[a], q = points[b], dx = q.x - p.x, dy = q.y - p.y;
            const d = Math.hypot(dx, dy) || .001, error = (d - length) / d;
            const sum = p.weight + q.weight;
            p.x += dx * error * p.weight / sum; p.y += dy * error * p.weight / sum;
            q.x -= dx * error * q.weight / sum; q.y -= dy * error * q.weight / sum;
        }
        // Elbows and knees may fold, but cannot shorten a limb to zero or turn
        // farther than a human hinge. The hands and feet still swing freely.
        for (const side of ['left', 'right']) for (const [a, b, c, minimum] of [
            [`${side}Shoulder`, `${side}Elbow`, `${side}Wrist`, .42],
            [`${side}Hip`, `${side}Knee`, `${side}Ankle`, .56]
        ]) {
            const p = points[a], q = points[c], mid = points[b];
            const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || .001;
            const min = minimum * scale;
            if (d < min) {
                q.x += dx / d * (min - d) * .7; q.y += dy / d * (min - d) * .7;
                mid.x -= dx / d * (min - d) * .15; mid.y -= dy / d * (min - d) * .15;
            }
        }
        // Keep the neck within a soft angular cone even when held upside down.
        // A completely free hinge can otherwise fold the face into the collar.
        const base = points.headBase, head = points.head;
        const tx = points.neck.x - points.hip.x, ty = points.neck.y - points.hip.y;
        const hx = head.x - base.x, hy = head.y - base.y;
        const relative = Math.atan2(tx * hy - ty * hx, tx * hx + ty * hy);
        if (Math.abs(relative) > NECK_LIMIT) {
            const angle = Math.atan2(ty, tx) + clamp(relative, -NECK_LIMIT, NECK_LIMIT);
            const dx = base.x + Math.cos(angle) * headLength - head.x;
            const dy = base.y + Math.sin(angle) * headLength - head.y;
            head.x += dx * .72; head.y += dy * .72;
            base.x -= dx * .28; base.y -= dy * .28;
        }
    }
    function supportHeldPosture() {
        if (!grip) return;
        const hip = points.hip, neck = points.neck;
        const angle = Math.atan2(neck.x - hip.x, hip.y - neck.y);
        const targetAngle = clamp(dragVelocityX / 5000, -.18, .18);
        const difference = Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle));
        const turn = difference * .18, cosine = Math.cos(turn), sine = Math.sin(turn);
        const [a, b] = BOSS_BONES[grip.part];
        const anchorX = mix(points[a].x, points[b].x, grip.t), anchorY = mix(points[a].y, points[b].y, grip.t);
        // A supported upright pose while held; release removes this support so
        // the same articulated body can tumble freely during a throw.
        for (const p of Object.values(points)) {
            const x = p.x - anchorX, y = p.y - anchorY;
            p.x = anchorX + x * cosine - y * sine;
            p.y = anchorY + x * sine + y * cosine;
        }
        const upright = angle + turn, cos = Math.cos(upright), sin = Math.sin(upright);
        for (const [name, p] of Object.entries(points)) {
            if (frame.includes(name) || name === a || name === b) continue;
            const [rx, ry] = REST[name], x = rx * scale, y = -(ry - 1.46) * scale;
            p.x += (hip.x + x * cos - y * sin - p.x) * .035;
            p.y += (hip.y + x * sin + y * cos - p.y) * .035;
        }
    }
    function collide(dt) {
        for (const [name, p] of Object.entries(points)) {
            const vx = (p.x - p.px) / dt, vy = (p.y - p.py) / dt;
            const left = limits.left + p.radius, right = Math.max(left, limits.right - p.radius);
            const top = limits.top + p.radius, bottom = Math.max(top, limits.bottom - p.radius);
            let side = null, speed = 0;
            if (p.x < left || p.x > right) {
                side = p.x < left ? 'left' : 'right'; speed = Math.abs(vx);
                p.x = clamp(p.x, left, right);
                const key = `${name}:${side}`;
                if (!contacts.has(key)) contacts.set(key, { name, side, vx: clamp(vx, -MAX_SPEED, MAX_SPEED), vy, speed });
            }
            if (p.y < top || p.y > bottom) {
                side = p.y < top ? 'top' : 'bottom'; speed = Math.max(speed, Math.abs(vy));
                p.y = clamp(p.y, top, bottom);
                const key = `${name}:${side}`;
                if (!contacts.has(key)) contacts.set(key, { name, side, vx, vy: clamp(vy, -MAX_SPEED, MAX_SPEED), speed });
            }
        }
    }
    function beginRecovery() {
        const x = clamp(points.hip.x, limits.left + 1.4 * scale, limits.right - 1.4 * scale);
        const y = limits.bottom - 1.46 * scale;
        recovery = { from: Object.fromEntries(Object.entries(points).map(([k, p]) => [k, { x: p.x, y: p.y }])), to: bossRestPoints({ x, y, scale }) };
        state.recovering = true; state.falling = false; state.recovery = 0;
    }
    function stepFixed(dt) {
        state.impact *= Math.exp(-dt * 3.5); state.discomfort *= Math.exp(-dt * 1.8); cooldown -= dt;
        dragSpeed *= Math.exp(-dt * 12);
        dragVelocityX *= Math.exp(-dt * 8);
        if (state.recovering) {
            state.recovery = Math.min(1, state.recovery + dt / 1.05);
            const t = smooth(state.recovery);
            for (const [name, p] of Object.entries(points)) {
                p.x = mix(recovery.from[name].x, recovery.to[name].x, t);
                p.y = mix(recovery.from[name].y, recovery.to[name].y, t);
                p.px = p.x; p.py = p.y;
            }
            if (state.recovery === 1) { state.done = true; state.recovering = false; }
            return;
        }
        if (state.done) return;
        for (const p of Object.values(points)) {
            // A little more drag takes the whip out of loose limbs without
            // weakening the picked bone's exact attachment to the pointer.
            const vx = clamp(p.x - p.px, -MAX_SPEED * dt, MAX_SPEED * dt) * .988;
            const vy = clamp(p.y - p.py, -MAX_SPEED * dt, MAX_SPEED * dt) * .988;
            p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + 1350 * dt * dt;
        }
        contacts = new Map();
        for (let i = 0; i < 14; i++) { supportHeldPosture(); constrainGrip(); constrainBody(); collide(dt); }
        constrainGrip(); constrainBody(); constrainGrip(); collide(dt);
        for (const [key, contact] of contacts) {
            const { name, side, vx, vy, speed } = contact, p = points[name];
            const fresh = !previousContacts.has(key);
            const bounce = fresh || dragSpeed > 300 ? .16 : 0;
            if (side === 'left' || side === 'right') p.px = p.x + vx * dt * bounce;
            else { p.py = p.y + vy * dt * bounce; p.px = mix(p.px, p.x, .30); }
            if (fresh || dragSpeed > 300) impact(side, name, speed);
        }
        previousContacts = new Set(contacts.keys());
        if (!state.dragging) {
            releasedFor += dt;
            const speed = Math.max(...Object.values(points).map(p => Math.hypot(p.x - p.px, p.y - p.py) / dt));
            settledFor = speed < 110 ? settledFor + dt : 0;
            if (releasedFor > .8 && settledFor > .45 || releasedFor > 3.4) beginRecovery();
        }
    }
    return {
        state,
        grab({ part = 'torso', t = .5, x, y, time = 0 }) {
            if (!BOSS_BONES[part]) part = 'torso';
            state.part = part; state.dragging = true; state.falling = false; state.done = false; state.recovering = false;
            recovery = null; releasedFor = 0; settledFor = 0;
            grip = { part, t: clamp(t, 0, 1), x, y };
            // Preserve the exact point within the limb/head that was clicked.
            const [a, b] = BOSS_BONES[part];
            grip.offsetX = mix(points[a].x, points[b].x, grip.t) - x;
            grip.offsetY = mix(points[a].y, points[b].y, grip.t) - y;
            grip.x += grip.offsetX; grip.y += grip.offsetY;
            previousDrag = { x, y, time }; reversal = { x: 0, y: 0, time: -Infinity };
        },
        drag(x, y, time = 0) {
            if (!grip) return;
            const dt = clamp((time - previousDrag.time) / 1000, .008, .1);
            const vx = clamp((x - previousDrag.x) / dt, -2500, 2500), vy = clamp((y - previousDrag.y) / dt, -2500, 2500);
            dragSpeed = Math.hypot(vx, vy);
            dragVelocityX = vx;
            const reversesX = Math.abs(vx) > 340 && Math.abs(reversal.x) > 340 && vx * reversal.x < 0;
            const reversesY = Math.abs(vy) > 340 && Math.abs(reversal.y) > 340 && vy * reversal.y < 0;
            if ((reversesX || reversesY) && time - reversal.time < 380) state.discomfort = clamp(state.discomfort + .24, 0, .78);
            if (Math.hypot(vx, vy) > 340) reversal = { x: vx, y: vy, time };
            grip.x = clamp(x + grip.offsetX, limits.left + 4, limits.right - 4);
            grip.y = clamp(y + grip.offsetY, limits.top + 4, limits.bottom - 4);
            previousDrag = { x, y, time };
        },
        release({ cancel = false, time = 0 } = {}) {
            if (!state.dragging) return;
            state.dragging = false; state.falling = !cancel; grip = null;
            const momentum = cancel || time - previousDrag.time > 120 ? 0 : .75;
            for (const p of Object.values(points)) {
                p.px = p.x - (p.x - p.px) * momentum;
                p.py = p.y - (p.y - p.py) * momentum;
            }
            if (cancel) state.done = true;
        },
        setBounds(next) { limits = { ...next }; },
        step(seconds) {
            accumulator = Math.min(.08, accumulator + Math.max(0, Number.isFinite(seconds) ? seconds : 0));
            while (accumulator >= 1 / 120) { stepFixed(1 / 120); accumulator -= 1 / 120; }
            return state;
        }
    };
}
