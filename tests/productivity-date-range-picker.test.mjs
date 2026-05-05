import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadDateRangePickerModule() {
  try {
    return await import('../js/productivity-date-range-picker.js');
  } catch (error) {
    assert.fail(`productivity-date-range-picker.js should be importable: ${error.message}`);
  }
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test('date range picker creates the expected Litepicker config and initial range', async () => {
  const { bindProductivityDateRangePicker } = await loadDateRangePickerModule();
  const input = {};
  const ranges = [];
  let createdOptions;

  class LitepickerAdapter {
    constructor(options) {
      createdOptions = options;
      options.setup({ on: () => {} });
      this.options = options;
    }
  }

  const picker = bindProductivityDateRangePicker({
    input,
    today: new Date('2026-05-05T15:30:00'),
    LitepickerAdapter,
    setDateRange: (start, end) => ranges.push([dateKey(start), dateKey(end), start.getHours()])
  });

  assert.equal(picker instanceof LitepickerAdapter, true);
  assert.equal(createdOptions.element, input);
  assert.equal(createdOptions.singleMode, false);
  assert.equal(createdOptions.allowRepick, true);
  assert.equal(createdOptions.lang, 'ro-RO');
  assert.equal(createdOptions.format, 'DD MMM YYYY');
  assert.equal(createdOptions.numberOfMonths, 2);
  assert.equal(createdOptions.numberOfColumns, 2);
  assert.deepEqual(ranges, [['2026-05-05', '2026-05-05', 0]]);
});

test('date range picker selected event updates the range and refreshes only when data exists', async () => {
  const { bindProductivityDateRangePicker } = await loadDateRangePickerModule();
  const ranges = [];
  const calls = [];
  const handlers = new Map();

  class LitepickerAdapter {
    constructor(options) {
      options.setup({
        on: (eventName, handler) => handlers.set(eventName, handler)
      });
    }
  }

  bindProductivityDateRangePicker({
    input: {},
    today: new Date('2026-05-05T15:30:00'),
    LitepickerAdapter,
    setDateRange: (start, end) => ranges.push([dateKey(start), dateKey(end)]),
    hasAnyData: () => calls.length === 0,
    renderCurrentView: () => calls.push('renderCurrentView')
  });

  handlers.get('selected')(
    { dateInstance: new Date('2026-05-01T00:00:00') },
    { dateInstance: new Date('2026-05-07T00:00:00') }
  );
  handlers.get('selected')(
    { dateInstance: new Date('2026-05-08T00:00:00') },
    { dateInstance: new Date('2026-05-09T00:00:00') }
  );

  assert.deepEqual(ranges, [
    ['2026-05-05', '2026-05-05'],
    ['2026-05-01', '2026-05-07'],
    ['2026-05-08', '2026-05-09']
  ]);
  assert.deepEqual(calls, ['renderCurrentView']);
});

test('date range picker binding is a no-op when required browser pieces are missing', async () => {
  const { bindProductivityDateRangePicker } = await loadDateRangePickerModule();

  assert.equal(bindProductivityDateRangePicker({ input: null, LitepickerAdapter: class {} }), null);
  assert.equal(bindProductivityDateRangePicker({ input: {}, LitepickerAdapter: null }), null);
});
