// js/productivity.js
import { db } from './firebase-config.js';
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getPlannerData } from './planner.js';
import { getUsersData } from './users.js';
import { showTemporaryMessage } from './ui.js';
import { translations, getMonthKey } from './config.js';
import { hasPerAgentProductivityEligibleDate, normalizeProductivityName } from './productivity-metrics.js';
import { buildProductivityExportCsv, getProductivityDateStatus } from './productivity-upload-calendar.js';
import { createProductivityDateCommands } from './productivity-date-commands.js';
import { buildProductivityUploadCalendarView, buildProductivityUploadDateStatusView, buildProductivityUploadSuccessView } from './productivity-upload-calendar-view.js';
import { bindProductivityUploadCalendarActions } from './productivity-upload-calendar-actions.js';
import { bindProductivityUploadArea } from './productivity-upload-area.js';
import { processProductivityUploadFile } from './productivity-upload-flow.js';
import { parseCallsCSV, parseTicketsXLSX } from './productivity-upload-parsing.js';
import { createProductivityFirestoreStore } from './productivity-persistence.js';
import { buildAverageProductivitySummary, buildProductivityTrendData } from './productivity-dashboard-metrics.js';
import { buildProductivityDetailView, buildProductivityOverviewView } from './productivity-view.js';
import { buildProductivityDetailRows } from './productivity-detail-rows.js';
import {
    buildProductivitySelectionWorkbookModel,
    exportProductivityWorkbook
} from './productivity-export-command.js';
import { bindProductivityDateRangePicker } from './productivity-date-range-picker.js';
import { bindProductivityControls } from './productivity-controls.js';
import { bindProductivityAgentActions, createProductivityAgentActions } from './productivity-agent-actions.js';
import {
    buildProductivityAgentSelectionView,
    filterProductivityAgentSelection
} from './productivity-agent-selection-view.js';
import {
    calculateProductivityOverview,
    formatProductivityDateKey,
    getProductivityDaysInRange,
    getProductivityEligibleHoursForRange,
    getProductivityEligibleHoursForTeamInRange,
    hasAnyProductivityData
} from './productivity-calculation.js';

function getLang() { return localStorage.getItem('language') || 'ro'; }
function t(key) { const l = getLang(); return (translations[l] && translations[l][key]) || key; }

// --- State ---
// Per-date storage: Map<dateKey, { ticketsData: Map, callsData: Map }>
const dataByDate = new Map();
let uploadDate = '';  // current selected upload date (YYYY-MM-DD)
let dateStart = new Date();
let dateEnd = new Date();
let currentTeamFilter = 'all';
let productivityPicker = null;
let currentView = 'overview'; // 'overview' or 'detail'
let selectedAgents = new Set(); // normalized names of selected agents
let detailSearchCommitted = false;
let uploadCalendarMonth = new Date();
let unsubscribeFromProductivity = null;
let visibleAgentSearchResults = [];
const productivityStore = createProductivityFirestoreStore({
    db,
    firestore: { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot }
});
const PRODUCTIVITY_AGENT_SEARCH_MIN_LENGTH = 2;
const dateCommands = createProductivityDateCommands({
    getDateEntry: dateKey => dataByDate.get(dateKey),
    deleteDateEntry: dateKey => dataByDate.delete(dateKey),
    getDateStatus: getProductivityDateStatus,
    buildExportCsv: buildProductivityExportCsv,
    deletePersistedDate: deleteFromFirestore,
    refreshProductivityViews,
    showTemporaryMessage,
    formatDateDisplay,
    t
});
const agentActions = createProductivityAgentActions({
    setSelectedAgents: value => {
        selectedAgents = value;
    },
    setDetailSearchCommitted: value => {
        detailSearchCommitted = value;
    },
    getVisibleAgents: () => visibleAgentSearchResults,
    getSearchResults: getAgentSearchResults,
    getAgentSearchTerm: () => document.getElementById('prodAgentSearch')?.value || '',
    setAgentSearchTerm,
    renderAgentSearchResults,
    renderCurrentView,
    showTemporaryMessage,
    getNoResultMessage: () => t('prod-no-results')
});

// --- Name Normalization & Matching ---

function pruneSelectedAgents() {
    const allowedAgents = new Set(getSearchableAgents().map(([normalizedName]) => normalizedName));
    selectedAgents.forEach(normalizedName => {
        if (!allowedAgents.has(normalizedName)) {
            selectedAgents.delete(normalizedName);
        }
    });
    if (selectedAgents.size === 0) {
        detailSearchCommitted = false;
    }
}

function formatDateDisplay(dateKey) {
    const d = new Date(dateKey + 'T00:00:00');
    return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

// --- Firestore Persistence ---

function replaceProductivityData(nextDataByDate) {
    dataByDate.clear();
    nextDataByDate.forEach((entry, dateKey) => {
        dataByDate.set(dateKey, entry);
    });
}

async function saveToFirestore(dateKey) {
    const entry = dataByDate.get(dateKey);
    if (!entry) return;
    try {
        await productivityStore.saveDate(dateKey, entry);
        console.log(`[Productivity] Saved data for ${dateKey} to Firestore.`);
    } catch (err) {
        console.error('[Productivity] Firestore save error:', err);
        showTemporaryMessage(t('prod-save-error'), 'error');
    }
}

async function deleteFromFirestore(dateKey) {
    try {
        await productivityStore.deleteDate(dateKey);
        console.log(`[Productivity] Deleted data for ${dateKey} from Firestore.`);
    } catch (err) {
        console.error('[Productivity] Firestore delete error:', err);
    }
}

async function loadAllFromFirestore() {
    try {
        const result = await productivityStore.loadAll();
        replaceProductivityData(result.dataByDate);
        console.log(`[Productivity] Loaded ${result.size} dates from Firestore.`);
    } catch (err) {
        console.error('[Productivity] Firestore load error:', err);
    }
}

function subscribeToProductivityData() {
    if (unsubscribeFromProductivity) {
        unsubscribeFromProductivity();
        unsubscribeFromProductivity = null;
    }

    return new Promise(resolve => {
        let resolved = false;
        unsubscribeFromProductivity = productivityStore.subscribe({
            onData(result) {
                replaceProductivityData(result.dataByDate);
                console.log(`[Productivity] Synced ${result.size} dates from Firestore.`);
                refreshProductivityViews({ source: 'snapshot' });
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            },
            async onError(err) {
                console.error('[Productivity] Firestore listener error:', err);
                await loadAllFromFirestore();
                refreshProductivityViews({ source: 'fallback-load' });
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            }
        });
    });
}

// --- Per-date data helpers ---

function getOrCreateDateEntry(dateKey) {
    if (!dataByDate.has(dateKey)) {
        dataByDate.set(dateKey, { ticketsData: null, callsData: null });
    }
    return dataByDate.get(dateKey);
}

function hasAnyData() {
    return hasAnyProductivityData(dataByDate);
}

// --- Productivity Calculation ---

function calculateProductivity() {
    return calculateProductivityOverview({
        dataByDate,
        agents: getUsersData(),
        start: dateStart,
        end: dateEnd,
        teamFilter: currentTeamFilter
    });
}

// --- Rendering ---

function renderProductivity() {
    const container = document.getElementById('productivityTableContainer');
    if (!container) return;

    if (!hasAnyData()) {
        container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 3rem;">${t('prod-upload-to-see')}</p>`;
        const statsContainer = document.getElementById('productivityStats');
        if (statsContainer) statsContainer.innerHTML = '';
        return;
    }

    const overview = calculateProductivity();
    const filtered = overview.rows; // filtering is now done inside calculateProductivity

    const statsContainer = document.getElementById('productivityStats');
    const view = buildProductivityOverviewView({
        rows: filtered,
        summary: overview.summary,
        daysInRange: getProductivityDaysInRange(dateStart, dateEnd),
        datesWithData: overview.datesWithData,
        t
    });

    if (statsContainer) statsContainer.innerHTML = view.statsHtml;
    container.innerHTML = view.contentHtml;
}

// --- Detail View (Per Agent Per Day) ---

function renderDetailView() {
    const container = document.getElementById('productivityTableContainer');
    const statsContainer = document.getElementById('productivityStats');
    if (!container) return;

    if (!hasAnyData()) {
        container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 3rem;">${t('prod-upload-to-see')}</p>`;
        if (statsContainer) statsContainer.innerHTML = '';
        return;
    }

    if (selectedAgents.size > 0) {
        pruneSelectedAgents();
    }

    if (!detailSearchCommitted || selectedAgents.size === 0) {
        container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 3rem;">${t('prod-select-agent')}</p>`;
        if (statsContainer) statsContainer.innerHTML = '';
        return;
    }

    const rows = buildProductivityDetailRows({
        dataByDate,
        agents: getUsersData(),
        selectedAgents,
        start: dateStart,
        end: dateEnd,
        teamFilter: 'all'
    });

    const view = buildProductivityDetailView({
        rows,
        selectedCount: selectedAgents.size,
        t
    });
    if (statsContainer) statsContainer.innerHTML = view.statsHtml;
    container.innerHTML = view.contentHtml;
}

// --- Agent Search UI ---

function setAgentSearchTerm(value) {
    const input = document.getElementById('prodAgentSearch');
    if (input) input.value = value;
}

function getSearchableAgents() {
    const agentNames = new Map();
    getUsersData().forEach(u => {
        if (!u?.fullName) return;
        const key = normalizeProductivityName(u.fullName);
        if (!agentNames.has(key)) {
            agentNames.set(key, { fullName: u.fullName, primaryTeam: u.primaryTeam, agent: u });
        }
    });

    const agents = [...agentNames.entries()].filter(([, info]) =>
        hasPerAgentProductivityEligibleDate(info.agent, dateStart, dateEnd)
    );
    agents.sort((a, b) => a[1].fullName.localeCompare(b[1].fullName));
    return agents;
}

function getAgentSearchResults(searchTerm = '') {
    const normalizedSearchTerm = String(searchTerm || '').trim();
    if (normalizedSearchTerm.length < PRODUCTIVITY_AGENT_SEARCH_MIN_LENGTH) return [];
    return filterProductivityAgentSelection(getSearchableAgents(), normalizedSearchTerm);
}

function renderAgentSearchResults(searchTerm = '') {
    const container = document.getElementById('agentChipsContainer');
    const countEl = document.getElementById('prodAgentCount');
    if (!container) return;

    const normalizedSearchTerm = String(searchTerm || '').trim();
    const shouldLoadAgents = normalizedSearchTerm.length >= PRODUCTIVITY_AGENT_SEARCH_MIN_LENGTH;
    const agents = shouldLoadAgents ? getSearchableAgents() : [];
    if (selectedAgents.size > 0) {
        pruneSelectedAgents();
    }

    const view = buildProductivityAgentSelectionView({
        agents,
        selectedAgents,
        searchTerm,
        minSearchLength: PRODUCTIVITY_AGENT_SEARCH_MIN_LENGTH,
        t
    });
    visibleAgentSearchResults = view.visibleAgents;

    container.innerHTML = view.html;
    bindProductivityAgentActions({
        container,
        chooseAgentSuggestion: agentActions.chooseAgentSuggestion
    });
    if (countEl) countEl.textContent = view.countText;
}

// --- View Management ---

export function renderCurrentView() {
    if (currentView === 'detail') {
        renderDetailView();
    } else {
        renderProductivity();
    }
}

function setView(view) {
    currentView = view;
    const overviewBtn = document.getElementById('viewOverview');
    const detailBtn = document.getElementById('viewDetail');
    const agentSection = document.getElementById('agentSelectorSection');
    const teamFilter = document.getElementById('productivityTeamFilter');

    if (overviewBtn) {
        overviewBtn.style.background = view === 'overview' ? 'var(--accent)' : 'var(--primary-dark)';
        overviewBtn.style.color = view === 'overview' ? '#000' : 'var(--text-secondary)';
        overviewBtn.style.fontWeight = view === 'overview' ? '600' : '400';
    }
    if (detailBtn) {
        detailBtn.style.background = view === 'detail' ? 'var(--accent)' : 'var(--primary-dark)';
        detailBtn.style.color = view === 'detail' ? '#000' : 'var(--text-secondary)';
        detailBtn.style.fontWeight = view === 'detail' ? '600' : '400';
    }
    if (agentSection) agentSection.style.display = view === 'detail' ? 'block' : 'none';
    if (teamFilter) teamFilter.style.display = view === 'detail' ? 'none' : '';

    if (view === 'detail') {
        detailSearchCommitted = false;
        renderAgentSearchResults(document.getElementById('prodAgentSearch')?.value || '');
    }
    renderCurrentView();
}

function refreshProductivityViews({ source = 'manual' } = {}) {
    renderUploadCalendar();
    updateUploadDateStatus();
    if (currentView === 'detail') renderAgentSearchResults(document.getElementById('prodAgentSearch')?.value || '');
    renderCurrentView();
    document.dispatchEvent(new CustomEvent('productivity-data-updated', { detail: { source } }));
}

export async function refreshProductivityData() {
    await loadAllFromFirestore();
    refreshProductivityViews({ source: 'manual-refresh' });
}

function exportCurrentSelection() {
    if (!hasAnyData()) {
        showTemporaryMessage(t('prod-no-results'), 'error');
        return;
    }

    try {
        if (currentView === 'detail') {
            if (selectedAgents.size > 0) {
                pruneSelectedAgents();
            }
            if (!detailSearchCommitted || selectedAgents.size === 0) {
                showTemporaryMessage(t('prod-select-agent'), 'error');
                return;
            }

            const detailRows = buildProductivityDetailRows({
                dataByDate,
                agents: getUsersData(),
                selectedAgents,
                start: dateStart,
                end: dateEnd,
                teamFilter: 'all'
            });
            if (detailRows.length === 0) {
                showTemporaryMessage(t('prod-no-results'), 'error');
                return;
            }

            const model = buildProductivitySelectionWorkbookModel({
                view: 'detail',
                detailRows,
                selectedCount: selectedAgents.size,
                start: dateStart,
                end: dateEnd,
                teamFilter: 'all',
                daysInRange: getProductivityDaysInRange(dateStart, dateEnd),
                datesWithData: new Set(detailRows.filter(row => row.hasData).map(row => row.dateKey)).size,
                t
            });
            exportProductivityWorkbook({ model });
            showTemporaryMessage(t('prod-export-success'), 'success', 1800);
            return;
        }

        const overview = calculateProductivity();
        if (!overview.rows || overview.rows.length === 0) {
            showTemporaryMessage(t('prod-no-results'), 'error');
            return;
        }

        const model = buildProductivitySelectionWorkbookModel({
            view: 'overview',
            rows: overview.rows,
            summary: overview.summary,
            start: dateStart,
            end: dateEnd,
            teamFilter: currentTeamFilter,
            daysInRange: getProductivityDaysInRange(dateStart, dateEnd),
            datesWithData: overview.datesWithData,
            t
        });
        exportProductivityWorkbook({ model });
        showTemporaryMessage(t('prod-export-success'), 'success', 1800);
    } catch (err) {
        console.error('[Productivity] Export error:', err);
        showTemporaryMessage(t('prod-export-error'), 'error');
    }
}

// --- Upload date UI ---

function updateUploadDateStatus() {
    const statusEl = document.getElementById('uploadDateStatus');
    const filesSection = document.getElementById('uploadFilesSection');
    if (!statusEl || !filesSection) return;

    const view = buildProductivityUploadDateStatusView({
        uploadDate,
        entry: dataByDate.get(uploadDate),
        formatDateDisplay,
        t
    });

    statusEl.style.display = view.statusDisplay;
    statusEl.innerHTML = view.html;
    filesSection.style.opacity = view.filesOpacity;
    filesSection.style.pointerEvents = view.filesPointerEvents;
}

function showUploadSuccess() {
    const statusEl = document.getElementById('uploadDateStatus');
    if (!statusEl) return;
    statusEl.style.display = 'block';
    statusEl.innerHTML = buildProductivityUploadSuccessView({
        uploadDate,
        entry: dataByDate.get(uploadDate),
        formatDateDisplay,
        t
    });
}

function setUploadDate(dateKey) {
    uploadDate = dateKey;
    const selectedDate = new Date(`${dateKey}T00:00:00`);
    if (!Number.isNaN(selectedDate.getTime())) {
        uploadCalendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    }

    const dateInput = document.getElementById('uploadDate');
    if (dateInput) dateInput.value = formatDateDisplay(dateKey);

    const tf = document.getElementById('ticketsFileName');
    const cf = document.getElementById('callsFileName');
    if (tf) tf.textContent = '';
    if (cf) cf.textContent = '';

    renderUploadCalendar();
    updateUploadDateStatus();
}

function renderUploadCalendar() {
    const panel = document.getElementById('uploadCalendarPanel');
    if (!panel) return;

    const view = buildProductivityUploadCalendarView({
        dataByDate,
        uploadDate,
        monthDate: uploadCalendarMonth,
        today: new Date(),
        lang: getLang(),
        formatDateDisplay
    });
    panel.innerHTML = view.html;

    bindProductivityUploadCalendarActions({
        panel,
        doc: document,
        selectUploadDate: setUploadDate,
        getUploadCalendarMonth: () => uploadCalendarMonth,
        setUploadCalendarMonth: value => {
            uploadCalendarMonth = value;
        },
        renderUploadCalendar,
        getUploadDate: () => uploadDate,
        exportProductivityDate: dateCommands.exportDate,
        removeProductivityDate: dateCommands.removeDate
    });
}

// --- Upload Handlers ---

function setupUploadArea(areaId, fileInputId, fileNameId, fileType, onParsed) {
    const area = document.getElementById(areaId);
    const fileInput = document.getElementById(fileInputId);
    const fileNameEl = document.getElementById(fileNameId);
    bindProductivityUploadArea({
        area,
        fileInput,
        fileNameEl,
        fileType,
        onFile: (file, nameEl, type) => processProductivityUploadFile({
            file,
            fileNameEl: nameEl,
            fileType: type,
            getUploadDate: () => uploadDate,
            getDateEntry: dateKey => dataByDate.get(dateKey),
            parseFile: onParsed,
            saveDate: saveToFirestore,
            refreshProductivityViews,
            showUploadSuccess,
            showTemporaryMessage,
            t,
            formatDateDisplay,
            logError: (...args) => console.error(...args)
        })
    });
}

// --- Initialization ---

export async function initializeProductivity() {
    // Upload date selector — inline calendar
    const dateInput = document.getElementById('uploadDate');
    if (dateInput && !uploadDate) {
        const today = new Date();
        uploadCalendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        uploadDate = formatProductivityDateKey(today);
        dateInput.value = formatDateDisplay(uploadDate);
    }

    // Load persisted data from Firestore and keep it fresh across sessions.
    await subscribeToProductivityData();

    if (dateInput) {
        setUploadDate(uploadDate);
    }

    // Setup uploads
    setupUploadArea('uploadTickets', 'ticketsFileInput', 'ticketsFileName', 'tickets', async (file, dateKey) => {
        const ticketsData = await parseTicketsXLSX(file);
        const entry = getOrCreateDateEntry(dateKey);
        entry.ticketsData = ticketsData;
        console.log(`[Productivity] Parsed ${ticketsData.size} agents from tickets file for ${dateKey}.`);
    });

    setupUploadArea('uploadCalls', 'callsFileInput', 'callsFileName', 'calls', async (file, dateKey) => {
        const text = await file.text();
        const callsData = parseCallsCSV(text);
        const entry = getOrCreateDateEntry(dateKey);
        entry.callsData = callsData;
        console.log(`[Productivity] Parsed ${callsData.size} agents from calls file for ${dateKey}.`);
    });

    const pickerInput = document.getElementById('productivityDateRange');
    productivityPicker = bindProductivityDateRangePicker({
        input: pickerInput,
        LitepickerAdapter: globalThis.Litepicker,
        setDateRange: (start, end) => {
            dateStart = start;
            dateEnd = end;
        },
        hasAnyData,
        renderCurrentView
    });

    bindProductivityControls({
        doc: document,
        getCurrentView: () => currentView,
        setView,
        renderAgentSearchResults,
        submitAgentSearch: agentActions.submitAgentSearch,
        markAgentSearchPending: () => {
            detailSearchCommitted = false;
        },
        setCurrentTeamFilter: value => {
            currentTeamFilter = value;
        },
        hasAnyData,
        renderCurrentView,
        refreshProductivityData,
        exportCurrentSelection: exportCurrentSelection,
        showTemporaryMessage,
        log: message => console.log(message)
    });

    renderUploadCalendar();
    updateUploadDateStatus();
    if (hasAnyData()) renderCurrentView();
}

export function cleanupProductivity() {
    if (unsubscribeFromProductivity) {
        unsubscribeFromProductivity();
        unsubscribeFromProductivity = null;
    }
    dataByDate.clear();
}

/**
 * Returns productivity trend data for the dashboard chart.
 * Groups uploaded work by customer team and divides it by eligible planner hours per team/day.
 * Returns { dates: string[], teams: { teamCode: number[] } }
 */
/**
 * Returns the average productivity (items/hour) across all teams for the last 7 days with data.
 * Returns { average: number|null, days: number }
 */
export function getAverageProductivity() {
    return buildAverageProductivitySummary({
        dataByDate,
        agents: getPlannerData(),
        getEligibleHoursForRange: getProductivityEligibleHoursForRange
    });
}

export function getProductivityTrendData(targetYear, targetMonth) {
    return buildProductivityTrendData({
        dataByDate,
        agents: getUsersData().length > 0 ? getUsersData() : getPlannerData(),
        targetYear,
        targetMonth,
        getEligibleHoursForTeamInRange: getProductivityEligibleHoursForTeamInRange
    });
}
