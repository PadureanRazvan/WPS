import test from 'node:test';
import assert from 'node:assert/strict';
import * as config from '../js/config.js';
import * as policy from '../js/chat-actions.js';
import { escapeHtml } from '../js/html.js';
import { loadBrowserModule } from './helpers/browser-module.mjs';

class Element {
  children = []; events = {}; style = {}; className = ''; _html = ''; value = '';
  classList = { add() {}, remove() {}, toggle() {} };
  set innerHTML(value) { this._html = value; this.children = []; }
  get innerHTML() { return this._html; }
  set textContent(value) { this._html = escapeHtml(value); }
  get textContent() { return this._html; }
  appendChild(child) { child.parent = this; this.children.push(child); }
  setAttribute() {}
  addEventListener(event, handler) { this.events[event] = handler; }
  querySelector(selector) { return this.children.find(child => '.' + child.className === selector) || null; }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  click() { return this.events.click?.(); }
}

function harness(responses, commit = async () => {}) {
  const input = new Element(), messages = new Element();
  const month = config.getMonthKey(policy.getChatCalendarDate());
  const shell = loadBrowserModule('../../js/chat.js', {
    ...config, ...policy,
    document: { getElementById: id => ({ chatInput: input, chatMessages: messages })[id] || null,
      querySelectorAll: () => [], createElement: () => new Element() },
    localStorage: { getItem: () => 'en' }, window: { setTimeout: () => 0, clearTimeout() {} },
    functions: {}, httpsCallable: () => () => {},
    createSherpaChatService: () => ({ generate: async () => {
      const response = await (typeof responses === 'function' ? responses() : responses.shift());
      return { candidates: [{ content: { parts: Array.isArray(response) ? response : [{ text: response }] } }] };
    } }),
    getChatErrorTranslationKey: () => 'chat-error',
    getPlannerData: () => [{ id: 'a', fullName: 'Alice Example', monthlyDays: { [month]: Array(31).fill('') } }],
    commitAgentChanges: commit, logActivity() {}, showSection() {}, console: { error() {}, warn() {} }
  }, 'globalThis.pending = () => pendingActionPlan; globalThis.resetCooldown = () => { lastSendTime = 0; };');
  return { shell, input, messages, async send(text) { input.value = text; shell.resetCooldown(); await shell.sendMessage(); },
    applyButton() { const card = messages.children.find(child => child.className === 'chat-action-confirmation'); return card?.children.at(-1).children[0]; } };
}

test('an explicit refusal cannot delete; only the current proposal button can authorize writes', async () => {
  let commits = 0;
  const h = harness(['Proposed deletion. [[ACTION:DELETE_AGENT|a]]', 'Cancelled.'], async () => { commits++; });
  await h.send('Delete Alice');
  const staleButton = h.applyButton();
  assert.ok(staleButton);
  assert.equal(commits, 0);
  await h.send('No, do not delete this agent.');
  await staleButton.click();
  assert.equal(commits, 0);
  assert.equal(h.shell.pending(), null);
});

test('Clear and logout invalidate pending proposals and detached confirmation buttons', async () => {
  for (const reset of ['clearChat', 'cleanupChat']) {
    let commits = 0;
    const h = harness(['[[ACTION:DELETE_AGENT|a]]'], async () => { commits++; });
    await h.send('Delete Alice');
    const staleButton = h.applyButton();
    h.shell[reset]();
    await staleButton.click();
    assert.equal(commits, 0);
    assert.equal(h.shell.pending(), null);
  }
});

test('responses arriving after Clear or logout cannot revive proposed writes', async () => {
  for (const reset of ['clearChat', 'cleanupChat']) {
    let resolve;
    const response = new Promise(done => { resolve = done; });
    const h = harness(() => response, () => assert.fail('must not write'));
    const sent = h.send('Delete Alice');
    h.shell[reset]();
    resolve('[[ACTION:DELETE_AGENT|a]]');
    await sent;
    assert.equal(h.shell.pending(), null);
  }
});

test('eleven edits await approval and double clicking Apply commits exactly once', async () => {
  const commits = [];
  const actions = Array.from({ length: 11 }, (_, i) => `[[ACTION:SET_CELL|a|${i + 1}|8RO]]`).join('\n');
  const h = harness([actions], async plan => { commits.push(plan); });
  await h.send('Schedule these days');
  assert.equal(commits.length, 0);
  const button = h.applyButton();
  await Promise.all([button.click(), button.click()]);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].actions.length, 11);
  assert.equal(h.shell.pending(), null);
});

test('failed approved writes show an error without a success response', async () => {
  const h = harness(['[[ACTION:DELETE_AGENT|a]]'], async () => { throw new Error('permission-denied'); });
  await h.send('Delete Alice');
  await h.applyButton().click();
  const html = h.messages.children.map(child => child.innerHTML).join('');
  assert.ok(!html.includes('Changes saved.'));
  assert.match(html, /Changes were not saved/);
});

test('one malformed action rejects the whole response instead of offering a partial change', async () => {
  for (const malformed of ['[[ACTION:DELETE_AGENT]]', '[[ACTION:SET-CELL|a|2|Co]]', '[[ACTION:DELETE_AGENT|a]']) {
    const h = harness([`[[ACTION:SET_CELL|a|1|8RO]] ${malformed}`], () => assert.fail('must not write'));
    await h.send('Change schedules');
    assert.equal(h.shell.pending(), null);
    assert.equal(h.applyButton(), undefined);
    assert.ok(h.messages.children.some(child => child.className === 'chat-msg error'));
  }
});

test('all text parts are validated together before any confirmation is offered', async () => {
  const h = harness([[{ text: '[[ACTION:SET_CELL|a|1|8RO]]' }, { text: '[[ACTION:SET_CELL|a|2|Co]]' }]]);
  await h.send('Change two days');
  assert.equal(h.shell.pending().actions.length, 2);
  const invalid = harness([[{ text: '[[ACTION:SET_CELL|a|1|8RO]]' }, { text: '[[ACTION:DELETE_AGENT]]' }]]);
  await invalid.send('Change two days');
  assert.equal(invalid.shell.pending(), null);
});
