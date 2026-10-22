import test from 'node:test';
import assert from 'node:assert/strict';
import { createBossPreferences } from '../js/sherpa-boss-preferences.js';

function fixture() {
    const documents = new Map(), listeners = [], writes = [];
    let failWrite = false, waitForWrite = null;
    const snapshot = (uid, metadata = {}) => ({
        exists: () => documents.has(uid), data: () => documents.get(uid),
        metadata: { fromCache: false, hasPendingWrites: false, ...metadata }
    });
    const deliver = (uid, metadata) => listeners.filter(l => l.active && l.uid === uid).forEach(l => l.next(snapshot(uid, metadata)));
    const firestore = {
        doc(_db, collection, uid) { assert.equal(collection, 'companion_preferences'); return { uid }; },
        onSnapshot(ref, options, next, error) {
            assert.equal(options.includeMetadataChanges, true);
            const listener = { uid: ref.uid, next, error, active: true }; listeners.push(listener);
            return () => { listener.active = false; };
        },
        async setDoc(ref, value, options) {
            writes.push({ uid: ref.uid, value, options });
            if (waitForWrite) await waitForWrite;
            if (failWrite) throw new Error('permission-denied');
            documents.set(ref.uid, value); deliver(ref.uid);
        }
    };
    return {
        documents, listeners, writes, deliver, snapshot,
        rejectWrites() { failWrite = true; },
        delayWrites(promise) { waitForWrite = promise; },
        client(uid, options = {}) { return createBossPreferences({ uid, db: {}, firestore, ...options }); }
    };
}

test('a cache miss cannot enable ragdoll before the account setting arrives', () => {
    const f = fixture(), client = f.client('alice');
    assert.equal(client.getState().enabled, false);
    f.deliver('alice', { fromCache: true });
    assert.equal(client.getState().enabled, false);
    assert.equal(client.getState().ready, false);
    f.documents.set('alice', { ragdollEnabled: false }); f.deliver('alice');
    assert.equal(client.getState().ready, true);
    assert.equal(client.getState().enabled, false);
    client.dispose();
});

test('preferences survive another session, sync same-account clients and isolate other accounts', async () => {
    const f = fixture(), alice = f.client('alice'), aliceOtherDevice = f.client('alice'), bob = f.client('bob');
    f.deliver('alice'); f.deliver('bob');
    assert.equal(alice.getState().enabled, true, 'new accounts default to enabled after server confirmation');
    assert.equal(await alice.setEnabled(false), true);
    assert.equal(aliceOtherDevice.getState().enabled, false);
    assert.equal(bob.getState().enabled, true);
    alice.dispose();
    const nextSession = f.client('alice'); f.deliver('alice');
    assert.equal(nextSession.getState().enabled, false);
    assert.equal(await nextSession.setEnabled(true), true);
    assert.equal(aliceOtherDevice.getState().enabled, true);
    assert.deepEqual(f.writes.map(w => w.uid), ['alice', 'alice']);
    assert.deepEqual(f.writes[0].value, { ragdollEnabled: false });
    [aliceOtherDevice, bob, nextSession].forEach(client => client.dispose());
});

test('a rejected save restores the confirmed setting and never reports success', async () => {
    const f = fixture(), states = [], client = f.client('alice', { onChange: value => states.push(value) });
    f.deliver('alice'); f.rejectWrites();
    assert.equal(await client.setEnabled(false), false);
    assert.equal(client.getState().enabled, true);
    assert.equal(client.getState().status, 'save-error');
    assert.ok(states.some(s => s.saving && !s.enabled));
    assert.ok(!states.some(s => s.status === 'saved'));
    assert.equal(f.documents.has('alice'), false);
    client.dispose();
});

test('pending local snapshots do not claim a save and overlapping changes are blocked', async () => {
    const f = fixture(), client = f.client('alice'); f.deliver('alice');
    let finish; f.delayWrites(new Promise(resolve => { finish = resolve; }));
    const saving = client.setEnabled(false);
    f.deliver('alice', { hasPendingWrites: true });
    assert.equal(client.getState().status, 'saving');
    assert.equal(await client.setEnabled(true), false);
    assert.equal(f.writes.length, 1);
    finish(); assert.equal(await saving, true);
    assert.equal(client.getState().status, 'saved');
    client.dispose();
});

test('logout blocks writes and late reads or completed writes cannot change a newer session', async () => {
    const f = fixture(), states = [];
    let current = true, finish;
    const client = f.client('alice', { isCurrent: () => current, onChange: s => states.push(s) });
    f.deliver('alice');
    f.delayWrites(new Promise(resolve => { finish = resolve; }));
    const pending = client.setEnabled(false), oldListener = f.listeners[0];
    current = false; client.dispose(); const count = states.length;
    const bob = f.client('bob'); f.deliver('bob');
    oldListener.next(f.snapshot('alice')); oldListener.error(new Error('late error'));
    finish(); assert.equal(await pending, false);
    assert.equal(await client.setEnabled(true), false);
    assert.equal(states.length, count);
    assert.equal(bob.getState().enabled, true);
    assert.equal(f.writes.length, 1);
    bob.dispose();
});

test('failed reads keep the effect off, retry replaces the listener and rejects stale results', () => {
    const f = fixture(), client = f.client('alice'), first = f.listeners[0];
    first.error(new Error('permission-denied'));
    assert.equal(client.getState().enabled, false);
    assert.equal(client.getState().ready, false);
    client.retry();
    first.next(f.snapshot('alice'));
    assert.equal(client.getState().ready, false);
    f.deliver('alice'); assert.equal(client.getState().enabled, true);
    assert.equal(first.active, false);
    client.dispose();
    assert.ok(f.listeners.every(l => !l.active));
});

test('only signed-in UID paths and boolean changes can be written', async () => {
    const f = fixture();
    for (const uid of ['', null, 'alice/other']) assert.throws(() => f.client(uid), TypeError);
    const client = f.client('alice');
    assert.equal(await client.setEnabled(true), false, 'wait for the account read');
    f.deliver('alice');
    assert.equal(await client.setEnabled('false'), false);
    assert.equal(f.writes.length, 0);
    client.dispose();
});
