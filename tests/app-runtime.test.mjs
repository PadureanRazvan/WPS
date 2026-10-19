import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers/browser-module.mjs';

function fixture(overrides = {}) {
    const calls = [];
    let shellActions;
    const names = ['initializePlanner', 'cleanupPlanner', 'clearSelection', 'undoLastChange', 'initializeUsers', 'cleanupUsers', 'initializeProductivity', 'cleanupProductivity', 'initializeSchedule', 'cleanupSchedule', 'initializeReports', 'cleanupReports', 'initializeInfoVersion', 'initializeInfoInteractive', 'initializeCharts', 'initializeProductivityChart', 'updateAverageProductivityCard', 'setTheme', 'updateLanguageUI', 'showSection', 'openEditModal', 'selectEditType', 'saveModalChanges', 'closeEditModal', 'toggleSidebar', 'initLogoAnimation', 'initializeChat', 'cleanupChat', 'logout', 'initializeLogs', 'setLogUser', 'logActivity', 'applyDailyGreeting', 'loadWorkspaceLibraries', 'yieldToInterface'];
    const dependencies = Object.fromEntries(names.map(name => [name, () => calls.push(name)]));
    const shell = loadBrowserModule('../../js/app-runtime.js', {
        ...dependencies,
        document: {}, localStorage: { getItem: () => 'en' }, console: { log() {} },
        bindAppShellInteractions(options) { calls.push('bindShell'); shellActions = options.actions; options.actions.bindPlannerControls(); return () => calls.push('unbindShell'); },
        bindPlannerControlInteractions: () => () => calls.push('unbindPlannerControls'),
        bindAppRefreshEvents: () => () => calls.push('unbindRefresh'),
        ...overrides
    }, 'globalThis.runtime = { initializeApp, cleanupApp };');
    return { calls, runtime: shell.runtime, get shellActions() { return shellActions; } };
}

test('navigation is bound before slow workspace libraries finish downloading', async () => {
    let resolveLibraries;
    const libraries = new Promise(resolve => resolveLibraries = resolve);
    const f = fixture({ loadWorkspaceLibraries: () => libraries });
    const pending = f.runtime.initializeApp({ email: 'preview@example.test' });
    assert.ok(f.calls.includes('bindShell'));
    assert.ok(!f.calls.includes('initializePlanner'));
    resolveLibraries(); await pending;
    assert.ok(f.calls.includes('initializePlanner'));
});

test('sign-out removes shell, refresh and shortcut bindings before another session', async () => {
    const f = fixture(), user = { email: 'preview@example.test' };
    await f.runtime.initializeApp(user); f.runtime.cleanupApp();
    for (const name of ['unbindShell', 'unbindRefresh', 'unbindPlannerControls']) assert.equal(f.calls.filter(call => call === name).length, 1, name);
    await f.runtime.initializeApp(user);
    assert.equal(f.calls.filter(call => call === 'bindShell').length, 2);
});

test('sign-out during library loading never starts authenticated subscriptions', async () => {
    let resolveLibraries, current = true;
    const f = fixture({ loadWorkspaceLibraries: () => new Promise(resolve => resolveLibraries = resolve) });
    const pending = f.runtime.initializeApp({}, { isCurrent: () => current });
    current = false; f.runtime.cleanupApp(); resolveLibraries(); await pending;
    assert.ok(!f.calls.includes('initializePlanner'));
    assert.ok(!f.calls.includes('initializeProductivity'));
});

test('an offline activity-log write does not delay signing out', async () => {
    let signOuts = 0;
    const f = fixture({ logActivity: () => new Promise(() => {}), logout: async () => signOuts++ });
    await f.runtime.initializeApp({});
    await f.shellActions.logout();
    assert.equal(signOuts, 1);
});
