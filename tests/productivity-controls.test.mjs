import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadControlsModule() {
  try {
    return await import('../js/productivity-controls.js');
  } catch (error) {
    assert.fail(`productivity-controls.js should be importable: ${error.message}`);
  }
}

function fakeElement(overrides = {}) {
  const listeners = new Map();
  const classChanges = [];
  return {
    value: '',
    classChanges,
    classList: {
      add: className => classChanges.push(['add', className]),
      remove: className => classChanges.push(['remove', className])
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatch(type, event = {}) {
      const handler = listeners.get(type);
      assert.equal(typeof handler, 'function', `expected ${type} listener`);
      return handler(event);
    },
    ...overrides
  };
}

function fakeDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] ?? null;
    }
  };
}

test('productivity controls bind view buttons and agent controls', async () => {
  const { bindProductivityControls } = await loadControlsModule();
  const viewOverview = fakeElement();
  const viewDetail = fakeElement();
  const agentSearch = fakeElement({ value: 'ana' });
  const selectAll = fakeElement();
  const deselectAll = fakeElement();
  const calls = [];

  bindProductivityControls({
    doc: fakeDocument({
      viewOverview,
      viewDetail,
      prodAgentSearch: agentSearch,
      prodSelectAll: selectAll,
      prodDeselectAll: deselectAll
    }),
    setView: view => calls.push(['setView', view]),
    renderAgentChips: search => calls.push(['renderAgentChips', search]),
    selectAllAgents: () => calls.push(['selectAllAgents']),
    deselectAllAgents: () => calls.push(['deselectAllAgents']),
    log: message => calls.push(['log', message])
  });

  viewOverview.dispatch('click');
  viewDetail.dispatch('click');
  agentSearch.dispatch('input');
  selectAll.dispatch('click');
  deselectAll.dispatch('click');

  assert.deepEqual(calls, [
    ['log', '[Productivity] Switching to Sumar view'],
    ['setView', 'overview'],
    ['log', '[Productivity] Switching to Per Agent view'],
    ['setView', 'detail'],
    ['renderAgentChips', 'ana'],
    ['selectAllAgents'],
    ['deselectAllAgents']
  ]);
});

test('productivity controls bind team filter to detail chips and current view refresh', async () => {
  const { bindProductivityControls } = await loadControlsModule();
  const teamFilter = fakeElement({ value: '2L' });
  const calls = [];

  bindProductivityControls({
    doc: fakeDocument({ productivityTeamFilter: teamFilter }),
    getCurrentView: () => 'detail',
    setCurrentTeamFilter: value => calls.push(['setCurrentTeamFilter', value]),
    renderAgentChips: search => calls.push(['renderAgentChips', search]),
    hasAnyData: () => true,
    renderCurrentView: () => calls.push(['renderCurrentView'])
  });

  teamFilter.dispatch('change');

  assert.deepEqual(calls, [
    ['setCurrentTeamFilter', '2L'],
    ['renderAgentChips', undefined],
    ['renderCurrentView']
  ]);
});

test('productivity controls skip detail chip refresh and current view refresh when not needed', async () => {
  const { bindProductivityControls } = await loadControlsModule();
  const teamFilter = fakeElement({ value: 'RO' });
  const calls = [];

  bindProductivityControls({
    doc: fakeDocument({ productivityTeamFilter: teamFilter }),
    getCurrentView: () => 'overview',
    setCurrentTeamFilter: value => calls.push(['setCurrentTeamFilter', value]),
    renderAgentChips: () => calls.push(['renderAgentChips']),
    hasAnyData: () => false,
    renderCurrentView: () => calls.push(['renderCurrentView'])
  });

  teamFilter.dispatch('change');

  assert.deepEqual(calls, [['setCurrentTeamFilter', 'RO']]);
});

test('productivity controls bind refresh button loading and success message', async () => {
  const { bindProductivityControls } = await loadControlsModule();
  const refreshButton = fakeElement();
  const calls = [];

  bindProductivityControls({
    doc: fakeDocument({ productivityRefreshBtn: refreshButton }),
    refreshProductivityData: async () => calls.push(['refreshProductivityData']),
    showTemporaryMessage: (...args) => calls.push(['showTemporaryMessage', ...args])
  });

  await refreshButton.dispatch('click');

  assert.deepEqual(refreshButton.classChanges, [
    ['add', 'is-loading'],
    ['remove', 'is-loading']
  ]);
  assert.deepEqual(calls, [
    ['refreshProductivityData'],
    ['showTemporaryMessage', 'Productivity data refreshed.', 'success', 1500]
  ]);
});

test('productivity control binding tolerates missing controls', async () => {
  const { bindProductivityControls } = await loadControlsModule();

  assert.equal(bindProductivityControls({ doc: fakeDocument({}) }), true);
});
