import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadComboboxModule() {
  try {
    return await import('../js/productivity-agent-combobox.js');
  } catch (error) {
    assert.fail(`productivity-agent-combobox.js should be importable: ${error.message}`);
  }
}

function fakeClassList() {
  const values = new Set();
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    toggle(value, force) {
      if (force === true) values.add(value);
      else if (force === false) values.delete(value);
      else if (values.has(value)) values.delete(value);
      else values.add(value);
    },
    contains: value => values.has(value)
  };
}

function fakeEventTarget(overrides = {}) {
  const listeners = new Map();
  const attributes = new Map();
  return {
    dataset: {},
    style: { setProperty() {} },
    classList: fakeClassList(),
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type, event = {}) {
      [...(listeners.get(type) || [])].forEach(handler => handler(event));
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    ...overrides
  };
}

function createNativePopover() {
  let open = false;
  const popover = fakeEventTarget({
    scrollHeight: 240,
    matches(selector) {
      if (selector !== ':popover-open') throw new Error('unexpected selector');
      return open;
    },
    showPopover() {
      open = true;
      popover.dispatch('toggle');
    },
    hidePopover() {
      open = false;
      popover.dispatch('toggle');
    },
    getBoundingClientRect() {
      return { height: 240 };
    }
  });
  return popover;
}

test('agent combobox exposes active options and commits them with Enter', async () => {
  const { bindProductivityAgentCombobox } = await loadComboboxModule();
  const first = fakeEventTarget({ id: 'prod-agent-option-0', scrollIntoView() {} });
  const second = fakeEventTarget({ id: 'prod-agent-option-1', scrollIntoView() {} });
  const input = fakeEventTarget({ value: 'ana' });
  const submitButton = fakeEventTarget();
  const popover = createNativePopover();
  const listbox = fakeEventTarget({ querySelectorAll: () => [first, second] });
  const anchorElement = fakeEventTarget({
    getBoundingClientRect: () => ({ left: 40, top: 80, bottom: 126, width: 420 })
  });
  const windowRef = fakeEventTarget({ innerWidth: 800, innerHeight: 600 });
  const agents = [
    ['ana pop', { fullName: 'Ana Pop' }],
    ['ana maria', { fullName: 'Ana Maria' }]
  ];
  const calls = [];
  const controller = bindProductivityAgentCombobox({
    input,
    submitButton,
    popover,
    listbox,
    anchorElement,
    windowRef,
    getVisibleAgents: () => agents,
    chooseAgentSuggestion: key => {
      calls.push(['chooseAgentSuggestion', key]);
      return true;
    },
    submitAgentSearch: value => calls.push(['submitAgentSearch', value])
  });

  controller.syncResults({ shouldOpen: true });
  assert.equal(input.getAttribute('aria-expanded'), 'true');

  let prevented = 0;
  input.dispatch('keydown', { key: 'ArrowDown', preventDefault: () => prevented++ });
  assert.equal(controller.getActiveIndex(), 0);
  assert.equal(input.getAttribute('aria-activedescendant'), 'prod-agent-option-0');
  assert.equal(first.classList.contains('is-active'), true);

  input.dispatch('keydown', { key: 'ArrowUp', preventDefault: () => prevented++ });
  assert.equal(controller.getActiveIndex(), 1);
  assert.equal(input.getAttribute('aria-activedescendant'), 'prod-agent-option-1');

  input.dispatch('keydown', { key: 'Enter', preventDefault: () => prevented++ });
  assert.deepEqual(calls, [['chooseAgentSuggestion', 'ana maria']]);
  assert.equal(prevented, 3);

  input.dispatch('keydown', { key: 'Escape', preventDefault: () => prevented++ });
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.equal(input.getAttribute('aria-activedescendant'), null);
});

test('agent combobox rerenders input, submits commands, repositions, and cleans up', async () => {
  const { bindProductivityAgentCombobox } = await loadComboboxModule();
  const styleValues = new Map();
  const input = fakeEventTarget({ value: 'mi' });
  const submitButton = fakeEventTarget();
  const popover = createNativePopover();
  popover.style.setProperty = (name, value) => styleValues.set(name, value);
  const listbox = fakeEventTarget({ querySelectorAll: () => [] });
  const anchorElement = fakeEventTarget({
    getBoundingClientRect: () => ({ left: 30, top: 40, bottom: 86, width: 360 })
  });
  const windowRef = fakeEventTarget({ innerWidth: 500, innerHeight: 420 });
  const calls = [];
  const controller = bindProductivityAgentCombobox({
    input,
    submitButton,
    popover,
    listbox,
    anchorElement,
    windowRef,
    getVisibleAgents: () => [['mihai pop', { fullName: 'Mihai Pop' }]],
    renderSearchResults: value => calls.push(['renderSearchResults', value]),
    submitAgentSearch: value => calls.push(['submitAgentSearch', value]),
    markAgentSearchPending: () => calls.push(['markAgentSearchPending'])
  });

  input.dispatch('input');
  input.dispatch('focus');
  submitButton.dispatch('click');
  controller.open();
  windowRef.dispatch('resize');

  assert.deepEqual(calls, [
    ['markAgentSearchPending'],
    ['renderSearchResults', 'mi'],
    ['renderSearchResults', 'mi'],
    ['submitAgentSearch', 'mi']
  ]);
  assert.equal(styleValues.get('--agent-popover-left'), '30px');
  assert.equal(styleValues.get('--agent-popover-width'), '360px');
  assert.equal(input.getAttribute('aria-expanded'), 'true');

  controller.cleanup();
  assert.equal(input.listenerCount('input'), 0);
  assert.equal(submitButton.listenerCount('click'), 0);
  assert.equal(windowRef.listenerCount('resize'), 0);
  assert.equal(input.getAttribute('aria-expanded'), 'false');
});

test('agent combobox uses a fallback open state without native popover support', async () => {
  const { bindProductivityAgentCombobox } = await loadComboboxModule();
  const input = fakeEventTarget();
  const popover = fakeEventTarget({
    matches() {
      throw new Error('selector unsupported');
    },
    getBoundingClientRect: () => ({ height: 160 }),
    scrollHeight: 160
  });
  const controller = bindProductivityAgentCombobox({
    input,
    popover,
    listbox: fakeEventTarget({ querySelectorAll: () => [] }),
    anchorElement: fakeEventTarget({
      getBoundingClientRect: () => ({ left: 12, top: 20, bottom: 60, width: 280 })
    }),
    windowRef: fakeEventTarget({ innerWidth: 320, innerHeight: 480 }),
    getVisibleAgents: () => [['ana pop', { fullName: 'Ana Pop' }]]
  });

  assert.equal(controller.open(), true);
  assert.equal(popover.dataset.fallbackOpen, 'true');
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  controller.close();
  assert.equal(popover.dataset.fallbackOpen, undefined);
  assert.equal(input.getAttribute('aria-expanded'), 'false');
});
