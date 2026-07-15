// js/app-shell-wiring.js

function currentDocument() {
    return globalThis.document || null;
}

function currentWindow() {
    return globalThis.window || null;
}

function currentStorage() {
    return globalThis.localStorage || null;
}

function bindEvent(target, eventName, handler, bindings) {
    if (!target || typeof handler !== 'function') return;
    target.addEventListener?.(eventName, handler);
    bindings?.push({ target, eventName, handler });
}

function teardownBindings(bindings) {
    bindings.forEach(({ target, eventName, handler }) => {
        target?.removeEventListener?.(eventName, handler);
    });
}

function byId(root, id) {
    return root?.getElementById?.(id) || null;
}

function query(root, selector) {
    return root?.querySelector?.(selector) || null;
}

function queryAll(root, selector) {
    return Array.from(root?.querySelectorAll?.(selector) || []);
}

function getStoredTheme(storage) {
    return storage?.getItem?.('theme') || 'system';
}

function supportsNativePopover(menu) {
    return typeof menu?.showPopover === 'function' && typeof menu?.hidePopover === 'function';
}

function isNativePopoverOpen(menu) {
    if (!supportsNativePopover(menu)) return false;
    try {
        return menu.matches?.(':popover-open') || false;
    } catch (_) {
        return false;
    }
}

function setDisclosureState(toggle, menu, isOpen) {
    if (isOpen) {
        menu?.classList?.add('open');
        toggle?.classList?.add('open');
    } else {
        menu?.classList?.remove('open');
        toggle?.classList?.remove('open');
    }
    toggle?.setAttribute?.('aria-expanded', String(isOpen));
}

function closeDisclosure(toggle, menu) {
    const wasOpen = supportsNativePopover(menu)
        ? isNativePopoverOpen(menu)
        : menu?.classList?.contains?.('open');

    if (supportsNativePopover(menu) && wasOpen) {
        try { menu.hidePopover(); } catch (_) { /* The browser may already be closing it. */ }
    }
    setDisclosureState(toggle, menu, false);
    return Boolean(wasOpen);
}

export function showLoginScreen(root = currentDocument()) {
    const loginScreen = byId(root, 'loginScreen');
    const appContainer = byId(root, 'appContainer');

    if (loginScreen) loginScreen.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
}

export function showAuthenticatedShell(user = {}, root = currentDocument()) {
    const loginScreen = byId(root, 'loginScreen');
    const appContainer = byId(root, 'appContainer');

    if (loginScreen) loginScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = '';

    const avatar = byId(root, 'userAvatar');
    const userName = byId(root, 'userName');
    const userEmail = byId(root, 'userEmail');

    if (avatar) {
        avatar.src = user.photoURL || '';
        avatar.style.display = user.photoURL ? 'block' : 'none';
    }
    if (userName) userName.textContent = user.displayName || 'User';
    if (userEmail) userEmail.textContent = user.email || '';
}

export function bindAppRefreshEvents({ eventTarget = currentDocument(), actions = {} } = {}) {
    const bindings = [];
    bindEvent(eventTarget, 'productivity-data-updated', () => {
        actions.updateAverageProductivityCard?.();
        actions.initializeProductivityChart?.();
    }, bindings);

    return () => teardownBindings(bindings);
}

export function bindAppShellInteractions({
    root = currentDocument(),
    actions = {},
    getCurrentLanguage = () => 'ro',
    setCurrentLanguage = () => {}
} = {}) {
    const bindings = [];

    queryAll(root, '.nav-item').forEach(item => {
        bindEvent(item, 'click', () => {
            actions.showSection?.(item.dataset.tooltip, item);
        }, bindings);
    });

    const themeToggle = query(root, '.theme-toggle');
    const themeMenu = byId(root, 'themeMenu');
    const nativeThemeMenu = supportsNativePopover(themeMenu);
    const closeThemeMenu = () => closeDisclosure(themeToggle, themeMenu);

    bindEvent(themeToggle, 'click', event => {
        if (nativeThemeMenu) return;
        event.stopPropagation?.();
        const isOpen = themeMenu?.classList?.toggle('open') || false;
        setDisclosureState(themeToggle, themeMenu, isOpen);
    }, bindings);

    bindEvent(themeMenu, 'toggle', event => {
        if (!nativeThemeMenu) return;
        const isOpen = event.newState ? event.newState === 'open' : isNativePopoverOpen(themeMenu);
        setDisclosureState(themeToggle, themeMenu, isOpen);
    }, bindings);

    bindEvent(themeMenu, 'click', event => {
        const target = event.target?.closest?.('.theme-option');
        if (!target) return;

        actions.setTheme?.(target.dataset.themeChoice, {
            x: Number.isFinite(event.clientX) ? event.clientX : undefined,
            y: Number.isFinite(event.clientY) ? event.clientY : undefined
        });
        closeThemeMenu();
        themeToggle?.focus?.();
    }, bindings);

    bindEvent(root, 'click', event => {
        if (!nativeThemeMenu && !event.target?.closest?.('.theme-selector')) closeThemeMenu();
    }, bindings);

    bindEvent(root, 'keydown', event => {
        if (event.key !== 'Escape') return;
        if (closeThemeMenu()) themeToggle?.focus?.();
    }, bindings);

    const languageDropdown = query(root, '.language-dropdown');
    const languageMenu = byId(root, 'languageMenu');
    const nativeLanguageMenu = supportsNativePopover(languageMenu);
    const closeLanguageMenu = () => closeDisclosure(languageDropdown, languageMenu);

    bindEvent(languageDropdown, 'click', event => {
        if (nativeLanguageMenu) return;
        event.stopPropagation?.();
        const isOpen = languageMenu?.classList?.toggle('open') || false;
        setDisclosureState(languageDropdown, languageMenu, isOpen);
    }, bindings);

    bindEvent(languageMenu, 'toggle', event => {
        if (!nativeLanguageMenu) return;
        const isOpen = event.newState ? event.newState === 'open' : isNativePopoverOpen(languageMenu);
        setDisclosureState(languageDropdown, languageMenu, isOpen);
    }, bindings);

    bindEvent(languageMenu, 'click', event => {
        const target = event.target?.closest?.('.language-option');
        if (!target) return;

        setCurrentLanguage(target.dataset.lang);
        actions.updateLanguageUI?.(target.dataset.lang);
        closeLanguageMenu();
        languageDropdown?.focus?.();
    }, bindings);

    bindEvent(root, 'click', event => {
        if (!nativeLanguageMenu && !event.target?.closest?.('.language-selector')) closeLanguageMenu();
    }, bindings);

    bindEvent(root, 'keydown', event => {
        if (event.key !== 'Escape') return;
        if (closeLanguageMenu()) languageDropdown?.focus?.();
    }, bindings);

    actions.updateLanguageUI?.(getCurrentLanguage());
    actions.bindPlannerControls?.();

    bindEvent(query(root, '.sidebar-toggle'), 'click', () => {
        actions.toggleSidebar?.();
    }, bindings);

    bindEvent(byId(root, 'logoutBtn'), 'click', async () => {
        await actions.logout?.();
        actions.setAppInitialized?.(false);
    }, bindings);

    return () => teardownBindings(bindings);
}

export function bindAppLifecycleEvents({
    root = currentDocument(),
    windowTarget = currentWindow(),
    storage = currentStorage(),
    actions = {}
} = {}) {
    const bindings = [];

    bindEvent(root, 'DOMContentLoaded', () => {
        actions.setTheme?.(getStoredTheme(storage));
        actions.setDynamicGreeting?.();
        actions.initLogoAnimation?.('loginLogo', 100);

        bindEvent(byId(root, 'googleLoginBtn'), 'click', actions.loginWithGoogle, bindings);

        actions.onAuthChange?.(
            async user => actions.onLogin?.(user),
            () => actions.onLogout?.()
        );
    }, bindings);

    bindEvent(windowTarget, 'beforeunload', () => {
        actions.cleanupBeforeUnload?.();
    }, bindings);

    return () => teardownBindings(bindings);
}
