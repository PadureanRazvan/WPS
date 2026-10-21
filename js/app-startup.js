import { getThemeMeta, normalizeThemePreference, resolveThemePreference } from './theme-system.js?v=2026.10.21';

export function applyBootAppearance(preference, root = globalThis.document) {
    const normalized = normalizeThemePreference(preference);
    const theme = resolveThemePreference(normalized, globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
    root.documentElement.setAttribute('data-theme', theme);
    root.documentElement.setAttribute('data-theme-preference', normalized);
    root.querySelector('meta[name="theme-color"]')?.setAttribute('content', getThemeMeta(theme).metaColor);
}

// Restored authentication can hide the login mark before its idle job or module
// download finishes. Build only the visible view, and retry normally on sign-out.
export function createVisibleLogoStarter({ root = globalThis.document, loadLogo, schedule = callback => {
    if (globalThis.requestIdleCallback) requestIdleCallback(callback, { timeout: 700 });
    else setTimeout(callback, 0);
} }) {
    const pending = new Set();
    return (id, size) => {
        if (pending.has(id)) return;
        pending.add(id);
        schedule(async () => {
            const isVisible = () => {
                const bounds = root.getElementById(id)?.getBoundingClientRect();
                return bounds?.width > 0 && bounds?.height > 0;
            };
            try {
                if (!isVisible()) return;
                const module = await loadLogo();
                if (isVisible()) await module.initLogoAnimation(id, size);
            } catch (error) { console.warn('Sherpa sculpture is unavailable.', error); }
            finally { pending.delete(id); }
        });
    };
}

// An old initializer must not attach listeners after sign-out or clean up a
// newer session. Preloading the runtime module itself opens no data subscription.
export function createAppStartup({ loadRuntime, onLoading = () => {}, onReady = () => {}, onLoggedOut = () => {}, onError = () => {} }) {
    let revision = 0, runtime = null, pendingRuntime = null, queue = Promise.resolve();
    function preload() {
        if (!pendingRuntime) {
            pendingRuntime = Promise.resolve().then(loadRuntime).then(module => { runtime = module; return module; });
            pendingRuntime.catch(() => { pendingRuntime = null; });
        }
        return pendingRuntime;
    }
    return {
        preload,
        login(user) {
            const session = ++revision;
            const isCurrent = () => session === revision;
            onLoading(user);
            queue = queue.catch(() => {}).then(async () => {
                if (!isCurrent()) return;
                try {
                    const app = await preload();
                    if (!isCurrent()) return;
                    await app.initializeApp(user, { isCurrent });
                    if (!isCurrent()) { app.cleanupApp(); return; }
                    onReady(user);
                } catch (error) {
                    if (!isCurrent()) return;
                    runtime?.cleanupApp();
                    onError(error);
                }
            });
            return queue;
        },
        logout() { revision++; runtime?.cleanupApp(); onLoggedOut(); },
        dispose() { revision++; runtime?.cleanupApp(); }
    };
}
