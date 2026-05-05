import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlannerTableHtml,
  renderPlannerTableView
} from '../js/planner-table-view.js';

function makeReadModel(overrides = {}) {
  return {
    fewDaysView: true,
    headers: [
      {
        type: 'day',
        dayName: 'Fri',
        dayNumber: 1,
        classNames: ['date-header', 'today']
      },
      {
        type: 'week-total',
        classNames: ['week-total-header', 'date-header']
      },
      {
        type: 'day',
        dayName: 'Sat',
        dayNumber: 2,
        classNames: ['date-header', 'weekend']
      }
    ],
    rows: [
      {
        agentId: 'agent-1',
        agentName: 'Ada Planner',
        contractHoursLabel: '8h',
        deleteMonthKey: '2026-05',
        totalHoursLabel: '12.5h',
        cells: [
          {
            type: 'day',
            agentId: 'agent-1',
            monthKey: '2026-05',
            dayIndex: 0,
            rawValue: '4RO+4.5QA',
            displayLines: ['4RO', '4.5QA'],
            classNames: ['day-cell', 'working', 'multi-team', 'today'],
            sizeClass: 'medium-text',
            title: 'Split shift'
          },
          {
            type: 'week-total',
            totalHoursLabel: '8.5h',
            classNames: ['week-total-cell']
          },
          {
            type: 'day',
            agentId: 'agent-1',
            monthKey: '2026-05',
            dayIndex: 1,
            rawValue: '',
            displayLines: [],
            classNames: ['day-cell', 'empty', 'weekend'],
            sizeClass: '',
            title: ''
          }
        ]
      }
    ],
    ...overrides
  };
}

test('buildPlannerTableHtml renders Planner Read Model headers, rows, cells, totals, and delete metadata', () => {
  const html = buildPlannerTableHtml(makeReadModel(), {
    agent: 'Agent',
    hours: 'Hours',
    total: 'Total',
    weekTotal: 'Week total',
    delete: 'Delete'
  });

  assert.match(html, /<table class="unified-planner-table">/);
  assert.match(html, /<tbody id="plannerTableBody">/);
  assert.match(html, /<th class="agent-name-header">Agent<\/th>/);
  assert.match(html, /<th class="hours-header">Hours<\/th>/);
  assert.match(html, /<th class="date-header today">Fri<br>1<\/th>/);
  assert.match(html, /<th class="week-total-header date-header">Week total<\/th>/);
  assert.match(html, /<th class="date-header weekend">Sat<br>2<\/th>/);
  assert.match(html, /<th class="total-header">Total<\/th>/);
  assert.match(html, /<td class="agent-name" title="Ada Planner">/);
  assert.match(html, /<span>Ada Planner<\/span>/);
  assert.match(html, /class="delete-agent-btn" data-agent-id="agent-1" data-month-key="2026-05" title="Delete"/);
  assert.match(html, /<td class="agent-hours">8h<\/td>/);
  assert.match(html, /class="planner-cell selectable day-cell working multi-team today medium-text has-note"/);
  assert.match(html, /data-agent-id="agent-1" data-day="0" data-month="2026-05" data-raw-value="4RO\+4\.5QA" title="Split shift"/);
  assert.match(html, />4RO<br>4\.5QA<\/td>/);
  assert.match(html, /<td class="week-total-cell">8\.5h<\/td>/);
  assert.match(html, /class="planner-cell selectable day-cell empty weekend"/);
  assert.match(html, /<td class="agent-total">12\.5h<\/td>/);
});

test('buildPlannerTableHtml escapes dynamic text and attributes before rendering markup', () => {
  const html = buildPlannerTableHtml(makeReadModel({
    headers: [
      {
        type: 'day',
        dayName: '<Fri>',
        dayNumber: '1&2',
        classNames: ['date-header']
      }
    ],
    rows: [
      {
        agentId: 'agent-&quot;',
        agentName: '<Ada "Planner">',
        contractHoursLabel: '8<h>',
        deleteMonthKey: '2026-05"&',
        totalHoursLabel: '8&h',
        cells: [
          {
            type: 'day',
            agentId: 'agent-&quot;',
            monthKey: '2026-05"&',
            dayIndex: 0,
            rawValue: '4<RO>',
            displayLines: ['4<RO>', '4&QA'],
            classNames: ['day-cell', 'working'],
            sizeClass: '',
            title: 'Note "quoted" & safe'
          }
        ]
      }
    ]
  }), {
    agent: '<Agent>',
    hours: 'Hours & more',
    total: 'Total "all"',
    weekTotal: 'Week',
    delete: 'Delete "agent"'
  });

  assert.match(html, /&lt;Agent&gt;/);
  assert.match(html, /Hours &amp; more/);
  assert.match(html, /&lt;Fri&gt;<br>1&amp;2/);
  assert.match(html, /title="&lt;Ada &quot;Planner&quot;&gt;"/);
  assert.match(html, /<span>&lt;Ada &quot;Planner&quot;&gt;<\/span>/);
  assert.match(html, /data-agent-id="agent-&amp;quot;"/);
  assert.match(html, /data-month-key="2026-05&quot;&amp;"/);
  assert.match(html, /title="Delete &quot;agent&quot;"/);
  assert.match(html, /data-raw-value="4&lt;RO&gt;"/);
  assert.match(html, /title="Note &quot;quoted&quot; &amp; safe"/);
  assert.match(html, />4&lt;RO&gt;<br>4&amp;QA<\/td>/);
  assert.doesNotMatch(html, /<Ada "Planner">/);
  assert.doesNotMatch(html, /4<RO>/);
});

test('renderPlannerTableView toggles few-days class and replaces container content', () => {
  const toggles = [];
  const container = {
    innerHTML: 'old table',
    classList: {
      toggle(className, enabled) {
        toggles.push([className, enabled]);
      }
    }
  };

  renderPlannerTableView(container, makeReadModel({ fewDaysView: false }), {
    agent: 'Agent',
    hours: 'Hours',
    total: 'Total',
    weekTotal: 'Week total',
    delete: 'Delete'
  });

  assert.deepEqual(toggles, [['few-days-view', false]]);
  assert.match(container.innerHTML, /<table class="unified-planner-table">/);
  assert.notEqual(container.innerHTML, 'old table');
});
