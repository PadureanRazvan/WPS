import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadAgentActionsModule() {
  try {
    return await import('../js/productivity-agent-actions.js');
  } catch (error) {
    assert.fail(`productivity-agent-actions.js should be importable: ${error.message}`);
  }
}

function fakeElement(overrides = {}) {
  const listeners = new Map();
  return {
    dataset: {},
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatch(type, event = {}) {
      const handler = listeners.get(type);
      assert.equal(typeof handler, 'function', `expected ${type} listener`);
      return handler(event);
    },
    querySelectorAll() {
      return [];
    },
    ...overrides
  };
}

test('agent actions toggle one agent and refresh the view', async () => {
  const { createProductivityAgentActions } = await loadAgentActionsModule();
  let selectedAgents = new Set(['ana pop']);
  const calls = [];

  const actions = createProductivityAgentActions({
    getSelectedAgents: () => selectedAgents,
    setSelectedAgents: value => {
      selectedAgents = value;
      calls.push(['setSelectedAgents', [...value].sort()]);
    },
    toggleSelection: (selection, agentKey) => {
      const next = new Set(selection);
      next.has(agentKey) ? next.delete(agentKey) : next.add(agentKey);
      return next;
    },
    renderAgentChips: searchTerm => calls.push(['renderAgentChips', searchTerm]),
    renderCurrentView: () => calls.push(['renderCurrentView'])
  });

  actions.toggleAgent('mihai popescu');

  assert.deepEqual([...selectedAgents].sort(), ['ana pop', 'mihai popescu']);
  assert.deepEqual(calls, [
    ['setSelectedAgents', ['ana pop', 'mihai popescu']],
    ['renderAgentChips', undefined],
    ['renderCurrentView']
  ]);
});

test('agent actions select all filtered agents using the current search term', async () => {
  const { createProductivityAgentActions } = await loadAgentActionsModule();
  let selectedAgents = new Set(['ana pop']);
  const calls = [];
  const filteredCalls = [];

  const actions = createProductivityAgentActions({
    getSelectedAgents: () => selectedAgents,
    setSelectedAgents: value => {
      selectedAgents = value;
      calls.push(['setSelectedAgents', [...value].sort()]);
    },
    getFilteredAgents: searchTerm => {
      filteredCalls.push(searchTerm);
      return searchTerm === 'mi'
        ? [['mihai popescu', {}]]
        : [
            ['mihai popescu', {}],
            ['zoe ivan', {}]
          ];
    },
    selectAllSelection: (selection, agents) => {
      const next = new Set(selection);
      agents.forEach(([agentKey]) => next.add(agentKey));
      return next;
    },
    getAgentSearchTerm: () => 'mi',
    renderAgentChips: searchTerm => calls.push(['renderAgentChips', searchTerm]),
    renderCurrentView: () => calls.push(['renderCurrentView'])
  });

  actions.selectAllAgents();

  assert.deepEqual(filteredCalls, ['mi']);
  assert.deepEqual([...selectedAgents].sort(), ['ana pop', 'mihai popescu']);
  assert.deepEqual(calls, [
    ['setSelectedAgents', ['ana pop', 'mihai popescu']],
    ['renderAgentChips', 'mi'],
    ['renderCurrentView']
  ]);
});

test('agent actions deselect all agents using the current search term', async () => {
  const { createProductivityAgentActions } = await loadAgentActionsModule();
  let selectedAgents = new Set(['ana pop']);
  const calls = [];

  const actions = createProductivityAgentActions({
    getSelectedAgents: () => selectedAgents,
    setSelectedAgents: value => {
      selectedAgents = value;
      calls.push(['setSelectedAgents', value.size]);
    },
    clearSelection: () => new Set(),
    getAgentSearchTerm: () => 'ana',
    renderAgentChips: searchTerm => calls.push(['renderAgentChips', searchTerm]),
    renderCurrentView: () => calls.push(['renderCurrentView'])
  });

  actions.deselectAllAgents();

  assert.equal(selectedAgents.size, 0);
  assert.deepEqual(calls, [
    ['setSelectedAgents', 0],
    ['renderAgentChips', 'ana'],
    ['renderCurrentView']
  ]);
});

test('agent action binding connects rendered chips to toggle actions', async () => {
  const { bindProductivityAgentActions } = await loadAgentActionsModule();
  const firstChip = fakeElement({ dataset: { agentKey: 'ana pop' } });
  const secondChip = fakeElement({ dataset: { agentKey: 'mihai popescu' } });
  const calls = [];

  bindProductivityAgentActions({
    container: fakeElement({
      querySelectorAll(selector) {
        assert.equal(selector, '[data-agent-key]');
        return [firstChip, secondChip];
      }
    }),
    toggleAgent: agentKey => calls.push(['toggleAgent', agentKey])
  });

  firstChip.dispatch('click');
  secondChip.dispatch('click');

  assert.deepEqual(calls, [
    ['toggleAgent', 'ana pop'],
    ['toggleAgent', 'mihai popescu']
  ]);
});

test('agent action binding is a no-op when the container is missing', async () => {
  const { bindProductivityAgentActions } = await loadAgentActionsModule();

  assert.equal(bindProductivityAgentActions({ container: null }), false);
});
