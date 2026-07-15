const TOAST_TYPES = new Set(['success', 'error', 'info']);
const TOAST_DEFAULT_DURATIONS = Object.freeze({
    success: 3200,
    error: 6000,
    info: 4500
});
const TOAST_MIN_DURATION = 1000;
const TOAST_MAX_DURATION = 12000;
const TOAST_EXIT_DURATION = 220;
const TOAST_LIMIT = 4;

let toastSequence = 0;

export function normalizeToastType(type) {
    return TOAST_TYPES.has(type) ? type : 'info';
}

export function resolveToastDuration(type, duration) {
    const normalizedType = normalizeToastType(type);
    if (duration === 0) return 0;

    const parsed = Number(duration);
    if (!Number.isFinite(parsed)) return TOAST_DEFAULT_DURATIONS[normalizedType];
    return Math.min(TOAST_MAX_DURATION, Math.max(TOAST_MIN_DURATION, Math.round(parsed)));
}

export function buildToastModel(message, type = 'info', duration) {
    const normalizedMessage = String(message ?? '').trim();
    if (!normalizedMessage) return null;

    const normalizedType = normalizeToastType(type);
    return Object.freeze({
        id: `sherpa-toast-${++toastSequence}`,
        message: normalizedMessage,
        type: normalizedType,
        duration: resolveToastDuration(normalizedType, duration)
    });
}

function isPopoverOpen(element) {
    try {
        return element.matches(':popover-open');
    } catch {
        return element.dataset.fallbackOpen === 'true';
    }
}

function openViewport(viewport) {
    if (typeof viewport.showPopover === 'function') {
        if (!isPopoverOpen(viewport)) viewport.showPopover();
        return;
    }

    viewport.dataset.fallbackOpen = 'true';
}

function closeViewport(viewport) {
    if (viewport.childElementCount > 0) return;

    if (typeof viewport.hidePopover === 'function') {
        if (isPopoverOpen(viewport)) viewport.hidePopover();
        return;
    }

    delete viewport.dataset.fallbackOpen;
}

function announceToast(root, model) {
    const targetId = model.type === 'error'
        ? 'toastAssertiveAnnouncer'
        : 'toastPoliteAnnouncer';
    const announcer = root.getElementById(targetId);
    if (!announcer) return;

    announcer.textContent = '';
    requestAnimationFrame(() => {
        announcer.textContent = model.message;
    });
}

function createToastElement(root, model, labels) {
    const toast = root.createElement('article');
    toast.id = model.id;
    toast.className = `toast-notice toast-notice--${model.type}`;
    toast.dataset.state = 'open';
    toast.dataset.paused = 'false';
    toast.style.setProperty('--toast-duration', `${model.duration}ms`);
    toast.setAttribute('aria-label', `${labels[model.type]}: ${model.message}`);

    const icon = root.createElement('span');
    icon.className = 'toast-notice__icon';
    icon.setAttribute('aria-hidden', 'true');

    const messageElement = root.createElement('p');
    messageElement.className = 'toast-notice__message';
    messageElement.textContent = model.message;

    const dismissButton = root.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'toast-notice__dismiss';
    dismissButton.setAttribute('aria-label', labels.dismiss);
    dismissButton.title = labels.dismiss;
    dismissButton.innerHTML = '<span aria-hidden="true">&times;</span>';

    const progress = root.createElement('span');
    progress.className = 'toast-notice__progress';
    progress.setAttribute('aria-hidden', 'true');
    if (model.duration === 0) progress.hidden = true;

    toast.append(icon, messageElement, dismissButton, progress);
    return { toast, dismissButton };
}

function trimViewport(viewport) {
    const visible = viewport.querySelectorAll('.toast-notice:not([data-state="closing"])');
    if (visible.length < TOAST_LIMIT) return;
    visible[0].querySelector('.toast-notice__dismiss')?.click();
}

export function showToastNotification(message, {
    type = 'info',
    duration,
    labels = {},
    root = document
} = {}) {
    const model = buildToastModel(message, type, duration);
    const viewport = root.getElementById('toastViewport');
    if (!model || !viewport) return null;

    const resolvedLabels = {
        dismiss: labels.dismiss || 'Dismiss notification',
        success: labels.success || 'Success',
        error: labels.error || 'Error',
        info: labels.info || 'Information'
    };

    trimViewport(viewport);
    const { toast, dismissButton } = createToastElement(root, model, resolvedLabels);
    viewport.appendChild(toast);
    openViewport(viewport);
    announceToast(root, model);

    let timerId = null;
    let remaining = model.duration;
    let timerStartedAt = 0;
    let pausedByPointer = false;
    let pausedByFocus = false;

    const pause = () => {
        if (timerId === null) return;
        clearTimeout(timerId);
        timerId = null;
        remaining = Math.max(0, remaining - (Date.now() - timerStartedAt));
        toast.dataset.paused = 'true';
    };

    const dismiss = () => {
        if (toast.dataset.state === 'closing') return;
        if (timerId !== null) clearTimeout(timerId);
        timerId = null;
        toast.dataset.state = 'closing';

        setTimeout(() => {
            toast.remove();
            closeViewport(viewport);
        }, TOAST_EXIT_DURATION);
    };

    const resume = () => {
        if (timerId !== null || remaining <= 0 || toast.dataset.state === 'closing') return;
        timerStartedAt = Date.now();
        toast.dataset.paused = 'false';
        timerId = setTimeout(dismiss, remaining);
    };

    const resumeWhenReadable = () => {
        if (!pausedByPointer && !pausedByFocus) resume();
    };

    dismissButton.addEventListener('click', dismiss);
    toast.addEventListener('pointerenter', () => {
        pausedByPointer = true;
        pause();
    });
    toast.addEventListener('pointerleave', () => {
        pausedByPointer = false;
        resumeWhenReadable();
    });
    toast.addEventListener('focusin', () => {
        pausedByFocus = true;
        pause();
    });
    toast.addEventListener('focusout', event => {
        if (toast.contains(event.relatedTarget)) return;
        pausedByFocus = false;
        resumeWhenReadable();
    });

    resume();
    return Object.freeze({ id: model.id, element: toast, dismiss, pause, resume });
}
