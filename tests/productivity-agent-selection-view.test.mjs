import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadAgentSelectionViewModule() {
  try {
    return await import('../js/productivity-agent-selection-view.js');
  } catch (error) {
    assert.fail(`productivity-agent-selection-view.js should be importable: ${error.message}`);
  }
}

function t(key) {
  return ({
    'prod-selected': 'selected',
    'prod-no-results': 'No results for the current selection.',
    'prod-search-to-select-agent': 'Search for an agent to show matching results.',
    'prod-keep-typing-agent': 'Type at least 2 characters to search agents.',
    'prod-too-many-agent-matches': 'Showing first 2 matches. Keep typing to narrow results.'
  })[key] || key;
}

test('agent selection view does not render every agent before search starts', async () => {
  const { buildProductivityAgentSelectionView } = await loadAgentSelectionViewModule();

  const view = buildProductivityAgentSelectionView({
    agents: [
      ['ana pop', { fullName: 'Ana Pop', primaryTeam: 'IT zooplus' }],
      ['mihai popescu', { fullName: 'Mihai Popescu', primaryTeam: 'CS bitiba' }]
    ],
    selectedAgents: new Set(),
    searchTerm: '',
    t
  });

  assert.equal(view.visibleAgents.length, 0);
  assert.equal(view.countText, '');
  assert.match(view.html, /Search for an agent to show matching results\./);
  assert.doesNotMatch(view.html, /data-agent-key=/);
  assert.doesNotMatch(view.html, /Ana Pop/);
  assert.doesNotMatch(view.html, /Mihai Popescu/);
});

test('agent selection view waits for a useful search term before rendering matches', async () => {
  const { buildProductivityAgentSelectionView } = await loadAgentSelectionViewModule();

  const view = buildProductivityAgentSelectionView({
    agents: [
      ['ana pop', { fullName: 'Ana Pop', primaryTeam: 'IT zooplus' }]
    ],
    selectedAgents: new Set(),
    searchTerm: 'a',
    minSearchLength: 2,
    t
  });

  assert.equal(view.visibleAgents.length, 0);
  assert.match(view.html, /Type at least 2 characters to search agents\./);
  assert.doesNotMatch(view.html, /data-agent-key=/);
});

test('agent selection view filters agents and marks selected chips', async () => {
  const { buildProductivityAgentSelectionView } = await loadAgentSelectionViewModule();

  const view = buildProductivityAgentSelectionView({
    agents: [
      ['ana pop', { fullName: 'Ana Pop', primaryTeam: 'IT zooplus' }],
      ['mihai popescu', { fullName: 'Mihai Popescu', primaryTeam: 'CS bitiba' }]
    ],
    selectedAgents: new Set(['ana pop']),
    searchTerm: 'ana',
    t
  });

  assert.equal(view.visibleAgents.length, 1);
  assert.equal(view.visibleAgents[0][0], 'ana pop');
  assert.equal(view.countText, '1 selected');
  assert.match(view.html, /data-agent-key="ana pop"/);
  assert.match(view.html, /Ana Pop/);
  assert.match(view.html, />IT<\/span><\/button>/);
  assert.match(view.html, /background: rgba\(99,102,241,0\.25\)/);
  assert.doesNotMatch(view.html, /Mihai Popescu/);
});

test('agent selection view limits broad search results', async () => {
  const { buildProductivityAgentSelectionView } = await loadAgentSelectionViewModule();

  const view = buildProductivityAgentSelectionView({
    agents: [
      ['ana one', { fullName: 'Ana One', primaryTeam: 'IT zooplus' }],
      ['ana two', { fullName: 'Ana Two', primaryTeam: 'IT zooplus' }],
      ['ana three', { fullName: 'Ana Three', primaryTeam: 'IT zooplus' }]
    ],
    selectedAgents: new Set(),
    searchTerm: 'ana',
    resultLimit: 2,
    t
  });

  assert.deepEqual(view.visibleAgents.map(([key]) => key), ['ana one', 'ana two']);
  assert.match(view.html, /Showing first 2 matches\. Keep typing to narrow results\./);
  assert.match(view.html, /Ana One/);
  assert.match(view.html, /Ana Two/);
  assert.doesNotMatch(view.html, /Ana Three/);
});

test('agent selection view shows a no-results message for unmatched searches', async () => {
  const { buildProductivityAgentSelectionView } = await loadAgentSelectionViewModule();

  const view = buildProductivityAgentSelectionView({
    agents: [
      ['ana one', { fullName: 'Ana One', primaryTeam: 'IT zooplus' }]
    ],
    selectedAgents: new Set(),
    searchTerm: 'zz',
    t
  });

  assert.equal(view.visibleAgents.length, 0);
  assert.match(view.html, /No results for the current selection\./);
  assert.doesNotMatch(view.html, /Ana One/);
});

test('agent selection view escapes chip content and clears empty count text', async () => {
  const { buildProductivityAgentSelectionView } = await loadAgentSelectionViewModule();

  const view = buildProductivityAgentSelectionView({
    agents: [
      [
        'o"connor <qa>',
        {
          fullName: 'O"Connor <QA>',
          primaryTeam: 'QA <script>'
        }
      ]
    ],
    selectedAgents: new Set(),
    searchTerm: 'connor',
    t
  });

  assert.equal(view.countText, '');
  assert.match(view.html, /data-agent-key="o&quot;connor &lt;qa&gt;"/);
  assert.match(view.html, /O&quot;Connor &lt;QA&gt;/);
  assert.match(view.html, />QA<\/span><\/button>/);
  assert.doesNotMatch(view.html, /<script>/);
  assert.match(view.html, /background: rgba\(255,255,255,0\.05\)/);
});

test('agent selection reducers toggle, select all visible agents, and clear selection', async () => {
  const {
    toggleProductivityAgentSelection,
    selectAllProductivityAgents,
    clearProductivityAgentSelection
  } = await loadAgentSelectionViewModule();

  const selected = new Set(['ana pop']);
  assert.deepEqual([...toggleProductivityAgentSelection(selected, 'ana pop')], []);
  assert.deepEqual([...toggleProductivityAgentSelection(selected, 'mihai popescu')].sort(), ['ana pop', 'mihai popescu']);

  const allSelected = selectAllProductivityAgents(new Set(['ana pop']), [
    ['mihai popescu', {}],
    ['zoe ivan', {}]
  ]);
  assert.deepEqual([...allSelected].sort(), ['ana pop', 'mihai popescu', 'zoe ivan']);

  assert.equal(clearProductivityAgentSelection().size, 0);
});
