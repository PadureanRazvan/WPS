import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannerEditCommand } from '../js/planner-edit-command.js';
import { buildPlannerUndoCommand } from '../js/planner-persistence-command.js';
import { getAgentDaysForMonth } from '../js/config.js';
import { buildChatActionPlan } from '../js/chat-actions.js';

const agent = () => ({ id: 'a', fullName: 'Alice', monthlyDays: { '2026-09': Array(31).fill('') }, monthlyNotes: {} });

// Optimistic transaction adapter: concurrent commits force retries, just as Firestore does.
function database(initial = [agent()]) {
  let state = new Map(initial.map(value => [value.id, structuredClone(value)]));
  let revision = 0;
  let attempts = 0;
  let nextId = 0;
  return {
    read: id => structuredClone(state.get(id)),
    get attempts() { return attempts; },
    firestore: {
      collection: () => 'agents',
      doc: (_db, _collection, id) => id || `created-${++nextId}`,
      async runTransaction(_db, callback) {
        for (let retry = 0; retry < 8; retry++) {
          attempts++;
          const version = revision;
          const pending = [];
          const result = await callback({
            get: async id => ({ exists: () => state.has(id), data: () => structuredClone(state.get(id)) }),
            update: (id, update) => pending.push({ id, update }),
            set: (id, data) => pending.push({ id, data }),
            delete: id => pending.push({ id, remove: true })
          });
          if (version !== revision) continue;
          const next = new Map(state);
          for (const { id, update, remove, data } of pending) {
            if (remove) { next.delete(id); continue; }
            if (data) { next.set(id, structuredClone(data)); continue; }
            const value = structuredClone(next.get(id));
            for (const [path, field] of Object.entries(update)) {
              const keys = path.split('.');
              let target = value;
              for (const key of keys.slice(0, -1)) target = target[key] ??= {};
              target[keys.at(-1)] = structuredClone(field);
            }
            next.set(id, value);
          }
          state = next;
          revision++;
          return result;
        }
        throw new Error('Too many retries');
      }
    }
  };
}

async function storeFor(db) {
  const { createAgentFirestoreStore } = await import('../js/agent-persistence.js');
  return createAgentFirestoreStore({ db: {}, firestore: db.firestore });
}

test('concurrent edits to different days and notes survive transaction retries', async () => {
  const db = database(), store = await storeFor(db), baseline = [agent()];
  const first = buildPlannerEditCommand(baseline, new Set(['a|2026-09|0']), '8RO', 'First');
  const second = buildPlannerEditCommand(baseline, new Set(['a|2026-09|1']), '4IT', 'Second');
  await Promise.all([store.updateMany(first.updates, baseline), store.updateMany(second.updates, baseline)]);
  assert.deepEqual(db.read('a').monthlyDays['2026-09'].slice(0, 2), ['8RO', '4IT']);
  assert.deepEqual(db.read('a').monthlyNotes['2026-09'], { 0: 'First', 1: 'Second' });
  assert.ok(db.attempts > 2, 'must exercise a retry');
});

test('same-cell conflicts reject the whole multi-agent edit', async () => {
  const initial = [agent(), { ...agent(), id: 'b' }];
  const db = database(initial), store = await storeFor(db);
  const first = buildPlannerEditCommand(initial, new Set(['a|2026-09|0']), '8RO');
  const stale = buildPlannerEditCommand(initial, new Set(['a|2026-09|0', 'b|2026-09|1']), 'Co');
  await store.updateMany(first.updates, initial);
  await assert.rejects(store.updateMany(stale.updates, initial), { code: 'data-conflict' });
  assert.equal(db.read('b').monthlyDays['2026-09'][1], '');
});

test('undo restores only its cells and refuses to erase a later edit to the same cell', async () => {
  const db = database(), store = await storeFor(db), baseline = [agent()];
  const edit = buildPlannerEditCommand(baseline, new Set(['a|2026-09|0']), '8RO', 'Mine');
  await store.updateMany(edit.updates, baseline);
  const latest = [db.read('a')];
  await store.updateMany(buildPlannerEditCommand(latest, new Set(['a|2026-09|1']), 'Co', 'Other').updates, latest);
  const undo = buildPlannerUndoCommand(edit.snapshots);
  await store.updateMany(undo.updates, undo.baselines);
  assert.deepEqual(db.read('a').monthlyDays['2026-09'].slice(0, 2), ['', 'Co']);
  assert.deepEqual(db.read('a').monthlyNotes['2026-09'], { 1: 'Other' });
  const next = [db.read('a')];
  await store.updateMany(buildPlannerEditCommand(next, new Set(['a|2026-09|0']), 'CM').updates, next);
  await assert.rejects(store.updateMany(undo.updates, undo.baselines), { code: 'data-conflict' });
});

test('deletion rejects a changed or missing record instead of deleting stale data', async () => {
  const db = database(), store = await storeFor(db), baseline = agent();
  await store.updateMany([{ agentId: 'a', updateData: { fullName: 'Updated Alice' } }], [baseline]);
  await assert.rejects(store.deleteAgent('a', baseline), { code: 'data-conflict' });
  assert.ok(db.read('a'));
  await store.deleteAgent('a', db.read('a'));
  assert.equal(db.read('a'), undefined);
});

test('first edit in a new month preserves all other generated shifts', async () => {
  const initial = { ...agent(), primaryTeam: 'RO zooplus', contractHours: 8 };
  const expected = getAgentDaysForMonth(initial, '2026-10');
  expected[0] = 'Co';
  const db = database([initial]), store = await storeFor(db);
  const command = buildPlannerEditCommand([initial], new Set(['a|2026-10|0']), 'Co');
  await store.updateMany(command.updates, command.baselines);
  assert.deepEqual(db.read('a').monthlyDays['2026-10'], expected);
  assert.deepEqual(db.read('a').monthlyDays['2026-09'], initial.monthlyDays['2026-09']);
});

test('a cell edit does not rewrite unrelated stored days hidden by the hire date', async () => {
  const initial = { ...agent(), hireDate: new Date(2026, 8, 7) };
  initial.monthlyDays['2026-09'][0] = '8RO';
  const db = database([initial]), store = await storeFor(db);
  const command = buildPlannerEditCommand([initial], new Set(['a|2026-09|7']), 'Co');
  await store.updateMany(command.updates, command.baselines);
  assert.equal(db.read('a').monthlyDays['2026-09'][0], '8RO');
  assert.equal(db.read('a').monthlyDays['2026-09'][7], 'Co');
});

test('mixed AI proposals commit atomically, and a stale deletion prevents all writes', async () => {
  const initial = [agent(), { ...agent(), id: 'b', fullName: 'Bob' }];
  const actions = [
    { command: 'SET_CELL', params: ['a', '7', '8RO'] },
    { command: 'DELETE_AGENT', params: ['b'] },
    { command: 'ADD_AGENT', params: ['Cara New', 'cara.new', 'RO zooplus', 'Full-time', '8'] }
  ];
  const plan = buildChatActionPlan(actions, initial, { now: new Date('2026-09-07T10:00:00Z') });
  const db = database(initial), store = await storeFor(db);
  await store.updateMany(plan.updates, plan.baselines, plan);
  assert.equal(db.read('a').monthlyDays['2026-09'][6], '8RO');
  assert.equal(db.read('b'), undefined);
  assert.equal(db.read('created-1').fullName, 'Cara New');

  const staleDb = database(initial), staleStore = await storeFor(staleDb);
  await staleStore.updateMany([{ agentId: 'b', updateData: { fullName: 'Changed Bob' } }], initial);
  await assert.rejects(staleStore.updateMany(plan.updates, plan.baselines, plan), { code: 'data-conflict' });
  assert.equal(staleDb.read('a').monthlyDays['2026-09'][6], '');
  assert.equal(staleDb.read('b').fullName, 'Changed Bob');
  assert.equal(staleDb.read('created-1'), undefined);
});

test('clearing a month refuses changes received since the confirmation snapshot', async () => {
  const db = database(), store = await storeFor(db), initial = [agent()];
  await store.updateMany(buildPlannerEditCommand(initial, new Set(['a|2026-09|0']), '8RO').updates, initial);
  await assert.rejects(store.updateMany([{ agentId: 'a', updateData: { 'monthlyDays.2026-09': Array(31).fill('') } }], initial, { strict: true }), { code: 'data-conflict' });
  assert.equal(db.read('a').monthlyDays['2026-09'][0], '8RO');
});
