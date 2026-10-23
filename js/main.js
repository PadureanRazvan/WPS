// Keep sign-in independent of Planner, reports, productivity and chart libraries.
import { bindAppLifecycleEvents, showAuthenticatedShell, showLoginScreen } from './app-shell-wiring.js?v=2026.10.23.2';
import { loginWithGoogle, onAuthChange } from './auth.js?v=2026.10.23.2';
import { applyDailyGreeting } from './daily-greeting.js';
import { applyBootAppearance, createAppStartup, createVisibleLogoStarter } from './app-startup.js';
import { setSignInPending, showSignInError } from './sign-in-ui.js';
import { t } from './localization.js';

const initLogoAnimation = createVisibleLogoStarter({
    loadLogo: () => import('./logo-animation.js?v=2026.10.23.2')
});

const startup = createAppStartup({
    loadRuntime: () => import('./app-runtime.js?v=2026.10.23.2'),
    onLoading(user) {
        showAuthenticatedShell(user, document);
        document.documentElement.dataset.workspaceState = 'loading';
        document.getElementById('appContainer')?.setAttribute('aria-busy', 'true');
    },
    onReady() {
        document.documentElement.dataset.workspaceState = 'ready';
        document.getElementById('appContainer')?.setAttribute('aria-busy', 'false');
    },
    onLoggedOut() {
        showLoginScreen(document);
        initLogoAnimation('loginLogo', 100);
        delete document.documentElement.dataset.workspaceState;
        setSignInPending(false);
    },
    onError(error) {
        console.error('Sherpa workspace could not initialize.', error);
        showLoginScreen(document);
        initLogoAnimation('loginLogo', 100);
        document.documentElement.dataset.workspaceState = 'error';
        showSignInError(t('workspace-load-failed'));
    }
});

const systemAppearance = window.matchMedia?.('(prefers-color-scheme: dark)');
const updateSignedOutAppearance = () => {
    if (document.documentElement.dataset.authState === 'signed-out') {
        applyBootAppearance(localStorage.getItem('theme') || 'system');
    }
};
systemAppearance?.addEventListener?.('change', updateSignedOutAppearance);

bindAppLifecycleEvents({
    root: document, windowTarget: window, storage: localStorage,
    actions: {
        setTheme: applyBootAppearance,
        setDynamicGreeting: () => { applyDailyGreeting(document); setSignInPending(false); },
        initLogoAnimation,
        loginWithGoogle: () => {
            const attempt = loginWithGoogle();
            // Preserve the provider call inside the original user activation.
            // Workspace downloads overlap the account chooser.
            startup.preload().then(runtime => runtime.preloadWorkspaceLibraries?.()).catch(() => {});
            return attempt;
        },
        onAuthChange,
        onLogin: user => startup.login(user),
        onLogout: () => startup.logout(),
        cleanupBeforeUnload: () => {
            systemAppearance?.removeEventListener?.('change', updateSignedOutAppearance);
            startup.dispose();
        }
    }
});
