import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadCalendarActionsModule() {
  try {
    return await import('../js/productivity-upload-calendar-actions.js');
  } catch (error) {
    assert.fail(`productivity-upload-calendar-actions.js should be importable: ${error.message}`);
  }
}

function fakeElement(overrides = {}) {
  const listeners = new Map();
  return {
    dataset: {},
    clickCount: 0,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatch(type, event = {}) {
      const handler = listeners.get(type);
      assert.equal(typeof handler, 'function', `expected ${type} listener`);
      return handler(event);
    },
    click() {
      this.clickCount += 1;
    },
    ...overrides
  };
}

function fakePanel({ dateButtons = [], bySelector = {} } = {}) {
  return {
    querySelectorAll(selector) {
      if (selector === '[data-date]') return dateButtons;
      return [];
    },
    querySelector(selector) {
      return bySelector[selector] ?? null;
    }
  };
}

function fakeDocument(elements) {
  return {
    getElementById(id) {
      return elements[id] ?? null;
    }
  };
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test('upload calendar actions bind date selection and month navigation', async () => {
  const { bindProductivityUploadCalendarActions } = await loadCalendarActionsModule();
  const selectedDay = fakeElement({ dataset: { date: '2026-05-04' } });
  const prev = fakeElement();
  const next = fakeElement();
  const calls = [];
  let monthDate = new Date(2026, 4, 1);

  bindProductivityUploadCalendarActions({
    panel: fakePanel({
      dateButtons: [selectedDay],
      bySelector: {
        '#uploadCalendarPrev': prev,
        '#uploadCalendarNext': next
      }
    }),
    selectUploadDate: dateKey => calls.push(['selectUploadDate', dateKey]),
    getUploadCalendarMonth: () => monthDate,
    setUploadCalendarMonth: value => {
      monthDate = value;
      calls.push(['setUploadCalendarMonth', localDateKey(value)]);
    },
    renderUploadCalendar: () => calls.push(['renderUploadCalendar'])
  });

  selectedDay.dispatch('click');
  prev.dispatch('click');
  next.dispatch('click');

  assert.deepEqual(calls, [
    ['selectUploadDate', '2026-05-04'],
    ['setUploadCalendarMonth', '2026-04-01'],
    ['renderUploadCalendar'],
    ['setUploadCalendarMonth', '2026-05-01'],
    ['renderUploadCalendar']
  ]);
});

test('upload calendar actions bind upload file triggers', async () => {
  const { bindProductivityUploadCalendarActions } = await loadCalendarActionsModule();
  const ticketsButton = fakeElement();
  const callsButton = fakeElement();
  const ticketsInput = fakeElement();
  const callsInput = fakeElement();

  bindProductivityUploadCalendarActions({
    panel: fakePanel({
      bySelector: {
        '#uploadCalendarTickets': ticketsButton,
        '#uploadCalendarCalls': callsButton
      }
    }),
    doc: fakeDocument({
      ticketsFileInput: ticketsInput,
      callsFileInput: callsInput
    })
  });

  ticketsButton.dispatch('click');
  callsButton.dispatch('click');

  assert.equal(ticketsInput.clickCount, 1);
  assert.equal(callsInput.clickCount, 1);
});

test('upload calendar actions bind export and delete to the current upload date', async () => {
  const { bindProductivityUploadCalendarActions } = await loadCalendarActionsModule();
  const exportButton = fakeElement();
  const deleteButton = fakeElement();
  const calls = [];
  let uploadDate = '2026-05-04';

  bindProductivityUploadCalendarActions({
    panel: fakePanel({
      bySelector: {
        '#uploadCalendarExport': exportButton,
        '#uploadCalendarDelete': deleteButton
      }
    }),
    getUploadDate: () => uploadDate,
    exportProductivityDate: dateKey => calls.push(['exportProductivityDate', dateKey]),
    removeProductivityDate: dateKey => calls.push(['removeProductivityDate', dateKey])
  });

  exportButton.dispatch('click');
  uploadDate = '2026-05-05';
  deleteButton.dispatch('click');

  assert.deepEqual(calls, [
    ['exportProductivityDate', '2026-05-04'],
    ['removeProductivityDate', '2026-05-05']
  ]);
});

test('upload calendar action binding is a no-op when the panel is missing', async () => {
  const { bindProductivityUploadCalendarActions } = await loadCalendarActionsModule();

  assert.equal(bindProductivityUploadCalendarActions({ panel: null }), false);
});
