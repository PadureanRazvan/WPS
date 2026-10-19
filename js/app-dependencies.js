const loading = new Map();

function loadLibrary(name, url, stylesheet = false) {
    if (stylesheet ? document.getElementById('sherpaCalendarStyles')?.sheet : globalThis[name]) return Promise.resolve();
    if (loading.has(name)) return loading.get(name);
    const promise = new Promise((resolve, reject) => {
        const element = document.createElement(stylesheet ? 'link' : 'script');
        if (stylesheet) {
            element.id = 'sherpaCalendarStyles';
            element.rel = 'stylesheet';
            element.href = url;
        } else { element.src = url; element.async = true; }
        const finish = error => {
            clearTimeout(timer);
            element.onload = element.onerror = null;
            if (error) { element.remove(); reject(error); }
            else resolve();
        };
        const timer = setTimeout(() => finish(new Error(`Loading ${name} timed out`)), 15000);
        element.onload = () => stylesheet || globalThis[name] ? finish() : finish(new Error(`${name} did not initialize`));
        element.onerror = () => finish(new Error(`Could not load ${name}`));
        document.head.append(element);
    });
    loading.set(name, promise);
    promise.catch(() => loading.delete(name));
    return promise;
}

export function loadWorkspaceLibraries() {
    return Promise.all([
        loadLibrary('Chart', 'https://cdn.jsdelivr.net/npm/chart.js'),
        loadLibrary('Litepicker', 'https://cdn.jsdelivr.net/npm/litepicker/dist/litepicker.js'),
        loadLibrary('calendar-styles', 'https://cdn.jsdelivr.net/npm/litepicker/dist/css/litepicker.css', true),
        loadLibrary('JSZip', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js')
    ]);
}

export function yieldToInterface() {
    if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
    return new Promise(resolve => setTimeout(resolve, 0));
}
