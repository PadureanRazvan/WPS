// A sleeping decoration must leave both the GPU and the frame callback queue idle.
export function createAnimationScheduler({
    isActive = () => true,
    isAnimated = () => true,
    onFrame,
    requestFrame = callback => requestAnimationFrame(callback),
    cancelFrame = id => cancelAnimationFrame(id)
}) {
    let frameId = null;
    let previousTime = null;
    let dirty = true;
    let disposed = false;
    let requests = 0;
    const cancel = () => {
        if (frameId !== null) cancelFrame(frameId);
        frameId = null;
        previousTime = null;
    };
    function sync() {
        if (disposed || !isActive()) { cancel(); return; }
        if (!isAnimated()) {
            previousTime = null;
            if (!dirty) { cancel(); return; }
        }
        if (frameId === null) {
            requests++;
            frameId = requestFrame(tick);
        }
    }
    function tick(time) {
        frameId = null;
        if (disposed || !isActive()) { previousTime = null; return; }
        const animated = isAnimated();
        const dt = animated && previousTime !== null ? Math.max(0, Math.min((time - previousTime) / 1000, 0.08)) : 0;
        previousTime = animated ? time : null;
        dirty = false;
        onFrame(time, dt);
        sync();
    }
    return {
        invalidate() { dirty = true; sync(); },
        sync,
        resetClock() { previousTime = null; sync(); },
        getDiagnostics: () => ({ scheduled: frameId !== null, requests }),
        dispose() { disposed = true; cancel(); }
    };
}
