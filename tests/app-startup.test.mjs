import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppStartup, applyBootAppearance, createVisibleLogoStarter } from '../js/app-startup.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const turn = () => new Promise(resolve => setImmediate(resolve));

test('direct dashboard entry skips the hidden login sculpture and sign-out starts it once', async () => {
    let visible = true, downloads = 0;
    const scheduled = [], initialized = [];
    const start = createVisibleLogoStarter({
        root: { getElementById: () => ({ getBoundingClientRect: () => ({ width: visible ? 220 : 0, height: visible ? 185 : 0 }) }) },
        schedule: callback => scheduled.push(callback),
        loadLogo: async () => { downloads++; return { initLogoAnimation: (...args) => initialized.push(args) }; }
    });
    start('loginLogo', 100);
    visible = false; // Restored auth switches shells before the idle callback.
    await scheduled.shift()();
    assert.equal(downloads, 0);
    visible = true; // Sign-out restores the sign-in view.
    start('loginLogo', 100); start('loginLogo', 100);
    assert.equal(scheduled.length, 1);
    await scheduled.shift()();
    assert.deepEqual(initialized, [['loginLogo', 100]]);
});

test('sign-in resolving during a sculpture download does not build an invisible renderer', async () => {
    let visible = true;
    const download = deferred(), scheduled = [], initialized = [];
    const start = createVisibleLogoStarter({
        root: { getElementById: () => ({ getBoundingClientRect: () => ({ width: visible ? 220 : 0, height: visible ? 185 : 0 }) }) },
        schedule: callback => scheduled.push(callback), loadLogo: () => download.promise
    });
    start('loginLogo', 100);
    const job = scheduled.shift()();
    visible = false;
    download.resolve({ initLogoAnimation: (...args) => initialized.push(args) });
    await job;
    assert.deepEqual(initialized, []);
});

test('preloading coalesces downloads and never initializes authenticated modules', async () => {
    let loads = 0, initializations = 0;
    const startup = createAppStartup({ loadRuntime: async () => { loads++; return { initializeApp() { initializations++; } }; } });
    await Promise.all([startup.preload(), startup.preload()]);
    assert.equal(loads, 1);
    assert.equal(initializations, 0);
});

test('the shell responds before asynchronous workspace loading begins', async () => {
    const calls = [];
    const startup = createAppStartup({ onLoading: () => calls.push('shell'), loadRuntime: async () => ({ initializeApp() { calls.push('initialize'); } }), onReady: () => calls.push('ready') });
    const pending = startup.login({ uid: 'a' });
    assert.deepEqual(calls, ['shell']);
    await pending;
    assert.deepEqual(calls, ['shell', 'initialize', 'ready']);
});

test('signing out during a module download prevents late initialization', async () => {
    const download = deferred();
    const calls = [];
    const startup = createAppStartup({ loadRuntime: () => download.promise, onLoggedOut: () => calls.push('logout'), onReady: () => calls.push('ready') });
    const login = startup.login({ uid: 'a' });
    await turn();
    startup.logout();
    download.resolve({ initializeApp: () => calls.push('initialize') });
    await login;
    assert.deepEqual(calls, ['logout']);
});

test('a new sign-in waits for the old initializer to finish cleanup', async () => {
    const oldInitialization = deferred(), calls = [];
    const runtime = {
        async initializeApp(user, { isCurrent }) {
            calls.push(`initialize:${user.uid}`);
            if (user.uid === 'old') { await oldInitialization.promise; assert.equal(isCurrent(), false); }
        },
        cleanupApp: () => calls.push('cleanup')
    };
    const startup = createAppStartup({ loadRuntime: async () => runtime, onReady: user => calls.push(`ready:${user.uid}`) });
    const old = startup.login({ uid: 'old' });
    await turn(); startup.logout();
    const next = startup.login({ uid: 'new' });
    assert.deepEqual(calls, ['initialize:old', 'cleanup']);
    oldInitialization.resolve();
    await Promise.all([old, next]);
    assert.deepEqual(calls, ['initialize:old', 'cleanup', 'cleanup', 'initialize:new', 'ready:new']);
});

test('a failed download reports once and permits a later load attempt', async () => {
    const calls = []; let attempts = 0;
    const startup = createAppStartup({
        loadRuntime: async () => { if (++attempts === 1) throw new Error('offline'); return { initializeApp() {} }; },
        onError: error => calls.push(error.message), onReady: () => calls.push('ready')
    });
    await startup.login({ uid: 'a' }); await startup.login({ uid: 'a' });
    assert.deepEqual(calls, ['offline', 'ready']);
});

test('initialization failure disposes partial subscriptions before reporting', async () => {
    const calls = [];
    const startup = createAppStartup({ loadRuntime: async () => ({ initializeApp() { throw Error('failed'); }, cleanupApp() { calls.push('cleanup'); } }), onError: () => calls.push('error') });
    await startup.login({ uid: 'a' });
    assert.deepEqual(calls, ['cleanup', 'error']);
});

test('a late completion cannot show the workspace after disposal', async () => {
    const pending = deferred(); let ready = 0;
    const startup = createAppStartup({ loadRuntime: async () => ({ initializeApp: () => pending.promise, cleanupApp() {} }), onReady: () => ready++ });
    const login = startup.login({ uid: 'a' }); await turn(); startup.dispose(); pending.resolve(); await login;
    assert.equal(ready, 0);
});

test('boot appearance applies the saved palette and browser surface without importing UI modules', () => {
    const values = {};
    const root = { documentElement: { setAttribute: (key, value) => values[key] = value }, querySelector: () => ({ setAttribute: (_key, value) => values.meta = value }) };
    applyBootAppearance('aurora', root);
    assert.deepEqual(values, { 'data-theme': 'aurora', 'data-theme-preference': 'aurora', meta: '#0b1110' });
});
