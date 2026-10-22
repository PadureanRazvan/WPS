import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreLease } from '../src/lease.js';

function database() {
  let state;
  let queue = Promise.resolve();
  return {
    doc: path => path,
    get state() { return structuredClone(state); },
    replace(value) { state = structuredClone(value); },
    runTransaction(callback) {
      const operation = queue.then(async () => {
        let draft = structuredClone(state);
        const result = await callback({
          async get() { return { exists: !!draft, data: () => structuredClone(draft) }; },
          set(_ref, value) { draft = structuredClone(value); },
          update(_ref, value) { draft = { ...draft, ...structuredClone(value) }; },
          delete() { draft = undefined; }
        });
        state = draft;
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    }
  };
}

function fixture() {
  const db = database();
  let time = 1000;
  let beat;
  const manager = createFirestoreLease({ db, leaseMs: 100, heartbeatMs: 20, maxHoldMs: 300, now: () => time,
    setIntervalFn: callback => { beat = callback; return 1; }, clearIntervalFn: () => {} });
  return { db, manager, setTime: value => { time = value; }, async heartbeat() { beat(); await new Promise(setImmediate); } };
}

test('parallel callers cannot acquire the same account lease', async () => {
  const { manager } = fixture();
  const results = await Promise.allSettled([manager.acquire(), manager.acquire()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.reason, 'AI_BUSY');
  await results.find(result => result.status === 'fulfilled').value.release();
});

test('stale owner cannot release a newly acquired lease', async () => {
  const f = fixture();
  const old = await f.manager.acquire();
  f.setTime(1101);
  const replacement = await f.manager.acquire();
  const owner = f.db.state.owner;
  await old.release();
  assert.equal(f.db.state.owner, owner);
  await replacement.release();
  assert.equal(f.db.state, undefined);
});

test('expired lease during credential use requires recovery instead of reusing potentially rotated auth', async () => {
  const f = fixture();
  const lease = await f.manager.acquire();
  await lease.markAuthInUse();
  f.setTime(1101);
  await assert.rejects(f.manager.acquire(), { reason: 'AI_AUTH_RECOVERY_REQUIRED' });
  await lease.release();
  assert.equal(f.db.state.recoveryRequired, true);
});

test('successful credential persistence clears uncertain-state marker and releases cleanly', async () => {
  const f = fixture();
  const lease = await f.manager.acquire();
  await lease.markAuthInUse();
  await lease.markAuthSettled();
  await lease.release();
  assert.equal(f.db.state, undefined);
});

test('heartbeat loss aborts active generation and cannot delete replacement owner', async () => {
  const f = fixture();
  const lease = await f.manager.acquire();
  f.db.replace({ owner: 'replacement', expiresAt: 9999 });
  await f.heartbeat();
  assert.equal(lease.signal.aborted, true);
  assert.equal(lease.signal.reason.reason, 'AI_LEASE_LOST');
  await lease.release();
  assert.equal(f.db.state.owner, 'replacement');
});

test('heartbeat renews lease but never beyond maximum hold time', async () => {
  const f = fixture();
  const lease = await f.manager.acquire();
  for (const time of [1080, 1160, 1240]) { f.setTime(time); await f.heartbeat(); }
  assert.equal(f.db.state.expiresAt, 1300);
  f.setTime(1300);
  await f.heartbeat();
  assert.equal(lease.signal.aborted, true);
  await lease.release();
});

test('credential-persistence quarantine survives release and rejects future acquisition', async () => {
  const f = fixture();
  const lease = await f.manager.acquire();
  await lease.quarantine();
  await lease.release();
  await assert.rejects(f.manager.acquire(), { reason: 'AI_AUTH_RECOVERY_REQUIRED' });
});
