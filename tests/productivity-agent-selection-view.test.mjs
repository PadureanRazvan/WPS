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
    'prod-agent-selected': '1 agent selected',
    'prod-no-results': 'No results for the current selection.',
    'prod-search-to-select-agent': 'Start typing an agent name.',
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
  assert.equal(view.statusText, 'Start typing an agent name.');
  assert.equal(view.resultsMetaText, '');
  assert.equal(view.shouldOpen, false);
  assert.equal(view.html, '');
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
  assert.equal(view.statusText, 'Type at least 2 characters to search agents.');
  assert.equal(view.shouldOpen, false);
  assert.equal(view.html, '');
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
  assert.equal(view.countText, '1 agent selected');
  assert.equal(view.shouldOpen, true);
  assert.match(view.html, /data-agent-key="ana pop"/);
  assert.match(view.html, /role="option"/);
  assert.match(view.html, /aria-selected="true"/);
  assert.match(view.html, /aria-posinset="1"/);
  assert.match(view.html, /aria-setsize="1"/);
  assert.match(view.html, /class="productivity-agent-option is-selected"/);
  assert.match(view.html, /class="productivity-agent-option__identity"/);
  assert.match(view.html, /class="productivity-agent-option__team">IT/);
  assert.match(view.html, /Ana Pop/);
  assert.doesNotMatch(view.html, /style=/);
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
  assert.equal(view.resultsMetaText, 'Showing first 2 matches. Keep typing to narrow results.');
  assert.equal(view.statusText, '');
  assert.match(view.html, /aria-setsize="3"/);
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
  assert.equal(view.statusText, 'No results for the current selection.');
  assert.equal(view.shouldOpen, false);
  assert.equal(view.html, '');
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
  assert.match(view.html, /class="productivity-agent-option__team">QA/);
  assert.doesNotMatch(view.html, /<script>/);
  assert.doesNotMatch(view.html, /style=/);
});

test('agent selection search ignores accents and matches team labels', async () => {
  const { filterProductivityAgentSelection } = await loadAgentSelectionViewModule();
  const agents = [
    ['teodora horja', { fullName: 'Teodóra Horja', primaryTeam: 'HU zooplus' }],
    ['ana pop', { fullName: 'Ana Pop', primaryTeam: 'IT zooplus' }]
  ];

  assert.deepEqual(filterProductivityAgentSelection(agents, 'teodora').map(([key]) => key), ['teodora horja']);
  assert.deepEqual(filterProductivityAgentSelection(agents, 'hu zoo').map(([key]) => key), ['teodora horja']);
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
