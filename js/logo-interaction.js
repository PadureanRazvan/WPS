const limit = (value, maximum) => maximum * Math.tanh(value / maximum);

// Exact critically damped step: no frame-rate-dependent friction or hard snap
// when a hand lets go. Position and velocity stay continuous as targets move.
export function stepLogoSpring(position, velocity, target, seconds, frequency = 18) {
    const dt = Math.max(0, seconds);
    const offset = position - target;
    const impulse = velocity + frequency * offset;
    const decay = Math.exp(-frequency * dt);
    return [target + (offset + impulse * dt) * decay, (velocity - frequency * impulse * dt) * decay];
}

export function createLogoInteraction(control, { canMove = () => true, invalidate = () => {} } = {}) {
    const value = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const velocity = { x: 0, y: 0 };
    let press = null, dragging = false, ignorePointerClick = false, disposed = false;
    const bounds = () => control.getBoundingClientRect();
    function hover(event) {
        if (event.pointerType === 'touch') { target.x = target.y = 0; return; }
        const rect = bounds();
        if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.left + rect.width
            || event.clientY < rect.top || event.clientY > rect.top + rect.height) {
            target.x = target.y = 0;
            return;
        }
        target.x = limit(((event.clientX - rect.left) / rect.width - 0.5) * 0.24, 0.13);
        target.y = limit(((event.clientY - rect.top) / rect.height - 0.5) * 0.18, 0.1);
    }
    function down(event) {
        if (disposed || press || event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
        ignorePointerClick = false;
        if (!canMove()) return;
        press = { id: event.pointerId, x: event.clientX, y: event.clientY, tiltX: value.x, tiltY: value.y, touch: event.pointerType === 'touch' };
    }
    function move(event) {
        if (disposed || !canMove()) return;
        if (!press) { hover(event); return; }
        if (event.pointerId !== press.id) return;
        const dx = event.clientX - press.x, dy = event.clientY - press.y;
        if (!dragging) {
            if (Math.hypot(dx, dy) < (press.touch ? 8 : 5)) return;
            if (press.touch && Math.abs(dy) > Math.abs(dx) * 1.1) { ignorePointerClick = true; cancel(); return; }
            dragging = true;
            control.dataset.logoDragging = 'true';
            control.setPointerCapture?.(press.id);
        }
        const rect = bounds();
        if (!rect.width || !rect.height) { cancel(); return; }
        target.x = limit(press.tiltX + dx / rect.width * 0.95, 0.55);
        target.y = limit(press.tiltY + dy / rect.height * 0.5, 0.25);
        invalidate();
    }
    function finish(event) {
        if (!press || event.pointerId !== press.id) return;
        const id = press.id, wasDragging = dragging;
        press = null; dragging = false;
        delete control.dataset.logoDragging;
        if (control.hasPointerCapture?.(id)) control.releasePointerCapture(id);
        if (wasDragging) {
            ignorePointerClick = true;
            hover(event);
            invalidate();
        }
    }
    function cancel(event) {
        if (event?.pointerId !== undefined && press && event.pointerId !== press.id) return;
        const id = press?.id;
        if (dragging) ignorePointerClick = true;
        press = null; dragging = false;
        delete control.dataset.logoDragging;
        if (id !== undefined && control.hasPointerCapture?.(id)) control.releasePointerCapture(id);
        target.x = target.y = 0;
    }
    function leave() {
        if (dragging) return;
        press = null;
        target.x = target.y = 0;
    }
    const listeners = { pointerdown: down, pointermove: move, pointerup: finish, pointercancel: cancel, lostpointercapture: cancel, pointerleave: leave, blur: cancel };
    for (const [name, handler] of Object.entries(listeners)) control.addEventListener(name, handler);
    return {
        value,
        get dragging() { return dragging; },
        step(seconds) {
            if (!canMove()) return value;
            const frequency = dragging ? 32 : 18;
            for (const axis of ['x', 'y']) {
                [value[axis], velocity[axis]] = stepLogoSpring(value[axis], velocity[axis], target[axis], seconds, frequency);
            }
            return value;
        },
        shouldActivate(event) {
            if (event?.detail === 0) return true; // Keyboard and assistive activation.
            if (!ignorePointerClick) return true;
            ignorePointerClick = false;
            return false;
        },
        cancel,
        reset() {
            cancel();
            value.x = value.y = velocity.x = velocity.y = 0;
        },
        getDiagnostics: () => ({ dragging, pointerDown: Boolean(press), tilt: [value.x, value.y], velocity: [velocity.x, velocity.y] }),
        dispose() {
            cancel(); disposed = true;
            for (const [name, handler] of Object.entries(listeners)) control.removeEventListener(name, handler);
        }
    };
}
