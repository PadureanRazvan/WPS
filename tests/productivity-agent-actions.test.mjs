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

test('agent actions submit a search, commit one agent, and render detail once', async () => {
  const { createProductivityAgentActions } = await loadAgentActionsModule();
  let selectedAgents = new Set();
  let committed = false;
  const calls = [];

  const actions = createProductivityAgentActions({
    setSelectedAgents: value => {
      selectedAgents = value;
      calls.push(['setSelectedAgents', [...value].sort()]);
    },
    setDetailSearchCommitted: value => {
      committed = value;
      calls.push(['setDetailSearchCommitted', value]);
    },
    getSearchResults: searchTerm => {
      calls.push(['getSearchResults', searchTerm]);
      return [
        ['ana pop', { fullName: 'Ana Pop' }],
        ['ana maria', { fullName: 'Ana Maria' }]
      ];
    },
    setAgentSearchTerm: value => calls.push(['setAgentSearchTerm', value]),
    renderAgentSearchResults: searchTerm => calls.push(['renderAgentSearchResults', searchTerm]),
    renderCurrentView: () => calls.push(['renderCurrentView'])
  });

  const submitted = actions.submitAgentSearch('ana');

  assert.equal(submitted, true);
  assert.equal(committed, true);
  assert.deepEqual([...selectedAgents], ['ana pop']);
  assert.deepEqual(calls, [
    ['getSearchResults', 'ana'],
    ['setSelectedAgents', ['ana pop']],
    ['setDetailSearchCommitted', true],
    ['setAgentSearchTerm', 'Ana Pop'],
    ['renderAgentSearchResults', 'Ana Pop'],
    ['renderCurrentView']
  ]);
});

test('agent actions reject unmatched searches without rendering the detail table', async () => {
  const { createProductivityAgentActions } = await loadAgentActionsModule();
  let selectedAgents = new Set(['ana pop']);
  let committed = true;
  const calls = [];

  const actions = createProductivityAgentActions({
    setSelectedAgents: value => {
      selectedAgents = value;
      calls.push(['setSelectedAgents', value.size]);
    },
    setDetailSearchCommitted: value => {
      committed = value;
      calls.push(['setDetailSearchCommitted', value]);
    },
    getSearchResults: () => [],
    renderAgentSearchResults: searchTerm => calls.push(['renderAgentSearchResults', searchTerm]),
    renderCurrentView: () => calls.push(['renderCurrentView']),
    showTemporaryMessage: (...args) => calls.push(['showTemporaryMessage', ...args]),
    noResultMessage: 'No matching agent.'
  });

  const submitted = actions.submitAgentSearch('zz');

  assert.equal(submitted, false);
  assert.equal(committed, false);
  assert.equal(selectedAgents.size, 0);
  assert.deepEqual(calls, [
    ['setSelectedAgents', 0],
    ['setDetailSearchCommitted', false],
    ['renderAgentSearchResults', 'zz'],
    ['showTemporaryMessage', 'No matching agent.', 'error', 1800]
  ]);
});

test('agent actions use a chosen suggestion to fill the search without rendering detail', async () => {
  const { createProductivityAgentActions } = await loadAgentActionsModule();
  const calls = [];

  const actions = createProductivityAgentActions({
    getVisibleAgents: () => [
      ['ana pop', { fullName: 'Ana Pop' }]
    ],
    setAgentSearchTerm: value => calls.push(['setAgentSearchTerm', value]),
    setDetailSearchCommitted: value => calls.push(['setDetailSearchCommitted', value]),
    renderAgentSearchResults: searchTerm => calls.push(['renderAgentSearchResults', searchTerm]),
    renderCurrentView: () => calls.push(['renderCurrentView'])
  });

  const chosen = actions.chooseAgentSuggestion('ana pop');

  assert.equal(chosen, true);
  assert.deepEqual(calls, [
    ['setAgentSearchTerm', 'Ana Pop'],
    ['setDetailSearchCommitted', false],
    ['renderAgentSearchResults', 'Ana Pop']
  ]);
});

test('agent actions resolve exact matches before falling back to the first result', async () => {
  const { resolveProductivityAgentSearch } = await loadAgentActionsModule();

  const agents = [
    ['ana one', { fullName: 'Ana One' }],
    ['ana pop', { fullName: 'Ana Pop' }]
  ];

  assert.deepEqual(resolveProductivityAgentSearch(agents, 'Ana Pop'), ['ana pop', { fullName: 'Ana Pop' }]);
  assert.deepEqual(resolveProductivityAgentSearch(agents, 'ana'), ['ana one', { fullName: 'Ana One' }]);
  assert.equal(resolveProductivityAgentSearch([], 'ana'), null);
});

test('agent action binding connects rendered suggestions to choose actions', async () => {
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
    chooseAgentSuggestion: agentKey => calls.push(['chooseAgentSuggestion', agentKey])
  });

  firstChip.dispatch('click');
  secondChip.dispatch('click');

  assert.deepEqual(calls, [
    ['chooseAgentSuggestion', 'ana pop'],
    ['chooseAgentSuggestion', 'mihai popescu']
  ]);
});

test('agent action binding is a no-op when the container is missing', async () => {
  const { bindProductivityAgentActions } = await loadAgentActionsModule();

  assert.equal(bindProductivityAgentActions({ container: null }), false);
});
