import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductivityOverviewView, buildProductivityDetailView } from '../js/productivity-view.js';
import { loadBrowserModule } from './helpers/browser-module.mjs';
import { escapeHtml } from '../js/html.js';

const markup = '<img src=x onerror="alert(1)">';
const attribute = '\" autofocus onfocus=\"alert(1)';

test('Productivity treats stored names, schedules and tooltip values as text', () => {
  const row = {
    name: markup, teamsDisplay: markup, teams: new Map([[attribute, 2]]),
    dayValue: markup, dateLabel: markup, dateKey: '2026-09-07', hasData: true,
    tickets: 2, calls: 0, total: 2, hours: 8, productivity: 0.25
  };
  for (const render of [buildProductivityOverviewView, buildProductivityDetailView]) {
    const { contentHtml } = render({ rows: [row] });
    assert.ok(!contentHtml.includes('<img'), 'stored markup must not become an element');
    assert.ok(!contentHtml.includes('title="" autofocus'), 'stored quotes must not create attributes');
    assert.match(contentHtml, /&lt;img/);
    assert.match(contentHtml, /&quot; autofocus/);
  }
});

test('Users escapes persisted text and attribute values, including custom team options', () => {
  const rows = [];
  const tbody = { innerHTML: '', appendChild: row => rows.push(row) };
  const shell = loadBrowserModule('../../js/users.js', {
    escapeHtml,
    document: {
      getElementById: id => id === 'usersTableBody' ? tbody : null,
      createElement: () => ({ dataset: {}, style: { setProperty() {} }, querySelectorAll: () => [] })
    },
    t: key => key,
    filterUsersDirectory: users => users,
    getComparableUserInlineFieldState: () => ''
  }, 'globalThis.setUsers = value => { usersData = value; };');
  shell.setUsers([{ id: attribute, fullName: markup, username: markup, primaryTeam: attribute, contractHours: attribute }]);
  shell.renderUsersTable();
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].innerHTML.includes('<img'));
  assert.ok(!rows[0].innerHTML.includes('value="" autofocus'));
  assert.ok(!rows[0].innerHTML.includes('data-id="" autofocus'));
  assert.match(rows[0].innerHTML, /&lt;img/);
});
