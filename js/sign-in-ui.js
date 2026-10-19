import { t } from './localization.js';

// Keep the real Google mark, label and button dimensions stable through a popup.
export function setSignInPending(pending, root = globalThis.document) {
    const button = root?.getElementById('googleLoginBtn');
    if (!button) return;
    if (pending && button.getAttribute('aria-busy') !== 'true') {
        // CSS width excludes the sign-in card's brief arrival transform.
        const width = parseFloat(root.defaultView?.getComputedStyle?.(button).width)
            || button.getBoundingClientRect?.().width;
        button.dataset.idleWidth = button.style.width || '';
        button.dataset.restoreFocus = String(root.activeElement === button);
        if (width) button.style.width = `${width}px`;
    } else if (!pending && 'idleWidth' in button.dataset) {
        button.style.width = button.dataset.idleWidth;
        delete button.dataset.idleWidth;
    }
    button.disabled = Boolean(pending);
    button.setAttribute('aria-busy', String(Boolean(pending)));
    const label = button.querySelector('[data-translate]');
    if (label) {
        const key = pending ? 'connecting' : 'login-google';
        label.setAttribute('data-translate', key);
        label.textContent = t(key);
    }
    const spinner = button.querySelector('.login-spinner');
    if (spinner) spinner.hidden = !pending;
    if (!pending && 'restoreFocus' in button.dataset) {
        if (button.dataset.restoreFocus === 'true' && root.documentElement?.dataset.authState !== 'signed-in'
            && (root.activeElement === root.body || root.activeElement === button)) {
            button.focus?.({ preventScroll: true });
        }
        delete button.dataset.restoreFocus;
    }
}

export function clearSignInError(root = globalThis.document) {
    const error = root?.getElementById('loginError');
    if (error) { error.textContent = ''; error.style.display = 'none'; }
}

export function showSignInError(message, { informational = false, root = globalThis.document } = {}) {
    const error = root?.getElementById('loginError');
    if (!error) return;
    error.dataset.kind = informational ? 'info' : 'error';
    error.setAttribute('role', informational ? 'status' : 'alert');
    error.textContent = message;
    error.style.display = 'block';
}
