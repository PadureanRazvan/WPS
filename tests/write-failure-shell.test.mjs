import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers/browser-module.mjs';
import { buildPlannerEditCommand } from '../js/planner-edit-command.js';
import { createProductivityDateCommands } from '../js/productivity-date-commands.js';

test('a rejected planner save does not claim success or add an undo entry', async () => {
  const notices = [];
  const failure = new Error('permission-denied');
  const reject = async () => { throw failure; };
  const shell = loadBrowserModule('../../js/planner.js', {
    document: { addEventListener() {} },
    db: {}, collection: () => ({}), doc: () => ({}), runTransaction: reject, updateDoc: reject,
    createAgentFirestoreStore: () => ({ updateMany: reject }),
    createPlannerViewState: () => ({}), createPlannerSelectionState: () => ({}),
    buildPlannerEditCommand,
    showTemporaryMessage: (message, type) => notices.push({ message, type }),
    logActivity() {}, console: { log() {}, error() {} }
  }, 'plannerData = [{ id: "a", fullName: "Alice", monthlyDays: { "2026-09": [""] } }]; globalThis.undoCount = () => undoStack.length;');
  await assert.rejects(shell.applyChangesToSelectedCells(new Set(['a|2026-09|0']), '8RO'), /permission-denied/);
  assert.equal(shell.undoCount(), 0);
  assert.ok(!notices.some(notice => notice.type === 'success'));
});

test('a failed productivity deletion keeps local data and never reports success', async () => {
  const events = [];
  const commands = createProductivityDateCommands({
    deleteDateEntry: () => events.push('local-delete'),
    deletePersistedDate: async () => { throw new Error('permission-denied'); },
    showTemporaryMessage: () => events.push('success'),
    refreshProductivityViews: () => events.push('refresh')
  });
  await assert.rejects(commands.removeDate('2026-09-07'), /permission-denied/);
  assert.deepEqual(events, []);
});
