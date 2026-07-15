// js/reports.js
import { getPlannerData } from './planner.js';
import { translations } from './config.js?v=2026.07.15.15';
import { buildReportReadModel } from './report-read-model.js?v=2026.07.15.15';
import { renderReportsView } from './reports-view.js?v=2026.07.15.15';

function getLang() { return localStorage.getItem('language') || 'ro'; }
function t(key) { const l = getLang(); return (translations[l] && translations[l][key]) || key; }

let reportsPicker = null;
let reportStart = null;
let reportEnd = null;

// --- Render ---
function getReportViewLabels() {
    return {
        selectRange: t('reports-select-range'),
        noData: t('reports-no-data'),
        hoursPerShop: t('reports-hours-per-shop'),
        distribution: t('reports-distribution'),
        roleHours: t('reports-role-hours'),
        roleDistribution: t('reports-role-distribution'),
        shop: t('reports-shop'),
        totalHours: t('reports-total-hours'),
        agentCount: t('reports-nr-agents'),
        agentsHours: t('reports-agents-hours'),
        hoursUnit: t('reports-hours-unit'),
        period: t('reports-period'),
        total: 'TOTAL'
    };
}

function renderReports() {
    const container = document.getElementById('reportsContent');
    if (!container) return;

    if (!reportStart || !reportEnd) {
        renderReportsView(container, null, getReportViewLabels());
        return;
    }

    const reportModel = buildReportReadModel(getPlannerData(), reportStart, reportEnd);
    renderReportsView(container, reportModel, getReportViewLabels());
}

// --- Initialize ---
export function initializeReports() {
    const input = document.getElementById('reportsDateRange');
    if (!input) return;
    const refreshBtn = document.getElementById('reportsRefreshBtn');

    // Default to current month
    const now = new Date();
    reportStart = new Date(now.getFullYear(), now.getMonth(), 1);
    reportEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month

    reportsPicker = new Litepicker({
        element: input,
        singleMode: false,
        numberOfMonths: 2,
        numberOfColumns: 2,
        format: 'DD.MM.YYYY',
        startDate: reportStart,
        endDate: reportEnd,
        setup: (picker) => {
            picker.on('selected', (date1, date2) => {
                reportStart = date1.dateInstance;
                reportEnd = date2.dateInstance;
                renderReports();
            });
        }
    });

    if (refreshBtn) {
        const label = t('reports-refresh');
        refreshBtn.title = label;
        refreshBtn.setAttribute('aria-label', label);
        refreshBtn.addEventListener('click', () => {
            refreshBtn.classList.add('is-loading');
            renderReports();
            setTimeout(() => refreshBtn.classList.remove('is-loading'), 350);
        });
    }

    // Initial render with default range
    renderReports();
}

export function cleanupReports() {
    if (reportsPicker) {
        reportsPicker.destroy();
        reportsPicker = null;
    }
}
