(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('theme')) localStorage.setItem('theme', params.get('theme'));
    if (params.has('language')) localStorage.setItem('language', params.get('language'));
    window.sherpaPreview = { scenario: 'cancel', startedAt: performance.now(), callbacks: 0, longTasks: [], events: [], navigation: [], writes: 0, authListeners: new Set(), logoStartup: {} };
    window.sherpaPreview.snapshotDelay = Math.min(10000, Math.max(0, Number(params.get('snapshot-delay')) || 0));
    window.sherpaPreview.activeSubscriptions = 0;
    window.sherpaPreview.calendarEnvironmentAtStart = { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, offsetMinutes: new Date().getTimezoneOffset() };
    document.addEventListener('click', event => {
        const target = event.target.closest?.('.nav-item');
        if (target) window.sherpaPreview.pendingNavigation = { section: target.dataset.tooltip, at: performance.now() };
    }, true);
    new MutationObserver(() => {
        const metrics = window.sherpaPreview, pending = metrics.pendingNavigation;
        const signIn = document.getElementById('googleLoginBtn');
        if (signIn && !metrics.initialSignIn) metrics.initialSignIn = { disabled: signIn.disabled, atMs: Math.round(performance.now() - metrics.startedAt) };
        for (const logo of document.querySelectorAll('[data-fsp-logo]')) {
            const record = metrics.logoStartup[logo.id] ||= {};
            const now = Math.round(performance.now() - metrics.startedAt);
            const rect = logo.getBoundingClientRect();
            if (rect.width && rect.height && record.visibleAtMs === undefined) record.visibleAtMs = now;
            if (logo.dataset.logoRenderer === 'loading' && record.loadingAtMs === undefined) record.loadingAtMs = now;
            if (logo.dataset.logoRenderer === 'three' && record.readyAtMs === undefined) record.readyAtMs = now;
            if (record.readyAtMs !== undefined && record.visibleAtMs !== undefined) record.visibleWaitMs = Math.max(0, record.readyAtMs - record.visibleAtMs);
        }
        if (pending && document.getElementById(pending.section)?.classList.contains('active')) {
            metrics.navigation.push({ section: pending.section, commitMs: Math.round((performance.now() - pending.at) * 10) / 10 });
            metrics.pendingNavigation = null;
        }
    }).observe(document.documentElement, { attributes: true, childList: true, subtree: true });
    const originalFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => originalFrame(time => { window.sherpaPreview.callbacks++; callback(time); });
    window.addEventListener('error', event => window.sherpaPreview.events.push({ type: 'error', message: event.message }));
    window.addEventListener('unhandledrejection', event => window.sherpaPreview.events.push({ type: 'rejection', message: String(event.reason?.message || event.reason) }));
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        new PerformanceObserver(list => window.sherpaPreview.longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
    }
    window.Chart = class {
        constructor(context, options) { this.ctx = context; this.options = options.options; this.data = options.data; }
        destroy() {} update() {} resize() {}
    };
    window.Chart.defaults = { color: '', borderColor: '' };
    if (params.get('real-calendar') !== '1') window.Litepicker = class {
        constructor(options) { this.options = options; this.handlers = new Map(); options.setup?.(this); }
        on(name, callback) { this.handlers.set(name, callback); return this; }
        destroy() {} setOptions() {} setDateRange() {} setDate() {} show() {} hide() {}
        getStartDate() { return { dateInstance: this.options.startDate || new Date(), format: () => '' }; }
        getEndDate() { return { dateInstance: this.options.endDate || new Date(), format: () => '' }; }
    };
    window.JSZip = class {};
    window.addEventListener('DOMContentLoaded', () => {
        if (params.get('real-calendar') === '1') return;
        // Date-picker behavior is stubbed here; use an already loaded local
        // stylesheet so the production resource loader stays unmodified.
        const styles = document.querySelector('link[href*="css/base.css"]');
        if (styles) styles.id = 'sherpaCalendarStyles';
    }, { once: true });
})();
