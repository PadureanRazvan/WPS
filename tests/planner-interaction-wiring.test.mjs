import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bindPlannerControlInteractions,
  bindPlannerTableInteractions
} from '../js/planner-interaction-wiring.js';

class FakeTarget {
  constructor({ dataset = {}, classes = [], matchesInput = false } = {}) {
    this.dataset = dataset;
    this.listeners = new Map();
    this.added = [];
    this.removed = [];
    this.matchesInput = matchesInput;
    this.classList = {
      contains: (className) => classes.includes(className)
    };
  }

  addEventListener(type, handler) {
    this.added.push([type, handler]);
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this.removed.push([type, handler]);
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(type, handlers.filter(entry => entry !== handler));
  }

  dispatch(type, event = {}) {
    const handlers = this.listeners.get(type) || [];
    handlers.forEach(handler => {
      handler({
        currentTarget: this,
        target: event.target || this,
        key: event.key,
        ctrlKey: Boolean(event.ctrlKey),
        metaKey: Boolean(event.metaKey),
        preventDefault: event.preventDefault || (() => {}),
        stopPropagation: event.stopPropagation || (() => {})
      });
    });
  }

  matches() {
    return this.matchesInput;
  }
}

function makeRoot({ cells = [], body = null, ids = {}, selectors = {}, selectorLists = {} } = {}) {
  return {
    getElementById(id) {
      return ids[id] || (id === 'plannerTableBody' ? body : null);
    },
    querySelector(selector) {
      return selectors[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === '.planner-cell.selectable') return cells;
      return selectorLists[selector] || [];
    }
  };
}

function recorder() {
  const calls = [];
  const fn = (...args) => calls.push(args);
  fn.calls = calls;
  return fn;
}

test('bindPlannerTableInteractions wires selectable Planner Cells, document mouseup, scoped right-click, and delete delegation', () => {
  const cell = new FakeTarget({ dataset: { agentId: 'agent-1', month: '2026-05', day: '8' } });
  const body = new FakeTarget();
  const documentTarget = new FakeTarget();
  const root = makeRoot({ cells: [cell], body });
  const handlers = {
    onCellMouseDown: recorder(),
    onCellMouseOver: recorder(),
    onCellMouseUp: recorder(),
    onCellRightClick: recorder(),
    onDocumentMouseUp: recorder(),
    onScopedRightClick: recorder(),
    onDeleteButtonClick: recorder()
  };

  const teardown = bindPlannerTableInteractions({ root, documentTarget, handlers });

  assert.deepEqual(cell.added.map(([type]) => type), ['mousedown', 'mouseover', 'mouseup', 'contextmenu']);
  assert.deepEqual(cell.removed.map(([type]) => type), ['mousedown', 'mouseover', 'mouseup', 'contextmenu']);
  assert.deepEqual(documentTarget.added.map(([type]) => type), ['mouseup']);
  assert.deepEqual(body.added.map(([type]) => type), ['contextmenu', 'click']);

  cell.dispatch('mousedown');
  cell.dispatch('mouseover');
  cell.dispatch('mouseup');
  cell.dispatch('contextmenu');
  documentTarget.dispatch('mouseup');
  body.dispatch('contextmenu');
  body.dispatch('click');

  assert.equal(handlers.onCellMouseDown.calls.length, 1);
  assert.equal(handlers.onCellMouseOver.calls.length, 1);
  assert.equal(handlers.onCellMouseUp.calls.length, 1);
  assert.equal(handlers.onCellRightClick.calls.length, 1);
  assert.equal(handlers.onDocumentMouseUp.calls.length, 1);
  assert.equal(handlers.onScopedRightClick.calls.length, 1);
  assert.equal(handlers.onDeleteButtonClick.calls.length, 1);

  teardown();
  assert.deepEqual(cell.removed.map(([type]) => type), [
    'mousedown',
    'mouseover',
    'mouseup',
    'contextmenu',
    'mousedown',
    'mouseover',
    'mouseup',
    'contextmenu'
  ]);
});

test('bindPlannerTableInteractions is safe when the Planner table is not rendered', () => {
  assert.doesNotThrow(() => {
    bindPlannerTableInteractions({
      root: makeRoot(),
      documentTarget: null,
      handlers: {}
    });
  });
});

test('Planner interaction binders are safe to call without a browser document', () => {
  assert.doesNotThrow(() => bindPlannerTableInteractions());
  assert.doesNotThrow(() => bindPlannerControlInteractions());
});

test('bindPlannerControlInteractions wires Planner edit, cancel, modal, save, undo, and keyboard actions', () => {
  const editButton = new FakeTarget();
  const cancelSelectionButton = new FakeTarget();
  const editOption = new FakeTarget({ dataset: { type: 'working' } });
  const closeButton = new FakeTarget();
  const saveButton = new FakeTarget();
  const cancelModalButton = new FakeTarget();
  const undoButton = new FakeTarget();
  const documentTarget = new FakeTarget();
  const plannerSection = new FakeTarget({ classes: ['active'] });
  const selectedCell = new FakeTarget();
  const inactiveTarget = new FakeTarget();
  const calls = [];
  let modalOpen = null;
  const root = makeRoot({
    ids: {
      editSelectionBtn: editButton,
      cancelSelectionBtn: cancelSelectionButton,
      saveButton,
      undoBtn: undoButton,
      planner: plannerSection
    },
    selectors: {
      '.edit-modal-close': closeButton,
      '.edit-actions .btn-secondary': cancelModalButton
    },
    selectorLists: {
      '.edit-option': [editOption],
      '.planner-cell.selected': [selectedCell]
    }
  });
  root.querySelector = (selector) => {
    if (selector === '.edit-modal.active') return modalOpen;
    return {
      '.edit-modal-close': closeButton,
      '.edit-actions .btn-secondary': cancelModalButton
    }[selector] || null;
  };
  const actions = {
    openEditModal: () => calls.push('open'),
    clearSelection: () => calls.push('clear'),
    selectEditType: (type) => calls.push(`select:${type}`),
    closeEditModal: () => calls.push('close'),
    saveModalChanges: () => calls.push('save'),
    undoLastChange: () => calls.push('undo')
  };

  bindPlannerControlInteractions({ root, documentTarget, actions });

  editButton.dispatch('click');
  cancelSelectionButton.dispatch('click');
  editOption.dispatch('click');
  closeButton.dispatch('click');
  saveButton.dispatch('click');
  cancelModalButton.dispatch('click');
  undoButton.dispatch('click');

  let prevented = 0;
  documentTarget.dispatch('keydown', {
    key: 'Enter',
    target: inactiveTarget,
    preventDefault: () => prevented += 1
  });
  documentTarget.dispatch('keydown', {
    key: 'z',
    ctrlKey: true,
    target: inactiveTarget,
    preventDefault: () => prevented += 1
  });
  modalOpen = new FakeTarget();
  documentTarget.dispatch('keydown', {
    key: 'Escape',
    target: inactiveTarget,
    preventDefault: () => prevented += 1
  });
  modalOpen = null;
  documentTarget.dispatch('keydown', {
    key: 'Escape',
    target: inactiveTarget,
    preventDefault: () => prevented += 1
  });
  documentTarget.dispatch('keydown', {
    key: 'Enter',
    target: new FakeTarget({ matchesInput: true }),
    preventDefault: () => prevented += 1
  });

  assert.deepEqual(calls, [
    'open',
    'clear',
    'select:working',
    'close',
    'save',
    'close',
    'undo',
    'open',
    'undo',
    'close',
    'clear'
  ]);
  assert.equal(prevented, 4);
});
