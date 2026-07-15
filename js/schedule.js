// js/schedule.js
//
// View/controller for the Orar (Schedule) section — Phase 2.
//
// Responsibilities:
//   - Pick the target month (selector); the choice drives import validation,
//     the template filename, the save target, and the overview.
//   - Download a CSV template (schedule-template.js).
//   - Import a CSV via file picker / drag-and-drop -> parse (schedule-import.js)
//     -> validate (schedule-validation.js) against the selected month -> render
//     a preview table with per-row status and a validation summary.
//   - Save a clean import to Firestore, one document per month
//     (schedule-persistence.js). Saving is enabled only for an import with zero
//     error rows and at least one saveable row.
//   - Render the overview (summary cards + sample table) from the SAVED schedule
//     for the selected month (schedule-overview.js), kept live via a Firestore
//     subscription. When no schedule is saved yet, an empty state is shown.
//
// Runtime data is obtained at use-time (not import-time): agents from users.js
// (preferred) falling back to planner.js, the language from localStorage, and
// toasts from ui.js.

import { translations } from './config.js';
import { showTemporaryMessage } from './ui.js?v=2026.07.16';
import { getUsersData } from './users.js?v=2026.07.16';
import { getPlannerData } from './planner.js';
import { db } from './firebase-config.js';
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

import {
    buildScheduleTemplateCsv,
    buildScheduleTemplateFilename,
    downloadScheduleCsv
} from './schedule-template.js';
import { parseScheduleCsv } from './schedule-import.js';
import { validateScheduleRows } from './schedule-validation.js';
import { createScheduleFirestoreStore } from './schedule-persistence.js';
import { buildScheduleOverview } from './schedule-overview.js';

// --- i18n helpers (replicate the app-wide local pattern; no exported getter) ---
function getLang() { return localStorage.getItem('language') || 'ro'; }
function t(key) {
    const l = getLang();
    return (translations[l] && translations[l][key]) || key;
}
// Tiny {placeholder} interpolation (the translation layer does not interpolate).
function tFormat(key, params = {}) {
    let text = t(key);
    Object.keys(params).forEach(name => {
        text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(params[name]));
    });
    return text;
}

function localeForLang(lang) {
    if (lang === 'en') return 'en-US';
    if (lang === 'it') return 'it-IT';
    return 'ro-RO';
}

// --- Current agents: Users data preferred, Planner data as fallback ---
// Mirrors the canonical combined pattern in productivity.js.
function getCurrentAgents() {
    const users = getUsersData();
    if (Array.isArray(users) && users.length > 0) return users;
    const planner = getPlannerData();
    return Array.isArray(planner) ? planner : [];
}

// --- Firestore store (injected adapter, mirrors productivity.js) ---
const scheduleStore = createScheduleFirestoreStore({
    db,
    firestore: { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot }
});

// --- Module state ---
let bindings = [];
let initialized = false;
let unsubscribeSchedule = null;
let savedByMonth = new Map();   // monthKey -> { month, rows, updatedAt }
let currentMonthKey = '';       // selected "YYYY-MM"
let pendingImport = null;       // { monthKey, rows: storableRow[] } from a clean import

// How many overview rows to show at a glance (a sample, not the full roster).
const OVERVIEW_SAMPLE_SIZE = 8;

function addListener(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    bindings.push({ target, type, handler, options });
}

// --- Small HTML helpers ---
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getEl(id) {
    return document.getElementById(id);
}

// =====================================================================
// Month helpers
// =====================================================================
function pad2(n) { return String(n).padStart(2, '0'); }

function currentMonthKeyFromClock() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// A descending window of recent month keys ending at the current month.
function buildMonthKeyWindow(count = 12) {
    const keys = [];
    const d = new Date();
    let year = d.getFullYear();
    let month = d.getMonth(); // 0-based
    for (let i = 0; i < count; i++) {
        keys.push(`${year}-${pad2(month + 1)}`);
        month -= 1;
        if (month < 0) { month = 11; year -= 1; }
    }
    return keys;
}

// Months offered in the selector: the recent window unioned with any month that
// already has a saved schedule (and the current selection), newest first.
function getMonthOptions() {
    const set = new Set(buildMonthKeyWindow(12));
    savedByMonth.forEach((_entry, key) => set.add(key));
    if (currentMonthKey) set.add(currentMonthKey);
    return Array.from(set).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

// Localized "Month YYYY" label, first letter upper-cased.
function formatMonthLabel(monthKey) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
    if (!m) return String(monthKey || '');
    const date = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    const label = date.toLocaleDateString(localeForLang(getLang()), { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatTimestamp(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(localeForLang(getLang()));
}

function populateMonthOptions() {
    const select = getEl('orarMonth');
    if (!select) return;

    const options = getMonthOptions();
    if (!currentMonthKey || !options.includes(currentMonthKey)) {
        currentMonthKey = options[0] || currentMonthKeyFromClock();
    }

    select.innerHTML = options.map(key => {
        const marker = savedByMonth.has(key) ? ' •' : '';
        const selected = key === currentMonthKey ? ' selected' : '';
        return `<option value="${escapeHtml(key)}"${selected}>${escapeHtml(formatMonthLabel(key) + marker)}</option>`;
    }).join('');
}

// =====================================================================
// CSV template download
// =====================================================================
function handleTemplateDownload() {
    try {
        const csv = buildScheduleTemplateCsv();
        const filename = buildScheduleTemplateFilename(currentMonthKey);
        downloadScheduleCsv({ filename, csv });
        showTemporaryMessage(t('orar-template-success'), 'success');
    } catch (err) {
        showTemporaryMessage(t('orar-import-error-read'), 'error');
    }
}

// =====================================================================
// Import flow: read file -> parse -> validate -> render preview
// =====================================================================
function handleFiles(fileList) {
    const file = fileList && fileList[0];
    if (!file) return;

    const fileNameEl = getEl('orarFileName');
    if (fileNameEl) fileNameEl.textContent = file.name;

    const reader = new FileReader();
    reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        processCsvText(text);
    };
    reader.onerror = () => {
        showTemporaryMessage(t('orar-import-error-read'), 'error');
    };
    reader.readAsText(file);
}

// Map a structural header error code to a user-facing toast message.
function reportHeaderError(headerError) {
    if (headerError === 'empty_file') {
        showTemporaryMessage(t('orar-import-error-empty'), 'error');
        return;
    }
    if (typeof headerError === 'string' && headerError.startsWith('missing_headers:')) {
        const cols = headerError.slice('missing_headers:'.length);
        showTemporaryMessage(tFormat('orar-import-error-headers', { cols }), 'error');
        return;
    }
    showTemporaryMessage(t('orar-import-error-read'), 'error');
}

// Turn a validated result into the flat row we persist (resolved agent identity
// preferred over the raw CSV cells).
function toStorableRow(result) {
    const row = result.row || {};
    const resolved = result.resolvedAgent || null;
    const agentName = (resolved && (resolved.fullName || resolved.name)) || row.agentName || '';
    const username = (resolved && resolved.username) || row.agentUsername || '';
    return {
        agentUsername: username,
        agentName,
        date: result.normalizedDate || row.date || '',
        startTime: row.startTime || '',
        endTime: row.endTime || '',
        breakMinutes: Number.isFinite(row.breakMinutes) ? row.breakMinutes : (Number(row.breakMinutes) || 0),
        workedMinutes: (result.workedMinutes === null || result.workedMinutes === undefined) ? 0 : result.workedMinutes,
        status: result.status,
        notes: row.notes || ''
    };
}

function processCsvText(text) {
    const parsed = parseScheduleCsv(text);
    if (parsed.headerError) {
        reportHeaderError(parsed.headerError);
        renderPreview(null);
        setPendingImport(null);
        return;
    }

    if (!parsed.rows.length) {
        showTemporaryMessage(t('orar-import-error-empty'), 'error');
        renderPreview(null);
        setPendingImport(null);
        return;
    }

    // Validate against the SELECTED month so dates outside it are flagged.
    const agents = getCurrentAgents();
    const { results, summary } = validateScheduleRows(parsed.rows, agents, { expectedMonth: currentMonthKey });

    renderPreview({ results, summary });

    // Only a clean import (no error rows, at least one saveable row) is savable.
    const storable = results
        .filter(r => r.status === 'ok' || r.status === 'dayoff')
        .map(toStorableRow);
    setPendingImport(summary.errors === 0 && storable.length > 0
        ? { monthKey: currentMonthKey, rows: storable }
        : null);

    showTemporaryMessage(
        tFormat('orar-import-done', {
            ok: summary.ok,
            errors: summary.errors,
            dayoff: summary.daysOff
        }),
        summary.errors > 0 ? 'info' : 'success'
    );
}

// --- Preview rendering ---
function statusLabel(status) {
    if (status === 'ok') return t('orar-status-ok');
    if (status === 'dayoff') return t('orar-status-dayoff');
    return t('orar-status-error');
}

function buildSummaryHtml(summary) {
    const parts = [
        { value: summary.ok, label: t('orar-summary-valid'), cls: 'is-ok' },
        { value: summary.errors, label: t('orar-summary-errors'), cls: 'is-error' },
        { value: summary.daysOff, label: t('orar-summary-dayoff'), cls: 'is-dayoff' }
    ];
    const chips = parts.map(p =>
        `<span class="orar-summary-chip ${p.cls}"><strong>${p.value}</strong> ${escapeHtml(p.label)}</span>`
    ).join('');
    return `<div class="orar-summary-chips">${chips}</div>`;
}

function buildPreviewTableHtml(results) {
    const headers = [
        t('orar-th-agent'),
        t('orar-th-username'),
        t('orar-th-date'),
        t('orar-th-start'),
        t('orar-th-end'),
        t('orar-th-break'),
        t('orar-th-status')
    ];
    const thead = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;

    const body = results.map(result => {
        const row = result.row || {};
        const rowClass = `orar-row-${result.status}`;
        const errorMsgs = (result.errors || [])
            .map(e => t(`orar-err-${e.code}`))
            .map(escapeHtml)
            .join('<br>');

        const statusCell =
            `<span class="orar-status-pill orar-status-${result.status}">${escapeHtml(statusLabel(result.status))}</span>` +
            (errorMsgs ? `<div class="orar-row-errors">${errorMsgs}</div>` : '');

        const agentName = (result.resolvedAgent && (result.resolvedAgent.fullName || result.resolvedAgent.name))
            || row.agentName
            || '';

        return `<tr class="${rowClass}">` +
            `<td class="orar-cell-left">${escapeHtml(agentName)}</td>` +
            `<td class="orar-cell-left">${escapeHtml(row.agentUsername || '')}</td>` +
            `<td>${escapeHtml(result.normalizedDate || row.date || '')}</td>` +
            `<td>${escapeHtml(row.startTime || '')}</td>` +
            `<td>${escapeHtml(row.endTime || '')}</td>` +
            `<td>${escapeHtml(Number.isFinite(row.breakMinutes) ? row.breakMinutes : (row.breakMinutes ?? ''))}</td>` +
            `<td class="orar-cell-status">${statusCell}</td>` +
            `</tr>`;
    }).join('');

    return `<table class="orar-preview-table">${thead}<tbody>${body}</tbody></table>`;
}

function renderPreview(data) {
    const section = getEl('orarPreviewSection');
    const container = getEl('orarPreviewContainer');
    const summaryEl = getEl('orarValidationSummary');

    if (!data || !data.results || !data.results.length) {
        if (summaryEl) { summaryEl.style.display = 'none'; summaryEl.innerHTML = ''; }
        if (section) section.style.display = 'none';
        if (container) {
            container.innerHTML = `<p class="orar-empty">${escapeHtml(t('orar-no-rows'))}</p>`;
        }
        return;
    }

    if (summaryEl) {
        summaryEl.innerHTML = buildSummaryHtml(data.summary);
        summaryEl.style.display = '';
    }
    if (section) section.style.display = '';
    if (container) container.innerHTML = buildPreviewTableHtml(data.results);
}

// =====================================================================
// Save: persist the pending clean import for the selected month
// =====================================================================
function setPendingImport(value) {
    pendingImport = value;
    updateSaveButtonState();
}

function updateSaveButtonState() {
    const btn = getEl('orarSaveBtn');
    if (!btn) return;
    const canSave = !!(pendingImport && pendingImport.rows && pendingImport.rows.length > 0);
    btn.disabled = !canSave;
    btn.setAttribute('aria-disabled', String(!canSave));
}

async function handleSaveImport() {
    if (!pendingImport || !pendingImport.rows.length) {
        showTemporaryMessage(t('orar-save-empty'), 'info');
        return;
    }

    const monthKey = pendingImport.monthKey || currentMonthKey;
    const monthLabel = formatMonthLabel(monthKey);

    // Confirm before overwriting an existing saved month.
    if (savedByMonth.has(monthKey) && typeof window !== 'undefined' && typeof window.confirm === 'function') {
        if (!window.confirm(tFormat('orar-save-confirm', { month: monthLabel }))) return;
    }

    const rows = pendingImport.rows;
    const btn = getEl('orarSaveBtn');
    if (btn) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }

    try {
        await scheduleStore.saveMonth(monthKey, rows);
        showTemporaryMessage(tFormat('orar-save-success', { month: monthLabel }), 'success');

        // Clear the import preview; the live snapshot refreshes the overview.
        pendingImport = null;
        renderPreview(null);
        const fileNameEl = getEl('orarFileName');
        if (fileNameEl) fileNameEl.textContent = '';
        currentMonthKey = monthKey; // keep the overview on the month we just saved
    } catch (err) {
        console.error('[Schedule] Firestore save error:', err);
        showTemporaryMessage(t('orar-save-error'), 'error');
    } finally {
        updateSaveButtonState();
    }
}

// =====================================================================
// Overview (real, saved-schedule data for the selected month)
// =====================================================================
function buildStatCardHtml(label, value) {
    return `<div class="stat-card">` +
        `<div class="stat-label">${escapeHtml(label)}</div>` +
        `<div class="stat-value">${escapeHtml(value)}</div>` +
        `</div>`;
}

function buildOverviewStatsHtml(metrics) {
    return [
        buildStatCardHtml(t('orar-overview-agents'), String(metrics.agentsScheduled)),
        buildStatCardHtml(t('orar-overview-avg-start'), metrics.avgStart || '—'),
        buildStatCardHtml(t('orar-overview-total-hours'), `${metrics.totalShiftHours}h`),
        buildStatCardHtml(t('orar-overview-coverage'), `${metrics.coveragePct}%`)
    ].join('');
}

function buildOverviewTableHtml(rows) {
    const headers = [
        t('orar-th-agent'),
        t('orar-th-username'),
        t('orar-th-date'),
        t('orar-th-start'),
        t('orar-th-end'),
        t('orar-th-break'),
        t('orar-th-worked')
    ];
    const thead = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
    const body = rows.map(row => {
        const worked = row.status === 'dayoff' ? '—' : `${row.workedHours}h`;
        return `<tr class="orar-row-${row.status}">` +
            `<td class="orar-cell-left">${escapeHtml(row.agentName || '')}</td>` +
            `<td class="orar-cell-left">${escapeHtml(row.agentUsername || '')}</td>` +
            `<td>${escapeHtml(row.date || '')}</td>` +
            `<td>${escapeHtml(row.startTime || '—')}</td>` +
            `<td>${escapeHtml(row.endTime || '—')}</td>` +
            `<td>${escapeHtml(row.breakMinutes)}</td>` +
            `<td>${escapeHtml(worked)}</td>` +
            `</tr>`;
    }).join('');
    return `<table class="orar-overview-table">${thead}<tbody>${body}</tbody></table>`;
}

function renderOverview() {
    const statsEl = getEl('orarStats');
    const tableEl = getEl('orarOverviewContainer');
    const infoEl = getEl('orarOverviewInfo');
    if (!statsEl && !tableEl) return;

    const saved = savedByMonth.get(currentMonthKey);

    if (!saved || !saved.rows || !saved.rows.length) {
        if (statsEl) statsEl.innerHTML = '';
        if (tableEl) tableEl.innerHTML = `<p class="orar-empty">${escapeHtml(t('orar-overview-empty'))}</p>`;
        if (infoEl) infoEl.textContent = '';
        return;
    }

    const roster = getCurrentAgents();
    const { rows, metrics } = buildScheduleOverview(saved.rows, { rosterSize: roster.length });

    if (statsEl) statsEl.innerHTML = buildOverviewStatsHtml(metrics);
    if (tableEl) {
        const sample = rows.slice(0, OVERVIEW_SAMPLE_SIZE);
        let html = buildOverviewTableHtml(sample);
        if (rows.length > sample.length) {
            html += `<p class="orar-overview-count" style="margin-top:0.75rem;color:var(--text-secondary);font-size:0.85rem;text-align:right;">${sample.length} / ${rows.length}</p>`;
        }
        tableEl.innerHTML = html;
    }
    if (infoEl) {
        const stamp = formatTimestamp(saved.updatedAt);
        infoEl.textContent = stamp ? tFormat('orar-overview-updated', { date: stamp }) : '';
    }
}

// =====================================================================
// Firestore subscription (live saved-schedule overview)
// =====================================================================
function applySnapshot(dataByMonth) {
    savedByMonth = dataByMonth instanceof Map ? dataByMonth : new Map();
    populateMonthOptions();
    renderOverview();
}

function subscribeToSchedule() {
    if (unsubscribeSchedule) { unsubscribeSchedule(); unsubscribeSchedule = null; }

    unsubscribeSchedule = scheduleStore.subscribe({
        onData(result) {
            applySnapshot(result.dataByMonth);
        },
        async onError(err) {
            console.error('[Schedule] Firestore listener error:', err);
            try {
                const result = await scheduleStore.loadAll();
                applySnapshot(result.dataByMonth);
            } catch (loadErr) {
                console.error('[Schedule] Firestore load error:', loadErr);
            }
        }
    });
}

// =====================================================================
// Drag & drop wiring
// =====================================================================
function preventDefaults(event) {
    event.preventDefault();
    event.stopPropagation();
}

function onDropAreaClick() {
    const input = getEl('orarFileInput');
    if (input) input.click();
}

function onFileInputChange(event) {
    handleFiles(event.target.files);
    // Reset so selecting the same file again re-triggers change.
    event.target.value = '';
}

function onDragEnterOver(event) {
    preventDefaults(event);
    const dropArea = getEl('orarDropArea');
    if (dropArea) dropArea.classList.add('orar-dragover');
}

function onDragLeave(event) {
    preventDefaults(event);
    const dropArea = getEl('orarDropArea');
    if (dropArea) dropArea.classList.remove('orar-dragover');
}

function onDrop(event) {
    preventDefaults(event);
    const dropArea = getEl('orarDropArea');
    if (dropArea) dropArea.classList.remove('orar-dragover');
    const dt = event.dataTransfer;
    if (dt && dt.files && dt.files.length) handleFiles(dt.files);
}

// Changing month invalidates any in-progress import (it was validated against
// the previously selected month), so clear the preview and refresh the overview.
function onMonthChange(event) {
    currentMonthKey = (event.target && event.target.value) || currentMonthKey;
    setPendingImport(null);
    renderPreview(null);
    const fileNameEl = getEl('orarFileName');
    if (fileNameEl) fileNameEl.textContent = '';
    renderOverview();
}

// =====================================================================
// Lifecycle
// =====================================================================
export function initializeSchedule() {
    if (initialized) return;
    const section = getEl('orar');
    if (!section) return; // section not present; nothing to wire
    initialized = true;

    currentMonthKey = currentMonthKeyFromClock();

    // Controls.
    addListener(getEl('orarTemplateBtn'), 'click', handleTemplateDownload);
    addListener(getEl('orarSaveBtn'), 'click', handleSaveImport);
    addListener(getEl('orarMonth'), 'change', onMonthChange);

    // File input + drop area.
    addListener(getEl('orarFileInput'), 'change', onFileInputChange);
    const dropArea = getEl('orarDropArea');
    addListener(dropArea, 'click', onDropAreaClick);
    ['dragenter', 'dragover'].forEach(type => addListener(dropArea, type, onDragEnterOver));
    addListener(dropArea, 'dragleave', onDragLeave);
    addListener(dropArea, 'drop', onDrop);

    populateMonthOptions();
    updateSaveButtonState();
    renderOverview();        // empty state until the first snapshot arrives
    subscribeToSchedule();   // live saved-schedule overview
}

export function cleanupSchedule() {
    if (unsubscribeSchedule) { unsubscribeSchedule(); unsubscribeSchedule = null; }
    bindings.forEach(({ target, type, handler, options }) => {
        if (target) target.removeEventListener(type, handler, options);
    });
    bindings = [];
    savedByMonth = new Map();
    pendingImport = null;
    currentMonthKey = '';
    initialized = false;
}
