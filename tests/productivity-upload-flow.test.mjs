import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadUploadFlowModule() {
  try {
    return await import('../js/productivity-upload-flow.js');
  } catch (error) {
    assert.fail(`productivity-upload-flow.js should be importable: ${error.message}`);
  }
}

function t(key) {
  return ({
    'prod-select-date-first': 'Select a date first',
    'data-overwritten': '{name} overwritten for {date}',
    'file-processed': '{name} processed for {date}',
    'error-generic': 'Error: {msg}',
    'error-file-processing': 'Could not process {name}'
  })[key] || key;
}

function fileNameElement() {
  return { textContent: '', style: {} };
}

test('upload flow rejects files when no upload date is selected', async () => {
  const { processProductivityUploadFile } = await loadUploadFlowModule();
  const messages = [];
  let parsed = false;

  await processProductivityUploadFile({
    file: { name: 'calls.csv' },
    fileNameEl: fileNameElement(),
    fileType: 'calls',
    getUploadDate: () => '',
    parseFile: async () => {
      parsed = true;
    },
    showTemporaryMessage: (...args) => messages.push(args),
    t
  });

  assert.equal(parsed, false);
  assert.deepEqual(messages, [['Select a date first', 'error']]);
});

test('upload flow parses a new file, saves it, and refreshes upload views', async () => {
  const { processProductivityUploadFile } = await loadUploadFlowModule();
  const calls = [];
  const fileNameEl = fileNameElement();

  await processProductivityUploadFile({
    file: { name: 'calls.csv' },
    fileNameEl,
    fileType: 'calls',
    getUploadDate: () => '2026-05-04',
    getDateEntry: () => ({ ticketsData: null, callsData: new Map() }),
    parseFile: async (file, dateKey) => calls.push(['parseFile', file.name, dateKey]),
    saveDate: async dateKey => calls.push(['saveDate', dateKey]),
    showTemporaryMessage: (...args) => calls.push(['showTemporaryMessage', ...args]),
    refreshProductivityViews: args => calls.push(['refreshProductivityViews', args.source]),
    showUploadSuccess: () => calls.push(['showUploadSuccess']),
    formatDateDisplay: dateKey => `Display ${dateKey}`,
    t
  });

  assert.equal(fileNameEl.textContent, 'calls.csv');
  assert.equal(fileNameEl.style.color, 'var(--accent)');
  assert.deepEqual(calls, [
    ['parseFile', 'calls.csv', '2026-05-04'],
    ['saveDate', '2026-05-04'],
    ['showTemporaryMessage', 'calls.csv processed for Display 2026-05-04', 'success'],
    ['refreshProductivityViews', 'upload'],
    ['showUploadSuccess']
  ]);
});

test('upload flow reports overwritten data when the same file type already exists', async () => {
  const { processProductivityUploadFile } = await loadUploadFlowModule();
  const messages = [];

  await processProductivityUploadFile({
    file: { name: 'tickets.xlsx' },
    fileNameEl: fileNameElement(),
    fileType: 'tickets',
    getUploadDate: () => '2026-05-04',
    getDateEntry: () => ({
      ticketsData: new Map([['ana pop', {}]]),
      callsData: null
    }),
    parseFile: async () => {},
    saveDate: async () => {},
    showTemporaryMessage: (...args) => messages.push(args),
    refreshProductivityViews: () => {},
    showUploadSuccess: () => {},
    formatDateDisplay: dateKey => `Display ${dateKey}`,
    t
  });

  assert.deepEqual(messages, [
    ['tickets.xlsx overwritten for Display 2026-05-04', 'success']
  ]);
});

test('upload flow reports parser failures and marks the file as failed', async () => {
  const { processProductivityUploadFile } = await loadUploadFlowModule();
  const calls = [];
  const fileNameEl = fileNameElement();

  await processProductivityUploadFile({
    file: { name: 'bad.csv' },
    fileNameEl,
    fileType: 'calls',
    getUploadDate: () => '2026-05-04',
    getDateEntry: () => null,
    parseFile: async () => {
      throw new Error('bad csv');
    },
    saveDate: async dateKey => calls.push(['saveDate', dateKey]),
    showTemporaryMessage: (...args) => calls.push(['showTemporaryMessage', ...args]),
    refreshProductivityViews: args => calls.push(['refreshProductivityViews', args.source]),
    showUploadSuccess: () => calls.push(['showUploadSuccess']),
    logError: (...args) => calls.push(['logError', args[0], args[1].message]),
    t
  });

  assert.equal(fileNameEl.textContent, 'Could not process bad.csv');
  assert.equal(fileNameEl.style.color, 'var(--error)');
  assert.deepEqual(calls, [
    ['logError', 'File parse error:', 'bad csv'],
    ['showTemporaryMessage', 'Error: bad csv', 'error']
  ]);
});
