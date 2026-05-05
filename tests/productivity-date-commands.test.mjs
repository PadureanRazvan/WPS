import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadDateCommandsModule() {
  try {
    return await import('../js/productivity-date-commands.js');
  } catch (error) {
    assert.fail(`productivity-date-commands.js should be importable: ${error.message}`);
  }
}

function t(key) {
  return ({
    'prod-no-results': 'No data to export',
    'prod-deleted': 'Deleted {date}'
  })[key] || key;
}

test('date commands export selected date data as a downloaded CSV', async () => {
  const { createProductivityDateCommands } = await loadDateCommandsModule();
  const calls = [];
  const entry = { ticketsData: new Map([['ana pop', {}]]), callsData: null };

  const commands = createProductivityDateCommands({
    getDateEntry: dateKey => (dateKey === '2026-05-04' ? entry : null),
    getDateStatus: value => ({ hasAnyData: value === entry }),
    buildExportCsv: (dateKey, value) => {
      calls.push(['buildExportCsv', dateKey, value === entry]);
      return 'date,file_type\n2026-05-04,tickets';
    },
    downloadTextFile: (...args) => calls.push(['downloadTextFile', ...args]),
    showTemporaryMessage: (...args) => calls.push(['showTemporaryMessage', ...args])
  });

  commands.exportDate('2026-05-04');

  assert.deepEqual(calls, [
    ['buildExportCsv', '2026-05-04', true],
    ['downloadTextFile', 'productivity-2026-05-04.csv', 'date,file_type\n2026-05-04,tickets']
  ]);
});

test('date commands report when there is no selected date data to export', async () => {
  const { createProductivityDateCommands } = await loadDateCommandsModule();
  const calls = [];

  const commands = createProductivityDateCommands({
    getDateEntry: () => null,
    getDateStatus: () => ({ hasAnyData: false }),
    buildExportCsv: () => calls.push(['buildExportCsv']),
    downloadTextFile: () => calls.push(['downloadTextFile']),
    showTemporaryMessage: (...args) => calls.push(['showTemporaryMessage', ...args]),
    t
  });

  commands.exportDate('2026-05-04');

  assert.deepEqual(calls, [
    ['showTemporaryMessage', 'No data to export', 'error']
  ]);
});

test('date commands remove date data, delete persistence, refresh views, and show success', async () => {
  const { createProductivityDateCommands } = await loadDateCommandsModule();
  const calls = [];

  const commands = createProductivityDateCommands({
    deleteDateEntry: dateKey => calls.push(['deleteDateEntry', dateKey]),
    deletePersistedDate: async dateKey => calls.push(['deletePersistedDate', dateKey]),
    refreshProductivityViews: args => calls.push(['refreshProductivityViews', args.source]),
    showTemporaryMessage: (...args) => calls.push(['showTemporaryMessage', ...args]),
    formatDateDisplay: dateKey => `Display ${dateKey}`,
    t
  });

  await commands.removeDate('2026-05-04');

  assert.deepEqual(calls, [
    ['deleteDateEntry', '2026-05-04'],
    ['deletePersistedDate', '2026-05-04'],
    ['refreshProductivityViews', 'delete'],
    ['showTemporaryMessage', 'Deleted Display 2026-05-04', 'success', 2000]
  ]);
});

test('text download creates and cleans up a temporary browser link', async () => {
  const { downloadTextFile } = await loadDateCommandsModule();
  const calls = [];
  const link = {
    href: '',
    download: '',
    click: () => calls.push(['click']),
    remove: () => calls.push(['remove'])
  };
  const BlobAdapter = function(parts, options) {
    this.parts = parts;
    this.options = options;
  };
  const urlAdapter = {
    createObjectURL(blob) {
      calls.push(['createObjectURL', blob.parts, blob.options.type]);
      return 'blob:csv';
    },
    revokeObjectURL(url) {
      calls.push(['revokeObjectURL', url]);
    }
  };
  const doc = {
    createElement(tagName) {
      calls.push(['createElement', tagName]);
      return link;
    },
    body: {
      appendChild(value) {
        calls.push(['appendChild', value === link]);
      }
    }
  };

  downloadTextFile({
    filename: 'productivity-2026-05-04.csv',
    content: 'date,file_type',
    mimeType: 'text/csv;charset=utf-8',
    doc,
    url: urlAdapter,
    BlobAdapter
  });

  assert.equal(link.href, 'blob:csv');
  assert.equal(link.download, 'productivity-2026-05-04.csv');
  assert.deepEqual(calls, [
    ['createObjectURL', ['date,file_type'], 'text/csv;charset=utf-8'],
    ['createElement', 'a'],
    ['appendChild', true],
    ['click'],
    ['remove'],
    ['revokeObjectURL', 'blob:csv']
  ]);
});
