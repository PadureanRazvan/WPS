import test from 'node:test';
import assert from 'node:assert/strict';

const now = new Date('2026-09-07T10:00:00Z');
const agents = [
  { id: 'a', fullName: 'Alice One', username: 'alice.one', contractHours: 8, monthlyDays: { '2026-09': Array(31).fill('') } },
  { id: 'b', fullName: 'Alice Two', username: 'alice.two', contractHours: 8 }
];
const command = (command, ...params) => ({ command, params });
const load = () => import('../js/chat-actions.js');

test('mutations require confirmation, exact IDs and valid complete arguments', async () => {
  const { buildChatActionPlan } = await load();
  for (const id of ['', 'Alice', 'Alice One', 'missing']) {
    assert.throws(() => buildChatActionPlan([command('DELETE_AGENT', id)], agents, { now }));
  }
  for (const day of ['NaN', '1oops', '0', '31', '-1']) {
    assert.throws(() => buildChatActionPlan([command('SET_CELL', 'a', day, '8RO')], agents, { now }));
  }
  const plan = buildChatActionPlan([command('SET_CELL', 'b', '1', '8IT'), command('DELETE_AGENT', 'a')], agents, { now });
  assert.equal(plan.requiresConfirmation, true);
  assert.deepEqual(plan.deletes, ['a']);
  assert.equal(plan.updates[0].agentId, 'b');
});

test('bulk edits are planned together; invalid or excess actions never produce a partial plan', async () => {
  const { buildChatActionPlan } = await load();
  const actions = Array.from({ length: 11 }, (_, i) => command('SET_CELL', 'a', String(i + 1), '8RO'));
  const plan = buildChatActionPlan(actions, agents, { now });
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.updates.length, 1);
  assert.deepEqual(plan.updates[0].updateData['monthlyDays.2026-09'].slice(0, 11), Array(11).fill('8RO'));
  assert.throws(() => buildChatActionPlan([...actions, command('SET_CELL', 'missing', '1', 'Co')], agents, { now }));
  assert.throws(() => buildChatActionPlan(Array(16).fill(actions[0]), agents, { now }));
  assert.throws(() => buildChatActionPlan([actions[0], command('DELETE_AGENT', 'a')], agents, { now }));
});

test('read-only navigation needs no confirmation and the calendar follows Bucharest', async () => {
  const { buildChatActionPlan } = await load();
  const plan = buildChatActionPlan([command('NAVIGATE', 'planner')], agents, { now: new Date('2026-08-31T22:30:00Z') });
  assert.equal(plan.monthKey, '2026-09');
  assert.equal(plan.requiresConfirmation, false);
  assert.deepEqual(plan.updates, []);
});
