// js/schedule.js
//
// View/controller for the Orar (Schedule) section — Phase 1 (ADDITIVE wiring only).
//
// Responsibilities:
//   - Download a CSV template (schedule-template.js).
//   - Import a CSV via file picker / drag-and-drop -> parse (schedule-import.js)
//     -> validate (schedule-validation.js) -> render a preview table with a
//     per-row status and a validation summary.
//   - Render a stylish DEMO overview (summary cards + sample table) from
//     buildScheduleDemoData (schedule-demo-data.js), clearly labelled as sample.
//   - Show an info/roadmap panel (static markup already in index.html).
//
// HARD CONSTRAINTS (Phase 1):
//   - No Firestore / no persistence. The "Save import" button is present but
//     permanently DISABLED with a Phase 2 label/tooltip.
//   - No changes to Planner/Productivity/Users business logic. Demo data is
//     DISPLAY-ONLY and never passed back into other modules.
//
// Runtime data is obtained at use-time (not import-time) via the contracts in
// the recon: agents from users.js (preferred) falling back to planner.js, the
// language from localStorage, and toasts from ui.js.

import { translations } from './config.js';
import { showTemporaryMessage } from './ui.js';
import { getUsersData } from './users.js';
import { getPlannerData } from './planner.js';

import {
    buildScheduleTemplateCsv,
    buildScheduleTemplateFilename,
    downloadScheduleCsv
} from './schedule-template.js';
import { parseScheduleCsv } from './schedule-import.js';
import { validateScheduleRows } from './schedule-validation.js';
import { buildScheduleDemoData } from './schedule-demo-data.js';

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

// --- Current agents: Users data preferred, Planner data as fallback ---
// Mirrors the canonical combined pattern in productivity.js.
function getCurrentAgents() {
    const users = getUsersData();
    if (Array.isArray(users) && users.length > 0) return users;
    const planner = getPlannerData();
    return Array.isArray(planner) ? planner : [];
}

// --- Module-local listener bookkeeping so cleanup can remove everything ---
let bindings = [];
let initialized = false;

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
// CSV template download
// =====================================================================
function handleTemplateDownload() {
    try {
        const csv = buildScheduleTemplateCsv();
        // No month context yet in Phase 1; use the generic template filename.
        const filename = buildScheduleTemplateFilename();
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

function processCsvText(text) {
    const parsed = parseScheduleCsv(text);
    if (parsed.headerError) {
        reportHeaderError(parsed.headerError);
        renderPreview(null);
        return;
    }

    if (!parsed.rows.length) {
        showTemporaryMessage(t('orar-import-error-empty'), 'error');
        renderPreview(null);
        return;
    }

    // Infer the expected month from the first row's month column when present,
    // so the validator can flag rows whose date falls in a different month.
    const expectedMonth = (parsed.rows[0] && parsed.rows[0].month) || '';

    const agents = getCurrentAgents();
    const { results, summary } = validateScheduleRows(parsed.rows, agents, { expectedMonth });

    renderPreview({ results, summary });

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
            `<td>${escapeHtml(row.date || '')}</td>` +
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
// Demo overview (DISPLAY-ONLY)
// =====================================================================
function buildStatCardHtml(label, value, detail) {
    return `<div class="stat-card">` +
        `<div class="stat-label">${escapeHtml(label)}</div>` +
        `<div class="stat-value">${escapeHtml(value)}</div>` +
        (detail ? `<div class="stat-detail">${escapeHtml(detail)}</div>` : '') +
        `</div>`;
}

function buildDemoStatsHtml(metrics) {
    return [
        buildStatCardHtml(t('orar-overview-agents'), String(metrics.agentsScheduled), ''),
        buildStatCardHtml(t('orar-overview-avg-start'), metrics.avgStart || '—', ''),
        buildStatCardHtml(t('orar-overview-total-hours'), `${metrics.totalShiftHours}h`, ''),
        buildStatCardHtml(t('orar-overview-coverage'), `${metrics.coveragePct}%`, '')
    ].join('');
}

function buildDemoTableHtml(rows) {
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
    const body = rows.map(row =>
        `<tr>` +
        `<td class="orar-cell-left">${escapeHtml(row.agentName || '')}</td>` +
        `<td class="orar-cell-left">${escapeHtml(row.username || '')}</td>` +
        `<td>${escapeHtml(row.date || '')}</td>` +
        `<td>${escapeHtml(row.startTime || '')}</td>` +
        `<td>${escapeHtml(row.endTime || '')}</td>` +
        `<td>${escapeHtml(row.breakMinutes)}</td>` +
        `<td>${escapeHtml(row.workedHours)}h</td>` +
        `</tr>`
    ).join('');
    return `<table class="orar-demo-table">${thead}<tbody>${body}</tbody></table>`;
}

// The overview shows only a small sample of shifts, not the whole roster.
const DEMO_SAMPLE_SIZE = 8;

function renderDemoOverview() {
    const statsEl = getEl('orarStats');
    const tableEl = getEl('orarDemoContainer');
    if (!statsEl && !tableEl) return;

    // Be defensive when agents is empty: buildScheduleDemoData fabricates its
    // own fallback roster, so an empty array still yields a populated demo.
    const agents = getCurrentAgents();
    const { rows, metrics } = buildScheduleDemoData(agents);

    if (statsEl) statsEl.innerHTML = buildDemoStatsHtml(metrics);
    if (tableEl) {
        const sample = rows.slice(0, DEMO_SAMPLE_SIZE);
        let html = buildDemoTableHtml(sample);
        if (rows.length > sample.length) {
            html += `<p class="orar-demo-count" style="margin-top:0.75rem;color:var(--text-secondary);font-size:0.85rem;text-align:right;">${sample.length} / ${rows.length}</p>`;
        }
        tableEl.innerHTML = html;
    }
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

// =====================================================================
// Lifecycle
// =====================================================================
export function initializeSchedule() {
    if (initialized) return;
    const section = getEl('orar');
    if (!section) return; // section not present; nothing to wire
    initialized = true;

    // Template + (disabled) save buttons.
    addListener(getEl('orarTemplateBtn'), 'click', handleTemplateDownload);
    const saveBtn = getEl('orarSaveBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.setAttribute('aria-disabled', 'true');
        if (!saveBtn.title) saveBtn.title = t('orar-phase2-tooltip');
    }

    // File input + drop area.
    addListener(getEl('orarFileInput'), 'change', onFileInputChange);
    const dropArea = getEl('orarDropArea');
    addListener(dropArea, 'click', onDropAreaClick);
    ['dragenter', 'dragover'].forEach(type => addListener(dropArea, type, onDragEnterOver));
    addListener(dropArea, 'dragleave', onDragLeave);
    addListener(dropArea, 'drop', onDrop);

    // Initial demo overview render.
    renderDemoOverview();
}

export function cleanupSchedule() {
    bindings.forEach(({ target, type, handler, options }) => {
        if (target) target.removeEventListener(type, handler, options);
    });
    bindings = [];
    initialized = false;
}
