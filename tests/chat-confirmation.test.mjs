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
  const controls = Object.fromEntries(['chatSendBtn', 'chatStopBtn', 'chatClearBtn', 'chatJumpBtn'].map(id => [id, new Element()]));
  const activities = [], reads = [];
  const activityMock = Object.fromEntries(['begin', 'step', 'finish', 'clear'].map(method => [method, (...args) => activities.push([method, ...args])]));
  messages.scrollTop = 0;
  messages.scrollHeight = 800;
  const month = config.getMonthKey(policy.getChatCalendarDate());
  const shell = loadBrowserModule('../../js/chat.js', {
    ...config, ...policy,
    document: { getElementById: id => ({ chatInput: input, chatMessages: messages, ...controls })[id] || null,
      querySelectorAll: () => [], createElement: () => new Element() },
    localStorage: { getItem: () => 'en' }, window: { setTimeout: () => 0, clearTimeout() {} },
    functions: {}, httpsCallable: () => () => {},
    createSherpaChatService: () => ({ generate: async () => {
      const response = await (typeof responses === 'function' ? responses() : responses.shift());
      return { candidates: [{ content: { parts: Array.isArray(response) ? response : [{ text: response }] } }] };
    } }),
    getChatErrorTranslationKey: () => 'chat-error',
    getPlannerData: () => { reads.push('planner'); return [{ id: 'a', fullName: 'Alice Example', monthlyDays: { [month]: Array(31).fill('') } }]; },
    activityMock,
    commitAgentChanges: commit, logActivity() {}, showSection() {}, console: { error() {}, warn() {} }
  }, `globalThis.pending = () => pendingActionPlan;
      globalThis.resetCooldown = () => { lastSendTime = 0; };
      globalThis.setFollowLatest = value => { followLatest = value; };
      globalThis.chatState = () => ({ isLoading, isCommitting, chatSession, history: chatHistory });
      chatActivity = activityMock;`);
  return { shell, input, messages, controls, activities, reads, async send(text) { input.value = text; shell.resetCooldown(); await shell.sendMessage(); },
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

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('Stop ignores a delayed tool call without reading data or starting another AI round', async () => {
  const response = deferred();
  let calls = 0;
  const h = harness(() => { calls++; return response.promise; }, () => assert.fail('must not write'));
  const sent = h.send('Read the team and propose changes');
  assert.equal(h.shell.chatState().isLoading, true);
  h.shell.stopChatRequest();
  assert.equal(h.shell.chatState().isLoading, false);
  response.resolve([{ functionCall: { name: 'get_agent_list', args: {} } }]);
  await sent;
  assert.equal(calls, 1);
  assert.equal(h.reads.length, 0);
  assert.equal(h.shell.pending(), null);
  assert.equal(h.activities.filter(event => event[0] === 'finish').length, 1);
  assert.deepEqual(h.activities.at(-1), ['finish', 'stopped']);
  assert.ok(h.activities.every(event => event[1] !== 'tool'));
  assert.ok(h.messages.children.every(child => child.className !== 'chat-msg error'));
});

test('a stopped request finishing late cannot replace or unlock the newer pending request', async () => {
  const oldResponse = deferred(), newResponse = deferred();
  let calls = 0;
  const h = harness(() => (++calls === 1 ? oldResponse.promise : newResponse.promise));
  const oldSend = h.send('Old request');
  h.shell.stopChatRequest();
  const newSend = h.send('New request');
  const activityCount = h.activities.length;
  const session = h.shell.chatState().chatSession;
  oldResponse.resolve('Old answer. [[ACTION:DELETE_AGENT|a]]');
  await oldSend;
  assert.equal(h.shell.chatState().isLoading, true);
  assert.equal(h.shell.chatState().chatSession, session);
  assert.equal(h.activities.length, activityCount);
  assert.equal(h.controls.chatSendBtn.disabled, true);
  assert.equal(h.shell.pending(), null);
  assert.ok(h.shell.chatState().history.every(message => !message.text.includes('Old answer')));
  newResponse.resolve('New answer.');
  await newSend;
  assert.equal(calls, 2);
  assert.equal(h.shell.chatState().isLoading, false);
  assert.equal(h.shell.chatState().history.at(-1).text, 'New answer.');
  assert.deepEqual(h.activities.at(-1), ['finish', 'done']);
});

test('Clear and Stop cannot hide or interrupt an approved commit awaiting acknowledgement', async () => {
  const committed = deferred();
  let commits = 0;
  const h = harness(['[[ACTION:DELETE_AGENT|a]]'], () => { commits++; return committed.promise; });
  await h.send('Delete Alice');
  const applying = h.applyButton().click();
  const before = h.shell.chatState();
  const activityCount = h.activities.length;
  assert.equal(before.isCommitting, true);
  assert.equal(h.controls.chatClearBtn.disabled, true);
  assert.equal(h.controls.chatStopBtn.hidden, true);
  h.shell.clearChat();
  h.shell.stopChatRequest();
  assert.equal(h.shell.chatState().isCommitting, true);
  assert.equal(h.shell.chatState().isLoading, true);
  assert.equal(h.shell.chatState().chatSession, before.chatSession);
  assert.equal(h.activities.length, activityCount);
  assert.equal(commits, 1);
  assert.ok(h.shell.chatState().history.every(message => message.text !== config.translations.en['chat-changes-applied']));
  committed.resolve();
  await applying;
  assert.equal(h.shell.chatState().isCommitting, false);
  assert.equal(h.shell.chatState().isLoading, false);
  assert.equal(h.controls.chatClearBtn.disabled, false);
  assert.equal(h.shell.chatState().history.at(-1).text, config.translations.en['chat-changes-applied']);
  assert.deepEqual(h.activities.at(-1), ['finish', 'done']);
  h.shell.clearChat();
  assert.equal(h.shell.chatState().history.length, 1);
  assert.deepEqual(h.activities.at(-1), ['clear']);
});

test('incoming replies append nodes and preserve the reading position until Latest is requested', async () => {
  const response = deferred();
  let calls = 0;
  const h = harness(() => (++calls === 1 ? 'First answer.' : response.promise));
  await h.send('First question');
  const firstNodes = [...h.messages.children];
  const sent = h.send('Second question');
  h.shell.setFollowLatest(false);
  h.messages.scrollTop = 42;
  response.resolve('Second answer.');
  await sent;
  assert.equal(h.messages.children.length, 4);
  assert.equal(h.messages.children[0], firstNodes[0]);
  assert.equal(h.messages.children[1], firstNodes[1]);
  assert.equal(h.messages.scrollTop, 42);
  assert.equal(h.controls.chatJumpBtn.hidden, false);
  const allNodes = [...h.messages.children];
  h.shell.renderMessages();
  assert.deepEqual(h.messages.children, allNodes);
  assert.equal(h.messages.scrollTop, 42);
  h.shell.scrollToLatest();
  assert.equal(h.messages.scrollTop, h.messages.scrollHeight);
  assert.equal(h.controls.chatJumpBtn.hidden, true);
});
