import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadUploadAreaModule() {
  try {
    return await import('../js/productivity-upload-area.js');
  } catch (error) {
    assert.fail(`productivity-upload-area.js should be importable: ${error.message}`);
  }
}

function fakeElement(overrides = {}) {
  const listeners = new Map();
  return {
    style: {},
    files: [],
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

test('upload area binds click and file input change to file handling', async () => {
  const { bindProductivityUploadArea } = await loadUploadAreaModule();
  const handled = [];
  const area = fakeElement();
  const fileInput = fakeElement();
  const fileNameEl = fakeElement();
  const file = { name: 'calls.csv' };

  bindProductivityUploadArea({
    area,
    fileInput,
    fileNameEl,
    fileType: 'calls',
    onFile: (...args) => handled.push(args)
  });

  area.dispatch('click', { target: area });
  assert.equal(fileInput.clickCount, 1);

  area.dispatch('click', { target: fileInput });
  assert.equal(fileInput.clickCount, 1);

  fileInput.files = [file];
  fileInput.dispatch('change');
  assert.equal(handled.length, 1);
  assert.deepEqual(handled[0], [file, fileNameEl, 'calls']);
});

test('upload area applies drag state and handles dropped files', async () => {
  const { bindProductivityUploadArea } = await loadUploadAreaModule();
  const handled = [];
  const prevented = [];
  const area = fakeElement();
  const fileInput = fakeElement();
  const fileNameEl = fakeElement();
  const file = { name: 'tickets.xlsx' };

  bindProductivityUploadArea({
    area,
    fileInput,
    fileNameEl,
    fileType: 'tickets',
    onFile: (...args) => handled.push(args)
  });

  area.dispatch('dragover', {
    preventDefault: () => prevented.push('dragover')
  });
  assert.deepEqual(prevented, ['dragover']);
  assert.equal(area.style.borderColor, 'var(--accent)');
  assert.equal(area.style.background, 'var(--hover)');

  area.dispatch('dragleave');
  assert.equal(area.style.borderColor, '');
  assert.equal(area.style.background, '');

  area.dispatch('drop', {
    preventDefault: () => prevented.push('drop'),
    dataTransfer: { files: [file] }
  });
  assert.deepEqual(prevented, ['dragover', 'drop']);
  assert.equal(area.style.borderColor, '');
  assert.equal(area.style.background, '');
  assert.deepEqual(handled[0], [file, fileNameEl, 'tickets']);
});

test('upload area binding is a no-op when required elements are missing', async () => {
  const { bindProductivityUploadArea } = await loadUploadAreaModule();

  assert.equal(bindProductivityUploadArea({ area: null, fileInput: fakeElement() }), false);
  assert.equal(bindProductivityUploadArea({ area: fakeElement(), fileInput: null }), false);
});
