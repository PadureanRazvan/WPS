import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers/browser-module.mjs';
import * as viewState from '../js/planner-view-state.js';
import * as selectionState from '../js/planner-selection-state.js';
import * as exports from '../js/planner-export-command.js';
import { buildPlannerMigrationCommands } from '../js/planner-persistence-command.js';
import { filterPlannerAgents } from '../js/planner-read-model.js';
import { translations, getMonthKey } from '../js/config.js';
import { escapeHtml } from '../js/html.js';

class Element {
    listeners = new Map();
    value = ''; textContent = ''; innerHTML = ''; dataset = {}; children = [];
    constructor() {
        const classes = new Set();
        this.classList = {
            contains: name => classes.has(name),
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            toggle: name => { if (classes.has(name)) { classes.delete(name); return false; } classes.add(name); return true; }
        };
    }
    addEventListener(type, callback) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(callback);
    }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    fire(type, fields = {}) {
        for (const callback of [...this.listeners.get(type) || []]) callback({ target: this, stopPropagation() {}, ...fields });
    }
    click() { this.fire('click'); }
    appendChild(child) { this.children.push(child); }
    contains(target) { return this === target || this.children.includes(target); }
    querySelectorAll() { return []; }
    focus() { this.focused = true; }
}

function fixture({ eager = false, librariesReady = true } = {}) {
    const ids = ['dateRangePickerInput', 'prevMonthBtn', 'nextMonthBtn', 'plannerDateRange', 'plannerExportBtn',
        'agentFilterButton', 'agentFilterDropdown', 'agentSearchInput', 'agentList', 'clearAgentFilter'];
    const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
    const filterButtons = ['agent', 'team'].map(type => Object.assign(new Element(), { dataset: { filterType: type } }));
    const document = Object.assign(new Element(), {
        readyState: 'loading',
        getElementById: id => elements[id] || null,
        querySelector: () => null,
        querySelectorAll: selector => selector === '.filter-type-btn' ? filterButtons : [],
        createElement: () => new Element()
    });
    const domReady = () => { document.readyState = 'complete'; document.fire('DOMContentLoaded'); };
    if (!eager) domReady(); // The production runtime is imported after this event.
    const downloads = [], pickers = [], notices = [];
    let subscriptions = 0, writes = 0;
    const noWrite = () => { writes++; throw new Error('Unexpected database write during Planner startup'); };
    const agents = [{ id: 'fixture-agent', fullName: 'Fixture Agent', username: 'fixture', contractType: 'Full-time',
        primaryTeam: 'RO', monthlyDays: { '2026-09': Array(30).fill('8RO'), '2026-10': Array(31).fill('8RO') }, monthlyNotes: {} }];
    class FixedDate extends Date {
        constructor(...args) { super(...(args.length ? args : [2026, 9, 21, 12])); }
    }
    class Calendar {
        constructor(options) {
            this.options = options; this.events = new Map(); pickers.push(this);
            this.setDateRange(options.startDate, options.endDate);
            options.setup?.(this);
        }
        on(name, handler) { this.events.set(name, handler); }
        setDateRange(start, end) {
            this.options.element.value = `${getMonthKey(start)}:${start.getDate()}-${end.getDate()}`;
            this.events.get('selected')?.({ dateInstance: new Date(start) }, { dateInstance: new Date(end) });
        }
    }
    const planner = loadBrowserModule('../../js/planner.js', {
        ...viewState, ...selectionState, ...exports, buildPlannerMigrationCommands, filterPlannerAgents,
        translations, getMonthKey, escapeHtml, document, Date: FixedDate,
        localStorage: { getItem: () => 'en' }, console: { log() {}, warn() {}, error() {} },
        db: {}, collection: () => ({}), doc: () => ({}), runTransaction: noWrite,
        createAgentFirestoreStore: () => ({ updateMany: noWrite }),
        onSnapshot(_target, next) {
            subscriptions++;
            next({ size: agents.length, forEach: callback => agents.forEach(agent => callback({ id: agent.id, data: () => structuredClone(agent) })) });
            return () => subscriptions--;
        },
        updateDashboard() {},
        showTemporaryMessage: (message, type) => notices.push({ message, type }),
        downloadPlannerExportCsv: download => downloads.push(download),
        ...(librariesReady ? { Litepicker: Calendar } : {})
    }, 'globalThis.planner = { initializePlanner, cleanupPlanner, getPlannerData };');
    if (eager) domReady();
    return { planner, elements, filterButtons, document, downloads, pickers, notices, Calendar,
        get subscriptions() { return subscriptions; }, get writes() { return writes; } };
}

function assertMonthRoundTrip(f) {
    const { elements } = f;
    assert.equal(elements.plannerDateRange.textContent, 'October 2026');
    assert.equal(elements.dateRangePickerInput.value, '2026-10:1-31');
    elements.prevMonthBtn.click();
    assert.equal(elements.plannerDateRange.textContent, 'September 2026');
    assert.equal(elements.dateRangePickerInput.value, '2026-09:1-30');
    elements.nextMonthBtn.click();
    assert.equal(elements.plannerDateRange.textContent, 'October 2026');
    assert.equal(f.writes, 0);
}

test('Planner controls work when the module loads before DOMContentLoaded', () => {
    const f = fixture({ eager: true });
    f.planner.initializePlanner();
    assertMonthRoundTrip(f);
});

test('a late-loaded Planner initializes date navigation after DOMContentLoaded has already fired', () => {
    const f = fixture();
    f.planner.initializePlanner();
    assertMonthRoundTrip(f);
});

test('late-loaded Planner toolbar exports the selected month and opens its agent filter', () => {
    const f = fixture();
    f.planner.initializePlanner();
    f.elements.prevMonthBtn.click();
    f.elements.plannerExportBtn.click();
    assert.equal(f.downloads.length, 1, 'export button must call the real export command');
    assert.match(f.downloads[0].filename, /2026-09/);
    assert.match(f.downloads[0].csv, /Fixture Agent/);
    assert.match(f.downloads[0].csv, /2026-09-01/);
    assert.doesNotMatch(f.downloads[0].csv, /2026-10-/);
    f.elements.agentFilterButton.click();
    assert.equal(f.elements.agentFilterDropdown.classList.contains('visible'), true);
    assert.equal(f.elements.agentSearchInput.focused, true);
    f.filterButtons[1].click();
    assert.equal(f.elements.agentSearchInput.placeholder, translations.en['planner-search-team']);
    assert.equal(f.writes, 0);
});

test('sign-out and another sign-in do not duplicate calendar, navigation or export bindings', () => {
    const f = fixture();
    f.planner.initializePlanner();
    f.planner.cleanupPlanner();
    assert.equal(f.subscriptions, 0);
    f.planner.initializePlanner();
    assert.equal(f.subscriptions, 1);
    assert.equal(f.pickers.length, 1);
    assertMonthRoundTrip(f);
    f.elements.plannerExportBtn.click();
    assert.equal(f.downloads.length, 1);
});

test('real runtime initializes the real Planner only after its delayed calendar library is ready', async () => {
    const f = fixture({ librariesReady: false });
    let resolveLibraries;
    const dependencies = Object.fromEntries(['initializeUsers', 'cleanupUsers', 'clearSelection', 'undoLastChange',
        'initializeProductivity', 'cleanupProductivity', 'initializeSchedule', 'cleanupSchedule', 'initializeReports',
        'cleanupReports', 'initializeInfoVersion', 'initializeInfoInteractive', 'initializeCharts', 'initializeProductivityChart',
        'updateAverageProductivityCard', 'setTheme', 'updateLanguageUI', 'showSection', 'openEditModal', 'selectEditType',
        'saveModalChanges', 'closeEditModal', 'toggleSidebar', 'initLogoAnimation', 'initializeChat', 'cleanupChat', 'logout',
        'initializeLogs', 'setLogUser', 'logActivity', 'applyDailyGreeting', 'yieldToInterface'].map(name => [name, () => {}]));
    const runtime = loadBrowserModule('../../js/app-runtime.js', {
        ...dependencies,
        document: f.document, localStorage: { getItem: () => 'en' }, console: { log() {} },
        initializePlanner: () => f.planner.initializePlanner(), cleanupPlanner: () => f.planner.cleanupPlanner(),
        bindAppShellInteractions: () => () => {}, bindAppRefreshEvents: () => () => {},
        loadWorkspaceLibraries: () => new Promise(resolve => { resolveLibraries = resolve; })
    });
    const pending = runtime.initializeApp({ email: 'fixture@example.test' });
    assert.equal(f.pickers.length, 0);
    assert.equal(f.subscriptions, 0);
    f.planner.Litepicker = f.Calendar;
    resolveLibraries();
    await pending;
    assertMonthRoundTrip(f);
    f.elements.plannerExportBtn.click();
    assert.equal(f.downloads.length, 1);
    runtime.cleanupApp();
    assert.equal(f.subscriptions, 0);
});
