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
  return ({ 'prod-selected': 'selected' })[key] || key;
}

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
    searchTerm: '',
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
