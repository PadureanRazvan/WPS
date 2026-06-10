import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeStoredScheduleRow,
  buildScheduleMonthDocument,
  hydrateScheduleSnapshot,
  createScheduleFirestoreStore
} from '../js/schedule-persistence.js';

function snapshotFrom(docs) {
  return {
    size: docs.length,
    forEach(callback) {
      docs.forEach(({ id, data }) => callback({ id, data: () => data }));
    }
  };
}

const ROW = {
  agentUsername: 'mpopescu',
  agentName: 'Maria Popescu',
  date: '2026-06-01',
  startTime: '09:00',
  endTime: '17:00',
  breakMinutes: 30,
  workedMinutes: 450,
  status: 'ok',
  notes: 'x'
};

test('normalizeStoredScheduleRow coerces to a flat JSON-safe shape and drops extras', () => {
  const out = normalizeStoredScheduleRow({ ...ROW, junk: 'nope', breakMinutes: '30', workedMinutes: null });
  assert.deepEqual(out, {
    agentUsername: 'mpopescu',
    agentName: 'Maria Popescu',
    date: '2026-06-01',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    workedMinutes: 0,
    status: 'ok',
    notes: 'x'
  });
  assert.equal('junk' in out, false);
});

test('normalizeStoredScheduleRow defaults a missing status to ok', () => {
  assert.equal(normalizeStoredScheduleRow({ agentUsername: 'a' }).status, 'ok');
});

test('buildScheduleMonthDocument stamps month, normalized rows and updatedAt', () => {
  const doc = buildScheduleMonthDocument('2026-06', [ROW], { now: () => '2026-06-10T08:00:00.000Z' });
  assert.equal(doc.month, '2026-06');
  assert.equal(doc.updatedAt, '2026-06-10T08:00:00.000Z');
  assert.equal(doc.rows.length, 1);
  assert.equal(doc.rows[0].workedMinutes, 450);
});

test('hydrateScheduleSnapshot turns docs into a month map with normalized rows', () => {
  const map = hydrateScheduleSnapshot(snapshotFrom([
    { id: '2026-06', data: { month: '2026-06', rows: [ROW], updatedAt: 'ts' } }
  ]));
  assert.equal(map.size, 1);
  const entry = map.get('2026-06');
  assert.equal(entry.month, '2026-06');
  assert.equal(entry.rows[0].agentUsername, 'mpopescu');
  assert.equal(entry.updatedAt, 'ts');
});

test('hydrateScheduleSnapshot tolerates a null snapshot and missing rows', () => {
  assert.equal(hydrateScheduleSnapshot(null).size, 0);
  const map = hydrateScheduleSnapshot(snapshotFrom([{ id: '2026-07', data: {} }]));
  assert.deepEqual(map.get('2026-07'), { month: '2026-07', rows: [], updatedAt: null });
});

test('createScheduleFirestoreStore requires the full adapter', () => {
  assert.throws(
    () => createScheduleFirestoreStore({ db: 'x', firestore: { doc() {} } }),
    /requires Firestore adapter/
  );
});

test('store saves, deletes, loads and subscribes through the injected adapter', async () => {
  const calls = [];
  let capturedNext = null;
  let unsubscribed = false;

  const firestore = {
    collection(db, name) { const ref = { kind: 'collection', db, name }; calls.push(['collection', ref]); return ref; },
    doc(db, name, key) { const ref = { kind: 'doc', db, name, key }; calls.push(['doc', ref]); return ref; },
    async setDoc(ref, data) { calls.push(['setDoc', ref, data]); },
    async deleteDoc(ref) { calls.push(['deleteDoc', ref]); },
    async getDocs(ref) {
      calls.push(['getDocs', ref]);
      return snapshotFrom([{ id: '2026-06', data: { month: '2026-06', rows: [ROW], updatedAt: 'ts' } }]);
    },
    onSnapshot(ref, next) { calls.push(['onSnapshot', ref]); capturedNext = next; return () => { unsubscribed = true; }; }
  };

  const store = createScheduleFirestoreStore({ db: 'fake', firestore, now: () => 'NOW' });

  await store.saveMonth('2026-06', [ROW]);
  assert.equal(calls[0][0], 'doc');
  assert.equal(calls[0][1].name, 'schedules');
  assert.equal(calls[0][1].key, '2026-06');
  assert.equal(calls[1][0], 'setDoc');
  assert.equal(calls[1][2].updatedAt, 'NOW');
  assert.equal(calls[1][2].rows[0].agentUsername, 'mpopescu');

  await store.deleteMonth('2026-06');
  assert.equal(calls[2][0], 'doc');
  assert.equal(calls[3][0], 'deleteDoc');

  const loaded = await store.loadAll();
  assert.equal(loaded.size, 1);
  assert.equal(loaded.dataByMonth.get('2026-06').rows.length, 1);

  let synced = null;
  const unsubscribe = store.subscribe({ onData(payload) { synced = payload; } });
  capturedNext(snapshotFrom([{ id: '2026-07', data: { month: '2026-07', rows: [] } }]));
  unsubscribe();
  assert.equal(calls.at(-1)[0], 'onSnapshot');
  assert.equal(synced.dataByMonth.has('2026-07'), true);
  assert.equal(unsubscribed, true);
});
