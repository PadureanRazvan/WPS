import { createBossPhysics } from './sherpa-boss-physics.js';
import { createAnimationScheduler } from './animation-scheduler.js';
import { BOSS_BONES, bossRestPoints, createBossRagdoll, pickBossBone } from './sherpa-boss-ragdoll.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = value => value * value * (3 - 2 * value);
const GREETING_INTERVAL_MS = 3 * 60 * 1000;
const FRAME_HEIGHT = 4.7;
const CAMERA_CENTER_Y = 2.03;
const HIP_FROM_CENTER = CAMERA_CENTER_Y - 1.46;
const WAVE_GREETINGS = [
    'Hello Rahela here, hope you are doing fine!',
    'Rahela here. I manage the team. Gravity manages me.',
    'This meeting could have been a wave.',
    'Tiny boss. Big plans. Suspiciously little coffee.'
];

// The controller owns only this decorative companion. Chat retains all AI actions.
export function createSherpaBoss({ element, onActivate = () => {}, onStateChange = () => {}, draggable = true, minimizeButton = null, dockButton = null, ragdollEnabled = true,
    loadGraphics = () => Promise.all([import('../assets/vendor/three.module.min.js'), import('./sherpa-boss-model.js')]) }) {
    if (!element) throw new TypeError('Sherpa companion requires an element');
    const canvas = element.querySelector('[data-boss-canvas]');
    const greeting = element.querySelector('[data-boss-greeting]');
    let greetingTimer = null, greetingIndex = 0, lastGreetingAt = -Infinity;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listeners = [];
    let visible = true, paused = false, disposed = false, renderer = null, scene = null, camera = null;
    let model = null, pivot = null, effects = null, shadow = null, physics = null;
    let pointer = null, suppressClick = false, state = 'idle', elapsed = 0, animation = null;
    let width = 132, height = 200, lastDraw = 0, renderCount = 0, contextLost = false;
    let gaze = { x: 0, y: 0 }, targetGaze = { x: 0, y: 0 }, rest = {}, positioned = false, yaw = 0;
    let ragdoll = null, graphics = null, raycaster = null, minimized = false, hoverAt = -Infinity;
    if (draggable) element.dataset.bossMinimized = 'false';
    const resources = [];
    const listen = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        listeners.push(() => target.removeEventListener(type, handler, options));
    };
    const hideGreeting = () => {
        clearTimeout(greetingTimer); greetingTimer = null;
        if (greeting) { greeting.hidden = true; greeting.textContent = ''; }
    };
    const placeGreeting = () => {
        if (!greeting || greeting.hidden) return;
        const anchor = element.getBoundingClientRect();
        const cloud = { width: greeting.offsetWidth, height: greeting.offsetHeight };
        const headX = anchor.left + anchor.width / 2;
        const above = anchor.top + anchor.height * .03 - cloud.height - 14;
        const left = clamp(headX - cloud.width * .76, 8, Math.max(8, window.innerWidth - cloud.width - 8));
        const top = clamp(above >= 8 ? above : anchor.top + anchor.height * .38, 8, Math.max(8, window.innerHeight - cloud.height - 8));
        greeting.style.left = `${left}px`; greeting.style.top = `${top}px`;
        greeting.style.setProperty('--boss-cloud-tail', `${clamp(headX - left, 20, cloud.width - 20)}px`);
        greeting.dataset.placement = above >= 8 ? 'above' : 'below';
    };
    const showGreeting = () => {
        if (!greeting || !visible || paused || minimized || ragdoll) return;
        const now = performance.now();
        if (now - lastGreetingAt < GREETING_INTERVAL_MS) return;
        hideGreeting();
        lastGreetingAt = now;
        greeting.textContent = WAVE_GREETINGS[greetingIndex % WAVE_GREETINGS.length];
        greetingIndex++;
        greeting.hidden = false; placeGreeting();
        greetingTimer = setTimeout(hideGreeting, 6000);
    };
    const available = () => !disposed && visible && !minimized && !paused && !document.hidden
        && (Boolean(renderer && model && !contextLost) || Boolean(physics?.state.falling) || Boolean(ragdoll) || Boolean(pointer?.dragging));
    const bounds = () => ({ left: 8, top: 8, right: Math.max(8, window.innerWidth - width - 8), bottom: Math.max(8, window.innerHeight - height - 24) });
    const notify = () => onStateChange({ state, dragging: Boolean(pointer?.dragging), renderer: element.dataset.bossRenderer });
    const ragdollBounds = () => ({ left: 7, top: 7, right: window.innerWidth - 7, bottom: window.innerHeight - 30 });
    const pixelsPerUnit = () => height / FRAME_HEIGHT;
    const updateControls = () => {
        element.dataset.bossVisible = String(visible && !disposed);
        element.setAttribute('aria-hidden', String(!visible || minimized || disposed));
        element.tabIndex = visible && !minimized && !disposed ? 0 : -1;
        if (minimizeButton) {
            minimizeButton.hidden = disposed || minimized || !visible || Boolean(ragdoll);
            const r = element.getBoundingClientRect();
            minimizeButton.style.left = `${clamp(r.right - 24, 8, window.innerWidth - 36)}px`;
            minimizeButton.style.top = `${clamp(r.top + 4, 8, window.innerHeight - 36)}px`;
        }
        if (dockButton) dockButton.hidden = disposed || !minimized || !visible;
    };
    const applyPosition = () => {
        if (draggable && physics && positioned) {
            element.style.left = `${Math.round(physics.state.x * 10) / 10}px`;
            element.style.top = `${Math.round(physics.state.y * 10) / 10}px`;
            element.style.right = 'auto'; element.style.bottom = 'auto';
        }
        updateControls();
    };
    const measure = () => {
        const rect = element.getBoundingClientRect();
        const oldHeight = height;
        width = element.offsetWidth || rect.width || 132;
        height = element.offsetHeight || rect.height || 200;
        if (ragdoll && oldHeight !== height) { cancelPointer(); ragdoll = null; }
        if (!physics) physics = createBossPhysics({ x: rect.left, y: rect.top, bounds: bounds(), reducedMotion: media.matches || !ragdollEnabled });
        else if (!positioned) physics.move(rect.left, rect.top);
        physics.setBounds(bounds());
        ragdoll?.setBounds(ragdollBounds());
        if (renderer && camera) {
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            // Extra transparent canvas space lets a horizontal body or dangling
            // leg remain visible without expanding the button's hit rectangle.
            const renderWidth = draggable ? Math.max(width, height * 1.65) : width;
            const renderHeight = draggable ? height * 1.65 : height;
            renderer.setSize(renderWidth, renderHeight, false);
            if (canvas) {
                canvas.style.width = `${renderWidth}px`; canvas.style.height = `${renderHeight}px`;
                canvas.style.left = `${(width - renderWidth) / 2}px`; canvas.style.top = `${(height - renderHeight) / 2}px`;
            }
            const halfHeight = FRAME_HEIGHT / 2 * renderHeight / height;
            camera.left = -halfHeight * renderWidth / renderHeight; camera.right = halfHeight * renderWidth / renderHeight;
            camera.top = halfHeight; camera.bottom = -halfHeight;
            camera.updateProjectionMatrix();
        }
        applyPosition();
        placeGreeting();
        if (paused) drawStill();
        scheduler.invalidate();
    };
    const cancelPointer = () => {
        if (!pointer) return;
        const id = pointer.id;
        suppressClick = Boolean(pointer.dragging);
        pointer = null;
        physics?.release({ cancel: true });
        ragdoll?.release({ cancel: true }); ragdoll = null;
        delete element.dataset.bossDragging;
        delete element.dataset.bossGrabPart; delete element.dataset.bossReaction;
        if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
        notify(); scheduler.invalidate();
    };
    const pose = dt => {
        const p = physics?.state;
        if (!model || !p) return;
        const moving = !media.matches;
        gaze.x += (targetGaze.x - gaze.x) * Math.min(1, dt * 8 || 1);
        gaze.y += (targetGaze.y - gaze.y) * Math.min(1, dt * 8 || 1);
        for (const [name, joint] of Object.entries(model.joints)) {
            if (!rest[name]) continue;
            joint.rotation.set(rest[name].x, rest[name].y, rest[name].z);
        }
        const joints = model.joints;
        const add = (name, axis, value) => { if (joints[name]) joints[name].rotation[axis] += value; };
        const t = elapsed;
        const idle = moving && !pointer?.dragging && !ragdoll;
        model.root.position.y = -1.75;
        pivot.position.x = 0;
        pivot.rotation.z = p.torso;
        pivot.rotation.x = p.dragging && ragdollEnabled ? clamp(p.vy / 6000, -0.18, 0.18) : 0;
        pivot.rotation.y = yaw + (idle ? Math.sin(t * 0.55) * 0.035 : 0);
        pivot.position.y = 1.75 + (idle ? Math.sin(t * 1.8) * 0.012 : 0) - p.impact * 0.085;
        add('head', 'y', moving ? gaze.x * 0.15 : 0);
        add('head', 'x', moving ? gaze.y * 0.08 : 0);
        add('head', 'z', -p.torso * 0.3 + (idle ? Math.sin(t * 0.75) * 0.022 : 0));
        add('leftUpperArm', 'z', p.swing + (idle ? Math.sin(t * 1.8) * 0.025 : 0));
        add('rightUpperArm', 'z', p.swing * 0.8 - (idle ? Math.sin(t * 1.8) * 0.025 : 0));
        add('leftForearm', 'z', -p.swing * 0.7);
        add('rightForearm', 'z', -p.swing * 0.85);
        add('leftForearm', 'x', Math.abs(p.swing) * -0.55);
        add('rightForearm', 'x', Math.abs(p.swing) * -0.65);
        add('leftThigh', 'z', p.legSwing);
        add('rightThigh', 'z', p.legSwing * 0.8);
        add('leftShin', 'x', Math.abs(p.legSwing) * 0.6);
        add('rightShin', 'x', Math.abs(p.legSwing) * 0.8);
        let blinking = 0;
        if (moving) {
            const blinkPhase = t % 4.7;
            blinking = blinkPhase > 4.45 ? Math.sin((blinkPhase - 4.45) / 0.25 * Math.PI) : 0;
        }
        const reaction = ragdoll?.state;
        const discomfort = reaction?.discomfort || 0, impact = reaction?.impact || 0;
        model.blink?.(Math.max(0, blinking, discomfort * .38, impact * .80));
        model.setMood?.({ speaking: !reaction && state === 'speaking' && moving ? (Math.sin(t * 15) + 1) * 0.5 : 0, thinking: !reaction && state === 'thinking', discomfort, impact });
        if (state === 'thinking') {
            add('head', 'z', -0.08); add('head', 'y', -0.08);
            add('rightUpperArm', 'z', -0.32); add('rightUpperArm', 'x', -1.05);
            add('rightForearm', 'x', -1.85); add('rightForearm', 'z', -0.18);
        } else if (state === 'speaking' && moving) {
            add('head', 'x', Math.sin(t * 3) * 0.035);
            add('leftUpperArm', 'x', -0.28 + Math.sin(t * 2) * 0.12);
            add('leftForearm', 'x', -0.4 - Math.sin(t * 2) * 0.18);
        }
        if (animation && !p.dragging && !ragdoll) {
            const progress = clamp((t - animation.started) / animation.duration, 0, 1);
            const envelope = Math.min(ease(Math.min(1, progress * 7)), ease(Math.min(1, (1 - progress) * 6)));
            const motion = media.matches ? 0 : envelope;
            if (animation.name === 'wave') {
                add('leftUpperArm', 'z', -2.45 * envelope);
                add('leftForearm', 'z', Math.sin(progress * Math.PI * 12) * 0.35 * motion - 0.25 * envelope);
                add('head', 'z', -0.06 * envelope);
            } else if (animation.name === 'dance') {
                pivot.position.y += Math.abs(Math.sin(progress * Math.PI * 10)) * 0.08 * motion;
                pivot.rotation.z += Math.sin(progress * Math.PI * 10) * 0.10 * motion;
                add('leftUpperArm', 'z', -0.5 * envelope + Math.sin(progress * Math.PI * 10) * 0.45 * motion);
                add('rightUpperArm', 'z', 0.5 * envelope + Math.sin(progress * Math.PI * 10) * 0.45 * motion);
                add('leftForearm', 'x', -0.8 * envelope); add('rightForearm', 'x', -0.8 * envelope);
                add('leftThigh', 'x', Math.sin(progress * Math.PI * 10) * 0.23 * motion);
                add('rightThigh', 'x', -Math.sin(progress * Math.PI * 10) * 0.23 * motion);
            } else if (animation.name === 'spin') {
                pivot.rotation.y += ease(progress) * Math.PI * 2 * (media.matches ? 0 : 1);
                add('leftUpperArm', 'z', -0.55 * envelope); add('rightUpperArm', 'z', 0.55 * envelope);
            } else if (animation.name === 'celebrate') {
                add('leftUpperArm', 'z', -2.45 * envelope); add('rightUpperArm', 'z', 2.45 * envelope);
                pivot.position.y += Math.sin(progress * Math.PI) * 0.22 * motion;
            }
            if (progress >= 1) { animation = null; delete element.dataset.bossAction; }
        }
        if (reaction) {
            const points = reaction.points;
            const upwardAngle = (a, b) => Math.atan2(-(points[b].x - points[a].x), -(points[b].y - points[a].y));
            const downwardAngle = (a, b) => Math.atan2(points[b].x - points[a].x, points[b].y - points[a].y);
            const torsoAngle = upwardAngle('hip', 'neck');
            model.root.position.y = -1.46; pivot.position.set(0, 1.46, 0);
            pivot.rotation.set(0, 0, torsoAngle);
            for (const joint of Object.values(joints)) joint.rotation.set(0, 0, 0);
            joints.head.rotation.z = upwardAngle('headBase', 'head') - torsoAngle;
            for (const side of ['left', 'right']) {
                const arm = downwardAngle(`${side}Shoulder`, `${side}Elbow`);
                const forearm = downwardAngle(`${side}Elbow`, `${side}Wrist`);
                const thigh = downwardAngle(`${side}Hip`, `${side}Knee`);
                const shin = downwardAngle(`${side}Knee`, `${side}Ankle`);
                joints[`${side}UpperArm`].rotation.z = arm - torsoAngle;
                joints[`${side}Forearm`].rotation.z = forearm - arm;
                joints[`${side}Thigh`].rotation.z = thigh - torsoAngle;
                joints[`${side}Shin`].rotation.z = shin - thigh;
            }
            // Short reflex flinch and protective shoulder hunch after contact.
            add('head', 'x', -impact * .14);
            if (reaction.recovering) {
                const rub = Math.sin(reaction.recovery * Math.PI);
                add('rightUpperArm', 'z', 1.7 * rub); add('rightForearm', 'z', .65 * rub);
                add('head', 'z', -.07 * rub);
            }
            element.dataset.bossReaction = reaction.impact > .12 ? 'impact' : reaction.discomfort > .25 ? 'shaken' : reaction.recovering ? 'recovering' : reaction.dragging ? 'held' : 'falling';
            element.dataset.bossImpact = reaction.impactSide || '';
            element.dataset.bossImpactCount = String(reaction.impactCount);
        } else { delete element.dataset.bossReaction; }
        if (effects) {
            effects.visible = !reaction && (state === 'thinking' || animation?.name === 'celebrate' || animation?.name === 'spin') || impact > .24;
            effects.scale.setScalar(reaction ? .8 : 1);
            effects.position.set(0, reaction ? 3.18 : 3.45, 0);
            if (reaction) {
                const head = reaction.points.head, hip = reaction.points.hip;
                effects.position.set((head.x - hip.x) / pixelsPerUnit(), 1.46 - (head.y - hip.y) / pixelsPerUnit() + .5, 0);
            }
            effects.rotation.y = moving ? t * 1.6 : 0;
            effects.children.forEach((star, index) => {
                const angle = index / effects.children.length * Math.PI * 2;
                star.position.set(Math.cos(angle) * 0.65, Math.sin(t * 2 + index) * (moving ? 0.08 : 0), Math.sin(angle) * 0.3);
                star.rotation.z = moving ? t * 1.2 + index : index;
            });
        }
        if (shadow) {
            shadow.material.opacity = reaction ? 0 : p.dragging || p.falling ? 0.10 : 0.25;
            shadow.scale.set(1 - p.impact * 0.08, 1 - p.impact * 0.08, 1);
        }
    };
    const drawStill = () => {
        if (disposed || !visible || minimized || document.hidden || contextLost || !renderer || !scene || !model) return;
        pose(0);
        renderer.render(scene, camera);
        lastDraw = performance.now(); renderCount++;
    };
    const scheduler = createAnimationScheduler({
        isActive: available,
        isAnimated: () => !media.matches || Boolean(pointer?.dragging),
        onFrame(time, dt) {
            if (disposed) return;
            elapsed += dt;
            if (ragdoll) {
                const r = ragdoll.step(dt), hip = r.points.hip;
                physics.state.x = hip.x - width / 2;
                physics.state.y = hip.y - height / 2 - HIP_FROM_CENTER * pixelsPerUnit();
                if (r.done) { ragdoll = null; physics.move(physics.state.x, physics.state.y); delete element.dataset.bossGrabPart; }
            } else physics?.step(dt);
            applyPosition(); pose(dt);
            // Studio-quality antialiasing at a restrained 30fps for a small decoration.
            if (renderer && scene && !contextLost && (time - lastDraw >= 30 || !dt || pointer?.dragging)) {
                renderer.render(scene, camera); lastDraw = time; renderCount++;
            }
        }
    });
    const screenPoint = vector => {
        const p = vector.project(camera), r = canvas.getBoundingClientRect();
        return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
    };
    const bodyPoints = () => {
        if (ragdoll) return Object.fromEntries(Object.entries(ragdoll.state.points).map(([k, p]) => [k, { x: p.x, y: p.y }]));
        const scale = pixelsPerUnit();
        const fallback = bossRestPoints({ x: physics.state.x + width / 2, y: physics.state.y + height / 2 + HIP_FROM_CENTER * scale, scale });
        if (model?.root.userData.modelKind !== 'articulated-procedural-mesh') return fallback;
        scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        const at = (object, point = [0, 0, 0]) => screenPoint(object.localToWorld(new graphics.Vector3(...point)));
        const points = { hip: at(model.root, [0, 1.46, 0]), neck: at(model.root, [0, 2.43, .015]), headBase: at(model.joints.head), head: at(model.joints.head, [0, .38, 0]) };
        for (const side of ['left', 'right']) {
            points[`${side}Shoulder`] = at(model.joints[`${side}UpperArm`]);
            points[`${side}Elbow`] = at(model.joints[`${side}Forearm`]);
            points[`${side}Wrist`] = at(model.joints[`${side}Forearm`], [0, -.55, 0]);
            points[`${side}Hip`] = at(model.joints[`${side}Thigh`]);
            points[`${side}Knee`] = at(model.joints[`${side}Shin`]);
            points[`${side}Ankle`] = at(model.joints[`${side}Shin`], [0, -.70, 0]);
        }
        return points;
    };
    const pickPart = (event, points, requireMesh = false) => {
        if (raycaster && model && camera && !contextLost) {
            const r = canvas.getBoundingClientRect();
            scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
            raycaster.setFromCamera({ x: (event.clientX - r.left) / r.width * 2 - 1, y: 1 - (event.clientY - r.top) / r.height * 2 }, camera);
            const hit = raycaster.intersectObject(model.root, true)[0];
            if (hit) {
                let object = hit.object, part = 'torso';
                while (object && object !== model.root) {
                    if (BOSS_BONES[object.name]) { part = object.name; break; }
                    object = object.parent;
                }
                const [a, b] = BOSS_BONES[part], p = points[a], q = points[b], dx = q.x - p.x, dy = q.y - p.y;
                const t = clamp(((event.clientX - p.x) * dx + (event.clientY - p.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
                return { part, t };
            }
        }
        return requireMesh ? null : pickBossBone(points, event.clientX, event.clientY, pixelsPerUnit());
    };
    const startPointer = (event, outside = false) => {
        if (!draggable || event.button !== 0 || pointer || paused || minimized || !visible || disposed) return;
        measure();
        const points = bodyPoints(), hit = pickPart(event, points, outside);
        if (!hit) return;
        if (outside) event.preventDefault();
        suppressClick = false;
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: physics.state.x, top: physics.state.y, dragging: false, points, hit, outside };
        element.setPointerCapture?.(event.pointerId);
    };
    listen(element, 'pointerdown', event => startPointer(event));
    // The padded canvas does not intercept the app. Only an actual mesh hit can
    // begin a grab outside the normal button, including a horizontally thrown leg.
    if (draggable) listen(window, 'pointerdown', event => {
        if (event.target === element || element.contains?.(event.target) || event.target === minimizeButton || event.target === dockButton) return;
        if (event.target?.closest?.('dialog[open], [role="dialog"], .modal.show, .modal.active, .modal.open, #chatPanel')) return;
        startPointer(event, true);
    });
    listen(element, 'pointermove', event => {
        if (!pointer || event.pointerId !== pointer.id) return;
        const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
        if (!pointer.dragging && Math.hypot(dx, dy) < 6) return;
        if (!pointer.dragging) {
            pointer.dragging = true; positioned = true; animation = null;
            hideGreeting();
            delete element.dataset.bossAction;
            if (ragdollEnabled && model && !media.matches && !contextLost) {
                physics.stop();
                ragdoll ??= createBossRagdoll({ points: pointer.points, scale: pixelsPerUnit(), bounds: ragdollBounds() });
                ragdoll.grab({ ...pointer.hit, x: pointer.x, y: pointer.y, time: event.timeStamp });
                element.dataset.bossGrabPart = pointer.hit.part;
            } else physics.grab(event.timeStamp);
            element.dataset.bossDragging = 'true'; notify();
        }
        event.preventDefault();
        if (ragdoll) {
            ragdoll.drag(event.clientX, event.clientY, event.timeStamp);
        } else physics.drag(pointer.left + dx, pointer.top + dy, event.timeStamp);
        applyPosition(); placeGreeting(); scheduler.invalidate();
    });
    listen(element, 'pointerup', event => {
        if (!pointer || pointer.id !== event.pointerId) return;
        const dragged = pointer.dragging, outside = pointer.outside;
        suppressClick = dragged; pointer = null;
        if (dragged) { if (ragdoll) ragdoll.release({ time: event.timeStamp }); else physics.release({ time: event.timeStamp }); }
        else if (outside) { play('wave'); onActivate(event); suppressClick = true; }
        delete element.dataset.bossDragging;
        if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
        notify(); scheduler.invalidate();
    });
    const cancelMatchingPointer = event => { if (pointer?.id === event.pointerId) cancelPointer(); };
    listen(element, 'pointercancel', cancelMatchingPointer);
    listen(element, 'lostpointercapture', cancelMatchingPointer);
    listen(element, 'click', event => {
        if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; return; }
        if (!pointer?.dragging) { if (draggable) play('wave'); onActivate(event); }
    });
    if (draggable) listen(window, 'click', event => {
        if (event.target === minimizeButton || event.target === dockButton || dockButton?.contains?.(event.target)) return;
        if (suppressClick && event.detail !== 0 && event.target !== element && !element.contains?.(event.target)) {
            event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false;
        }
    }, true);
    listen(element, 'pointerenter', event => {
        if (event.pointerType !== 'touch' && !pointer && !ragdoll && !paused && visible && !minimized && elapsed - hoverAt > 3.5) {
            hoverAt = elapsed; play('wave');
        }
    });
    listen(element, 'keydown', event => {
        if (event.key === 'Home' && draggable) { event.preventDefault(); resetPosition(); return; }
        if (event.key.toLowerCase() === 'h' && draggable && !event.ctrlKey && !event.metaKey) { event.preventDefault(); setMinimized(true); return; }
        if (event.key === 'Escape' && pointer) { event.preventDefault(); cancelPointer(); return; }
        if (!draggable || !event.shiftKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); ragdoll = null; measure(); positioned = true;
        const offsets = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };
        const [dx, dy] = offsets[event.key]; physics.move(physics.state.x + dx, physics.state.y + dy);
        applyPosition(); placeGreeting(); scheduler.invalidate();
    });
    listen(window, 'pointermove', event => {
        if (event.pointerType === 'touch' || pointer || !visible || paused || media.matches) return;
        const rect = element.getBoundingClientRect();
        targetGaze = { x: clamp((event.clientX - rect.left - rect.width / 2) / 450, -1, 1), y: clamp((event.clientY - rect.top - rect.height * 0.25) / 400, -1, 1) };
    }, { passive: true });
    listen(window, 'blur', cancelPointer);
    listen(window, 'resize', measure);
    listen(window, 'scroll', placeGreeting, { passive: true, capture: true });
    listen(document, 'visibilitychange', () => { if (document.hidden) { cancelPointer(); hideGreeting(); } else if (paused) drawStill(); scheduler.resetClock(); });
    listen(media, 'change', () => { cancelPointer(); ragdoll = null; physics?.setReducedMotion(media.matches || !ragdollEnabled); animation = null; delete element.dataset.bossAction; scheduler.invalidate(); });
    if (minimizeButton) listen(minimizeButton, 'click', () => setMinimized(true));
    if (dockButton) listen(dockButton, 'click', () => setMinimized(false));
    if (canvas) {
        listen(canvas, 'webglcontextlost', event => {
            event.preventDefault(); cancelPointer(); physics?.stop(); contextLost = true;
            element.dataset.bossRenderer = 'fallback'; scheduler.sync();
        });
        listen(canvas, 'webglcontextrestored', () => {
            contextLost = false; element.dataset.bossRenderer = 'three';
            if (paused) drawStill(); else scheduler.invalidate();
        });
    }
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    resizeObserver?.observe(element);
    measure();

    element.dataset.bossRenderer = 'loading';
    element.dataset.bossState = state;
    const ready = (async () => {
        if (!canvas) { element.dataset.bossRenderer = 'fallback'; return false; }
        try {
            const [THREE, { createSherpaBossModel }] = await loadGraphics();
            if (disposed) return false;
            graphics = THREE; raycaster = new THREE.Raycaster();
            renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
            renderer.setClearColor(0x000000, 0);
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 0.97;
            if (renderer.shadowMap) {
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            }
            scene = new THREE.Scene();
            camera = new THREE.OrthographicCamera(-1.4, 1.4, 2.05, -2.05, 0.1, 30);
            camera.position.set(0, CAMERA_CENTER_Y, 8); camera.lookAt(0, CAMERA_CENTER_Y, 0);
            // A warm softbox gives the face shape; restrained fill preserves the
            // nose, collar folds and darker hair instead of bleaching them out.
            scene.add(new THREE.HemisphereLight(0xf6ecff, 0x776783, 0.95));
            const key = new THREE.DirectionalLight(0xffeadc, 2.7);
            key.position.set(-2.7, 4.2, 6);
            key.target.position.set(0, 1.8, 0);
            key.castShadow = true;
            key.shadow.mapSize.set(1024, 1024);
            Object.assign(key.shadow.camera, { left: -2.1, right: 2.1, top: 2.2, bottom: -2.2, near: 0.5, far: 15 });
            key.shadow.bias = -0.00015; key.shadow.normalBias = 0.012; key.shadow.radius = 2;
            key.shadow.intensity = 0.32;
            resources.push(key.shadow);
            scene.add(key, key.target);
            const fill = new THREE.DirectionalLight(0xf0e7ef, 0.85); fill.position.set(4, 2.4, 5); scene.add(fill);
            const rim = new THREE.DirectionalLight(0xffd4a3, 1.6); rim.position.set(1, 3, -3); scene.add(rim);
            model = createSherpaBossModel(THREE);
            pivot = new THREE.Group(); pivot.position.y = 1.75;
            model.root.position.y -= 1.75; pivot.add(model.root); scene.add(pivot);
            for (const [name, joint] of Object.entries(model.joints)) rest[name] = joint.rotation.clone();
            const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = 128; shadowCanvas.height = 64;
            const ctx = shadowCanvas.getContext('2d');
            const gradient = ctx.createRadialGradient(64, 32, 0, 64, 32, 60);
            gradient.addColorStop(0, 'rgba(33, 21, 50, .65)'); gradient.addColorStop(1, 'rgba(33, 21, 50, 0)');
            ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 64);
            const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
            const shadowGeometry = new THREE.PlaneGeometry(1.4, 0.32);
            const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.25, depthWrite: false });
            shadow = new THREE.Mesh(shadowGeometry, shadowMaterial); shadow.position.set(0, 0.035, -0.12); scene.add(shadow);
            resources.push(shadowTexture, shadowGeometry, shadowMaterial);
            effects = new THREE.Group(); effects.position.y = 3.45; scene.add(effects);
            const starGeometry = new THREE.OctahedronGeometry(0.048, 0);
            const starMaterial = new THREE.MeshStandardMaterial({ color: 0xf3c977, metalness: 0.65, roughness: 0.2, emissive: 0xc59740, emissiveIntensity: 0.25 });
            resources.push(starGeometry, starMaterial);
            for (let i = 0; i < 5; i++) effects.add(new THREE.Mesh(starGeometry, starMaterial));
            element.dataset.bossRenderer = 'three';
            measure(); if (!paused) drawStill(); scheduler.invalidate(); notify();
            return true;
        } catch (error) {
            model?.dispose?.(); model = null;
            renderer?.dispose(); renderer = null;
            resources.splice(0).forEach(resource => resource.dispose());
            if (!disposed) { element.dataset.bossRenderer = 'fallback'; element.dataset.bossError = 'graphics-unavailable'; notify(); }
            console.warn('Sherpa companion graphics unavailable; accessible chat remains available.', error);
            return false;
        }
    })();

    function resetPosition() {
        if (!draggable) return;
        hideGreeting();
        cancelPointer(); ragdoll = null; physics?.stop(); animation = null; delete element.dataset.bossAction; positioned = false;
        element.style.left = ''; element.style.top = ''; element.style.right = ''; element.style.bottom = '';
        measure();
    }
    function play(name = 'wave') {
        if (!['wave', 'dance', 'spin', 'celebrate'].includes(name) || disposed || minimized) return;
        animation = { name, started: elapsed, duration: name === 'dance' ? 4 : name === 'spin' ? 2.4 : 2.8 };
        if (media.matches) animation.started -= animation.duration * 0.4;
        element.dataset.bossAction = name; scheduler.invalidate();
        if (name === 'wave') showGreeting(); else hideGreeting();
    }
    function setMinimized(value) {
        if (!draggable || disposed) return;
        minimized = Boolean(value); cancelPointer(); ragdoll = null; physics?.stop();
        hideGreeting();
        element.dataset.bossMinimized = String(minimized);
        updateControls();
        if (!minimized) { resetPosition(); play('wave'); element.focus?.(); }
        else dockButton?.focus?.();
        scheduler.resetClock();
    }
    return {
        ready,
        setState(next) { if (!['idle', 'thinking', 'speaking'].includes(next)) return; state = next; element.dataset.bossState = next; notify(); scheduler.invalidate(); },
        setVisible(value) { visible = Boolean(value); if (!visible) { cancelPointer(); hideGreeting(); } else if (paused) drawStill(); updateControls(); scheduler.resetClock(); },
        setPaused(value) { paused = Boolean(value); if (paused) { cancelPointer(); hideGreeting(); } scheduler.invalidate(); },
        setRagdollEnabled(value) {
            const enabled = Boolean(value);
            if (disposed || enabled === ragdollEnabled) return;
            ragdollEnabled = enabled;
            cancelPointer(); ragdoll = null; physics?.stop();
            physics?.setReducedMotion(media.matches || !ragdollEnabled);
            if (physics && positioned) physics.move(physics.state.x, physics.state.y);
            delete element.dataset.bossReaction; delete element.dataset.bossGrabPart;
            applyPosition(); scheduler.invalidate();
        },
        play, setMinimized,
        setYaw(value) { if (Number.isFinite(value)) { yaw = value; if (paused) drawStill(); else scheduler.invalidate(); } },
        resetPosition,
        getDiagnostics: () => ({ renderer: element.dataset.bossRenderer, state, visible, paused, minimized, disposed, ragdollEnabled, renderCount, scheduler: scheduler.getDiagnostics(), position: physics ? { x: physics.state.x, y: physics.state.y } : null, dragging: Boolean(pointer?.dragging), falling: Boolean(physics?.state.falling || ragdoll?.state.falling), grabbedPart: ragdoll?.state.part || null, reaction: ragdoll ? { discomfort: ragdoll.state.discomfort, impact: ragdoll.state.impact, side: ragdoll.state.impactSide, count: ragdoll.state.impactCount, recovering: ragdoll.state.recovering } : null }),
        dispose() {
            if (disposed) return;
            hideGreeting();
            cancelPointer(); disposed = true; scheduler.dispose(); resizeObserver?.disconnect();
            listeners.splice(0).forEach(remove => remove());
            model?.dispose?.(); resources.splice(0).forEach(resource => resource.dispose());
            renderer?.dispose(); renderer = null; model = null;
            ragdoll = null; updateControls();
            delete element.dataset.bossDragging;
        }
    };
}
