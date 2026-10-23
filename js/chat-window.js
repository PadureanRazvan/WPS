// Owns only floating-window geometry and input, never chat or data operations.
// Call open() after showing the panel, close() when hidden, and dispose() on logout.
export function createChatWindow({ panel, handle, edge = 12, maxHeight = 640,
    view = panel?.ownerDocument?.defaultView ?? globalThis.window } = {}) {
    if (!panel || !handle || !view) return { open() {}, close() {}, reset() {}, reconcile() {}, dispose() {} };

    let visible = false;
    let disposed = false;
    let position = null;
    let drag = null;
    let frame = null;
    let observer = null;
    const viewport = view.visualViewport;
    const listeners = [];
    const interactive = 'button, a, input, textarea, select, summary, [contenteditable="true"], [role="button"]';

    const listen = (target, type, callback) => {
        target?.addEventListener(type, callback);
        listeners.push(() => target?.removeEventListener(type, callback));
    };
    const finite = (number, fallback) => Number.isFinite(number) ? number : fallback;
    const clamp = (number, low, high) => Math.min(Math.max(number, low), Math.max(low, high));
    const number = value => finite(Number.parseFloat(value), 0);

    function bounds() {
        const width = Math.max(1, finite(viewport?.width, view.innerWidth));
        const height = Math.max(1, finite(viewport?.height, view.innerHeight));
        const left = finite(viewport?.offsetLeft, 0);
        const top = finite(viewport?.offsetTop, 0);
        const style = view.getComputedStyle?.(panel);
        const inset = side => Math.max(0, number(style?.getPropertyValue(`--safe-area-${side}`)));
        // Preserve space for the panel even when a zoomed visual viewport is tiny.
        const x = Math.min(Math.max(0, edge), width / 4);
        const y = Math.min(Math.max(0, edge), height / 4);
        const minX = left + Math.min(x + inset('left'), width / 3);
        const minY = top + Math.min(y + inset('top'), height / 3);
        const maxX = left + width - Math.min(x + inset('right'), width / 3);
        const maxY = top + height - Math.min(y + inset('bottom'), height / 3);
        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    function reconcile() {
        if (!visible || disposed) return;
        const box = bounds();
        const maxWidthValue = `${box.width}px`;
        const maxHeightValue = `${Math.min(maxHeight, box.height)}px`;
        if (panel.style.maxWidth !== maxWidthValue) panel.style.maxWidth = maxWidthValue;
        if (panel.style.maxHeight !== maxHeightValue) panel.style.maxHeight = maxHeightValue;
        // offset sizes exclude opening transforms, so animation never distorts bounds.
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        position ??= { x: box.maxX - width, y: box.maxY - height };
        position.x = clamp(position.x, box.minX, box.maxX - width);
        position.y = clamp(position.y, box.minY, box.maxY - height);
        panel.style.left = `${position.x}px`;
        panel.style.top = `${position.y}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }

    function schedule() {
        if (!visible || disposed || frame !== null) return;
        frame = view.requestAnimationFrame(() => {
            frame = null;
            reconcile();
        });
    }

    function stopDrag(event) {
        if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
        const id = drag.id;
        drag = null;
        panel.classList.remove('dragging');
        if (handle.hasPointerCapture?.(id)) handle.releasePointerCapture(id);
    }

    function viewportChanged() {
        // Rebase after a screen/keyboard change instead of applying stale drag offsets.
        stopDrag();
        schedule();
    }

    function pointerDown(event) {
        if (!visible || disposed || drag || event.isPrimary === false || event.button !== 0) return;
        if (event.target !== handle && event.target.closest?.(interactive)) return;
        reconcile();
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
            left: position.x, top: position.y };
        panel.classList.add('dragging');
        try { handle.setPointerCapture(event.pointerId); } catch { /* Window fallback owns release. */ }
        handle.focus?.({ preventScroll: true });
        event.preventDefault();
    }

    function pointerMove(event) {
        if (!drag || drag.id !== event.pointerId) return;
        position = { x: drag.left + event.clientX - drag.x, y: drag.top + event.clientY - drag.y };
        reconcile();
    }

    function keyDown(event) {
        if (!visible || disposed || event.target !== handle || event.altKey || event.ctrlKey || event.metaKey) return;
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (event.key === 'Home') {
            reset();
        } else if (directions[event.key]) {
            stopDrag();
            reconcile();
            const [dx, dy] = directions[event.key];
            const step = event.shiftKey ? 40 : 12;
            position.x += dx * step;
            position.y += dy * step;
            reconcile();
        } else return;
        event.preventDefault();
    }

    function reset() {
        stopDrag();
        position = null;
        reconcile();
    }

    function close() {
        visible = false;
        stopDrag();
        observer?.disconnect();
        if (frame !== null) view.cancelAnimationFrame(frame);
        frame = null;
    }

    listen(handle, 'pointerdown', pointerDown);
    listen(view, 'pointermove', pointerMove);
    listen(view, 'pointerup', stopDrag);
    listen(view, 'pointercancel', stopDrag);
    listen(handle, 'lostpointercapture', stopDrag);
    listen(handle, 'keydown', keyDown);
    listen(view, 'resize', viewportChanged);
    listen(view, 'blur', () => stopDrag());
    listen(viewport, 'resize', viewportChanged);
    listen(viewport, 'scroll', viewportChanged);
    if (view.ResizeObserver) observer = new view.ResizeObserver(schedule);

    return {
        open() {
            if (disposed) return;
            visible = true;
            reconcile();
            observer?.observe(panel);
        },
        close, reset, reconcile,
        dispose() {
            if (disposed) return;
            close();
            disposed = true;
            listeners.forEach(remove => remove());
            observer = null;
        }
    };
}
