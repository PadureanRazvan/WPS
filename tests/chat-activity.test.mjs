import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatActivity } from '../js/chat-activity.js';

class Element {
    children = []; dataset = {}; attributes = {}; hidden = false; open = false; textContent = '';
    constructor(tag, document) { this.tagName = tag; this.ownerDocument = document; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes[name] = value; }
    set innerHTML(_) { assert.fail('Activity must use text nodes, never markup injection.'); }
}

function fixture(language = 'en') {
    const document = { createElement: tag => new Element(tag, document) };
    const host = document.createElement('div');
    const activity = createChatActivity({ element: host, getLanguage: () => language });
    const details = host.children[0], summary = details.children[0];
    return { activity, host, details, label: summary.children[1], list: details.children[1],
        setLanguage(value) { language = value; } };
}

test('progress is event-driven and reports real checks before the final response', () => {
    const f = fixture();
    assert.equal(f.host.hidden, true);
    f.activity.begin();
    assert.equal(f.host.hidden, false);
    assert.equal(f.host.dataset.state, 'working');
    assert.equal(f.label.textContent, 'Sending your request');
    f.activity.step('working');
    f.activity.step('tool', 'get_agent_list');
    assert.equal(f.label.textContent, 'Checking team members');
    assert.deepEqual(f.list.children.map(row => row.dataset.state), ['complete', 'complete', 'current']);
    f.activity.finish();
    assert.equal(f.host.dataset.state, 'done');
    assert.equal(f.label.textContent, 'Response ready');
    assert.ok(f.list.children.every(row => row.dataset.state === 'complete'));
});

test('updates preserve the disclosure and only announce the compact current label', () => {
    const f = fixture();
    f.activity.begin();
    f.details.open = true;
    const details = f.details;
    f.activity.step('tool', 'get_agent_schedule');
    f.activity.step('working');
    assert.equal(f.host.children[0], details);
    assert.equal(details.open, true);
    assert.equal(f.label.attributes['aria-live'], 'polite');
    assert.equal(f.label.attributes['aria-atomic'], 'true');
    assert.equal(f.list.attributes['aria-live'], undefined);
});

test('error never claims the failed operation completed or changes were saved', () => {
    const f = fixture();
    f.activity.begin('apply');
    f.activity.finish('error');
    assert.equal(f.host.dataset.state, 'error');
    assert.deepEqual(f.list.children.map(row => row.dataset.state), ['error', 'error']);
    assert.equal(f.label.textContent, 'Could not complete this request');
    assert.ok(f.list.children.every(row => row.textContent !== 'Changes saved'));
    f.activity.step('tool', 'get_agent_list');
    f.activity.finish('done');
    assert.equal(f.host.dataset.state, 'error');
});

test('proposal readiness remains distinct from approved changes actually saved', () => {
    const f = fixture();
    f.activity.begin();
    f.activity.step('review');
    f.activity.finish('review');
    assert.equal(f.label.textContent, 'Changes ready to review');
    assert.equal(f.host.dataset.state, 'review');
    f.activity.begin('apply');
    assert.equal(f.label.textContent, 'Saving approved changes');
    f.activity.finish('done');
    assert.equal(f.label.textContent, 'Changes saved');
});

test('clear invalidates late updates until a new request begins', () => {
    const f = fixture();
    f.activity.begin();
    f.activity.clear();
    f.activity.step('tool', 'get_productivity');
    f.activity.finish();
    assert.equal(f.host.hidden, true);
    assert.equal(f.label.textContent, '');
    assert.equal(f.list.children.length, 0);
    f.activity.begin();
    assert.equal(f.host.hidden, false);
    assert.equal(f.list.children.length, 1);
});

test('an unavailable data check stays a warning while the model can recover', () => {
    const f = fixture();
    f.activity.begin();
    f.activity.step('tool', 'get_agent_schedule');
    f.activity.step('tool-error', 'get_agent_schedule');
    assert.equal(f.label.textContent, 'Could not read this data');
    assert.equal(f.list.children[1].dataset.state, 'warning');
    assert.equal(f.host.dataset.state, 'working');
    f.activity.step('working');
    f.activity.finish();
    assert.equal(f.label.textContent, 'Response ready');
    assert.equal(f.list.children[1].dataset.state, 'warning');
});

test('stopping wait does not claim cancellation of the server operation', () => {
    const f = fixture();
    f.activity.begin();
    f.activity.step('working');
    f.activity.finish('stopped');
    assert.equal(f.host.dataset.state, 'stopped');
    assert.equal(f.label.textContent, 'Stopped waiting for the response');
    assert.equal(f.list.children[1].dataset.state, 'stopped');
    f.activity.finish('done');
    assert.equal(f.label.textContent, 'Stopped waiting for the response');
});

test('activity remains bounded and repeated adjacent statuses do not accumulate', () => {
    const f = fixture();
    f.activity.begin();
    f.activity.step('working');
    f.activity.step('working');
    assert.equal(f.list.children.length, 2);
    for (let index = 0; index < 80; index++) {
        f.activity.step('tool', 'get_day_status');
        f.activity.step('working');
    }
    assert.equal(f.list.children.length, 12);
    assert.equal(f.list.children.at(-1).dataset.state, 'current');
    f.activity.finish();
    assert.equal(f.list.children.length, 12);
});

test('untrusted names are never surfaced and unknown languages fall back safely', () => {
    for (const language of ['xx', '__proto__', 'constructor']) {
        const f = fixture(language);
        f.activity.begin();
        f.activity.step('tool', '<img src=x onerror=alert(1)>');
        assert.equal(f.label.textContent, 'Checking loaded workspace data');
        f.activity.step('__proto__');
        assert.equal(f.label.textContent, 'Checking loaded workspace data');
        f.activity.step('tool', 'constructor');
        assert.equal(f.label.textContent, 'Checking loaded workspace data');
    }
});

test('all supported languages localize activity and update without replacing the disclosure', () => {
    const f = fixture('ro-RO');
    f.activity.begin();
    assert.equal(f.label.textContent, 'Trimit cererea');
    f.activity.step('tool', 'get_productivity');
    assert.equal(f.label.textContent, 'Verific productivitatea');
    f.setLanguage('it');
    f.activity.step('working');
    assert.equal(f.label.textContent, 'In attesa di Sherpa');
    assert.equal(f.list.children[1].textContent, 'Verifica della produttività');
    assert.equal(f.list.attributes['aria-label'], 'Attività');
});

test('missing optional host is harmless for shells without the activity surface', () => {
    const activity = createChatActivity({ element: null });
    activity.begin(); activity.step('tool', 'get_agent_list'); activity.finish(); activity.clear();
});
