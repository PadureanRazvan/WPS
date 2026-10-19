import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers/browser-module.mjs';

function fixture() {
    const subscriptions = [];
    let resolveLoad, controls = 0, unsubscribed = 0;
    const nothing = () => {};
    const shell = loadBrowserModule('../../js/productivity.js', {
        db: {}, collection: nothing, doc: nothing, setDoc: nothing, deleteDoc: nothing, getDocs: nothing, onSnapshot: nothing,
        getProductivityDateStatus: nothing, buildProductivityExportCsv: nothing, showTemporaryMessage: nothing,
        createProductivityFirestoreStore: () => ({
            subscribe(handlers) { subscriptions.push(handlers); return () => unsubscribed++; },
            loadAll: () => new Promise(resolve => resolveLoad = resolve)
        }),
        createProductivityDateCommands: () => ({}), createProductivityAgentActions: () => ({}),
        bindProductivityUploadArea: nothing, bindProductivityDateRangePicker: nothing,
        bindProductivityAgentCombobox: () => ({ cleanup() {} }),
        bindProductivityControls: () => controls++, hasAnyProductivityData: () => false,
        document: { getElementById: () => null, querySelector: () => null },
        console: { log() {}, error() {} }
    }, `
        refreshProductivityViews = () => {};
        renderUploadCalendar = () => {};
        updateUploadDateStatus = () => {};
        globalThis.session = { initializeProductivity, cleanupProductivity, dates: () => [...dataByDate.keys()] };
    `);
    return { session: shell.session, subscriptions, resolveLoad: result => resolveLoad(result), get controls() { return controls; }, get unsubscribed() { return unsubscribed; } };
}

test('sign-out settles a pending first snapshot and prevents late UI bindings', async () => {
    const f = fixture();
    const initialization = f.session.initializeProductivity();
    f.session.cleanupProductivity();
    const settled = await Promise.race([initialization.then(() => true), new Promise(resolve => setImmediate(() => resolve(false)))]);
    assert.equal(settled, true, 'a canceled first snapshot must not block the next sign-in');
    assert.equal(f.controls, 0);
    assert.equal(f.unsubscribed, 1);
});

test('an old fallback download cannot replace data or bindings belonging to the next sign-in', async () => {
    const f = fixture();
    const oldInitialization = f.session.initializeProductivity();
    const oldFallback = f.subscriptions[0].onError(Error('offline'));
    f.session.cleanupProductivity();
    const nextInitialization = f.session.initializeProductivity();
    f.subscriptions[1].onData({ dataByDate: new Map([['new-session', {}]]), size: 1 });
    await nextInitialization;
    f.resolveLoad({ dataByDate: new Map([['old-session', {}]]), size: 1 });
    await oldFallback;
    await oldInitialization;
    assert.deepEqual(Array.from(f.session.dates()), ['new-session']);
    assert.equal(f.controls, 1);
});
