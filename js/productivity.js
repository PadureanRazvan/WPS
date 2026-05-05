// js/productivity.js
import { db } from './firebase-config.js';
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { getPlannerData } from './planner.js';
import { getUsersData } from './users.js';
import { showTemporaryMessage } from './ui.js';
import { translations, normalizeTeamForDisplay, getMonthKey } from './config.js';
import { findProductivityAgent, hasPerAgentProductivityEligibleDate, normalizeProductivityName } from './productivity-metrics.js';
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
import { bindProductivityDateRangePicker } from './productivity-date-range-picker.js';
import { bindProductivityControls } from './productivity-controls.js';
import { bindProductivityAgentActions, createProductivityAgentActions } from './productivity-agent-actions.js';
import {
    buildProductivityAgentSelectionView,
    clearProductivityAgentSelection,
    selectAllProductivityAgents,
    toggleProductivityAgentSelection
} from './productivity-agent-selection-view.js';
import {
    calculateProductivityOverview,
    formatProductivityDateKey,
    getProductivityDaysInRange,
    getProductivityEligibleHoursForRange,
    getProductivityEligibleHoursForTeamInRange,
    hasAnyProductivityData,
    mergeProductivityDataForRange
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
let uploadCalendarMonth = new Date();
let unsubscribeFromProductivity = null;
const productivityStore = createProductivityFirestoreStore({
    db,
    firestore: { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot }
});
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
    getSelectedAgents: () => selectedAgents,
    setSelectedAgents: value => {
        selectedAgents = value;
    },
    getFilteredAgents,
    getAgentSearchTerm: () => document.getElementById('prodAgentSearch')?.value || '',
    toggleSelection: toggleProductivityAgentSelection,
    selectAllSelection: selectAllProductivityAgents,
    clearSelection: clearProductivityAgentSelection,
    renderAgentChips,
    renderCurrentView
});

// --- Name Normalization & Matching ---

function matchAgent(fileName) {
    return findProductivityAgent(fileName, getUsersData());
}

function pruneSelectedAgents() {
    const allowedAgents = new Set(getFilteredAgents().map(([normalizedName]) => normalizedName));
    selectedAgents.forEach(normalizedName => {
        if (!allowedAgents.has(normalizedName)) {
            selectedAgents.delete(normalizedName);
        }
    });
}

function entryHasTeamData(entry, teamCode) {
    if (!entry?.teams) return false;

    let hasTeam = false;
    entry.teams.forEach((count, team) => {
        if (count > 0 && normalizeTeamForDisplay(team) === teamCode) {
            hasTeam = true;
        }
    });
    return hasTeam;
}

function getAgentsWithUploadedTeamData(teamCode, start = dateStart, end = dateEnd) {
    const matchingAgents = new Set();
    const normalizedTeamCode = normalizeTeamForDisplay(teamCode);
    const { mergedTickets, mergedCalls } = getMergedDataForRange(start, end, { excludePerAgentRoles: true });

    const addMatchedAgent = (entry) => {
        if (!entryHasTeamData(entry, normalizedTeamCode)) return;
        const agent = matchAgent(entry.originalName);
        if (!agent) return;
        matchingAgents.add(normalizeProductivityName(agent.fullName));
    };

    mergedTickets.forEach(addMatchedAgent);
    mergedCalls.forEach(addMatchedAgent);
    return matchingAgents;
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

// --- Merge data across date range for productivity ---

function getMergedDataForRange(start, end, { excludePerAgentRoles = false } = {}) {
    return mergeProductivityDataForRange({
        dataByDate,
        agents: getUsersData(),
        start,
        end,
        excludePerAgentRoles
    });
}

// --- Productivity Calculation ---

function calculateProductivity() {
    return calculateProductivityOverview({
        dataByDate,
        agents: getUsersData(),
        start: dateStart,
        end: dateEnd,
        teamFilter: currentTeamFilter
    }).rows;
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

    const results = calculateProductivity();
    const filtered = results; // filtering is now done inside calculateProductivity

    const statsContainer = document.getElementById('productivityStats');
    const { datesWithData } = getMergedDataForRange(dateStart, dateEnd);
    const view = buildProductivityOverviewView({
        rows: filtered,
        daysInRange: getProductivityDaysInRange(dateStart, dateEnd),
        datesWithData,
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

    pruneSelectedAgents();

    if (!hasAnyData()) {
        container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 3rem;">${t('prod-upload-to-see')}</p>`;
        if (statsContainer) statsContainer.innerHTML = '';
        return;
    }

    if (selectedAgents.size === 0) {
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
        teamFilter: currentTeamFilter
    });

    const view = buildProductivityDetailView({
        rows,
        selectedCount: selectedAgents.size,
        t
    });
    if (statsContainer) statsContainer.innerHTML = view.statsHtml;
    container.innerHTML = view.contentHtml;
}

// --- Agent Chips UI ---

function getFilteredAgents() {
    const agentNames = new Map();
    dataByDate.forEach(entry => {
        const addFromMap = (map) => {
            if (!map) return;
            map.forEach((val, normalizedName) => {
                const agent = matchAgent(val.originalName);
                if (agent) {
                    const agentKey = normalizeProductivityName(agent.fullName);
                    if (agentNames.has(agentKey)) return;
                    agentNames.set(agentKey, { fullName: agent.fullName, primaryTeam: agent.primaryTeam, agent });
                }
            });
        };
        addFromMap(entry.ticketsData);
        addFromMap(entry.callsData);
    });

    getUsersData().forEach(u => {
        const key = normalizeProductivityName(u.fullName);
        if (!agentNames.has(key)) {
            agentNames.set(key, { fullName: u.fullName, primaryTeam: u.primaryTeam, agent: u });
        }
    });

    let agents = [...agentNames.entries()].filter(([, info]) =>
        hasPerAgentProductivityEligibleDate(info.agent, dateStart, dateEnd)
    );
    if (currentTeamFilter !== 'all') {
        const matchingAgents = getAgentsWithUploadedTeamData(currentTeamFilter);
        agents = agents.filter(([normalizedName]) => matchingAgents.has(normalizedName));
    }
    agents.sort((a, b) => a[1].fullName.localeCompare(b[1].fullName));
    return agents;
}

function renderAgentChips(searchTerm = '') {
    const container = document.getElementById('agentChipsContainer');
    const countEl = document.getElementById('prodAgentCount');
    if (!container) return;

    const agents = getFilteredAgents();
    pruneSelectedAgents();

    const view = buildProductivityAgentSelectionView({
        agents,
        selectedAgents,
        searchTerm,
        t
    });

    container.innerHTML = view.html;
    bindProductivityAgentActions({
        container,
        toggleAgent: agentActions.toggleAgent
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

    if (view === 'detail') {
        renderAgentChips();
    }
    renderCurrentView();
}

function refreshProductivityViews({ source = 'manual' } = {}) {
    renderUploadCalendar();
    updateUploadDateStatus();
    if (currentView === 'detail') renderAgentChips();
    renderCurrentView();
    document.dispatchEvent(new CustomEvent('productivity-data-updated', { detail: { source } }));
}

export async function refreshProductivityData() {
    await loadAllFromFirestore();
    refreshProductivityViews({ source: 'manual-refresh' });
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
        renderAgentChips,
        selectAllAgents: agentActions.selectAllAgents,
        deselectAllAgents: agentActions.deselectAllAgents,
        setCurrentTeamFilter: value => {
            currentTeamFilter = value;
        },
        hasAnyData,
        renderCurrentView,
        refreshProductivityData,
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
