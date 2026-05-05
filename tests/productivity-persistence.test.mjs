import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadPersistenceModule() {
  try {
    return await import('../js/productivity-persistence.js');
  } catch (error) {
    assert.fail(`productivity-persistence.js should be importable: ${error.message}`);
  }
}

function agentEntry(originalName, totals, teams) {
  return {
    originalName,
    ...totals,
    teams: new Map(Object.entries(teams))
  };
}

function snapshotFrom(docs) {
  return {
    size: docs.length,
    forEach(callback) {
      docs.forEach(({ id, data }) => {
        callback({ id, data: () => data });
      });
    }
  };
}

test('persistence serializes productivity entries for Firestore documents', async () => {
  const { buildProductivityDateDocument } = await loadPersistenceModule();

  const document = buildProductivityDateDocument({
    ticketsData: new Map([
      ['ana pop', agentEntry('Ana Pop', { tickets: 6 }, { IT: 4, CS: 2 })]
    ]),
    callsData: null
  }, {
    now: () => '2026-05-05T10:00:00.000Z'
  });

  assert.deepEqual(document, {
    ticketsData: {
      'ana pop': {
        originalName: 'Ana Pop',
        tickets: 6,
        teams: { IT: 4, CS: 2 }
      }
    },
    callsData: null,
    updatedAt: '2026-05-05T10:00:00.000Z'
  });
});

test('persistence hydrates Firestore snapshots into date maps', async () => {
  const { hydrateProductivitySnapshot } = await loadPersistenceModule();

  const dataByDate = hydrateProductivitySnapshot(snapshotFrom([
    {
      id: '2026-05-04',
      data: {
        ticketsData: {
          'ana pop': {
            originalName: 'Ana Pop',
            tickets: 6,
            teams: { IT: 4, CS: 2 }
          }
        },
        callsData: {
          'mihai popescu': {
            originalName: 'Mihai Popescu',
            calls: 3,
            teams: { HU: 3 }
          }
        }
      }
    }
  ]));

  assert.equal(dataByDate.size, 1);
  const entry = dataByDate.get('2026-05-04');
  assert.equal(entry.ticketsData.get('ana pop').teams.get('CS'), 2);
  assert.equal(entry.callsData.get('mihai popescu').calls, 3);
});

test('persistence store writes, deletes, loads, and subscribes through the provided Firestore adapter', async () => {
  const { createProductivityFirestoreStore } = await loadPersistenceModule();
  const calls = [];
  let capturedNext = null;
  let unsubscribeCalled = false;

  const firestore = {
    collection(db, collectionName) {
      const ref = { kind: 'collection', db, collectionName };
      calls.push(['collection', ref]);
      return ref;
    },
    doc(db, collectionName, dateKey) {
      const ref = { kind: 'doc', db, collectionName, dateKey };
      calls.push(['doc', ref]);
      return ref;
    },
    async setDoc(ref, data) {
      calls.push(['setDoc', ref, data]);
    },
    async deleteDoc(ref) {
      calls.push(['deleteDoc', ref]);
    },
    async getDocs(ref) {
      calls.push(['getDocs', ref]);
      return snapshotFrom([
        {
          id: '2026-05-05',
          data: {
            ticketsData: null,
            callsData: {
              'ana pop': {
                originalName: 'Ana Pop',
                calls: 2,
                teams: { IT: 2 }
              }
            }
          }
        }
      ]);
    },
    onSnapshot(ref, next) {
      calls.push(['onSnapshot', ref]);
      capturedNext = next;
      return () => { unsubscribeCalled = true; };
    }
  };

  const store = createProductivityFirestoreStore({
    db: 'fake-db',
    firestore,
    now: () => '2026-05-05T10:00:00.000Z'
  });

  await store.saveDate('2026-05-04', {
    ticketsData: new Map([
      ['ana pop', agentEntry('Ana Pop', { tickets: 6 }, { IT: 6 })]
    ]),
    callsData: null
  });
  await store.deleteDate('2026-05-04');
  const loaded = await store.loadAll();

  assert.equal(calls[0][0], 'doc');
  assert.deepEqual(calls[0][1], {
    kind: 'doc',
    db: 'fake-db',
    collectionName: 'productivity',
    dateKey: '2026-05-04'
  });
  assert.equal(calls[1][0], 'setDoc');
  assert.equal(calls[2][0], 'doc');
  assert.equal(calls[3][0], 'deleteDoc');
  assert.equal(calls[4][0], 'collection');
  assert.equal(calls[5][0], 'getDocs');
  assert.equal(loaded.size, 1);
  assert.equal(loaded.dataByDate.get('2026-05-05').callsData.get('ana pop').calls, 2);

  let synced = null;
  const unsubscribe = store.subscribe({
    onData(payload) {
      synced = payload;
    }
  });
  capturedNext(snapshotFrom([
    {
      id: '2026-05-06',
      data: {
        ticketsData: null,
        callsData: null
      }
    }
  ]));
  unsubscribe();

  assert.equal(calls.at(-1)[0], 'onSnapshot');
  assert.equal(synced.size, 1);
  assert.equal(synced.dataByDate.has('2026-05-06'), true);
  assert.equal(unsubscribeCalled, true);
});
