// js/reports.js
import { getPlannerData } from './planner.js';
import { translations, formatPlannerHoursValue } from './config.js';
import { buildReportReadModel } from './report-read-model.js';

function getLang() { return localStorage.getItem('language') || 'ro'; }
function t(key) { const l = getLang(); return (translations[l] && translations[l][key]) || key; }

let reportsPicker = null;
let reportStart = null;
let reportEnd = null;

// --- Render ---
function renderHoursTableRows(buckets, grandTotal) {
    let rows = '';
    for (const bucket of buckets) {
        rows += `
            <tr>
                <td>${bucket.name}</td>
                <td style="color: var(--accent); font-weight: bold;">${formatPlannerHoursValue(bucket.totalHours)}</td>
                <td>${bucket.agentCount}</td>
            </tr>`;
    }

    rows += `
        <tr style="border-top: 2px solid var(--border); font-weight: bold;">
            <td>TOTAL</td>
            <td style="color: var(--accent);">${formatPlannerHoursValue(grandTotal)}</td>
            <td></td>
        </tr>`;

    return rows;
}

function renderDistributionCards(buckets) {
    let cards = '';

    for (const bucket of buckets) {
        const agentRows = bucket.agents.map(agent => `
            <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                <span>${agent.name}</span>
                <span style="color: var(--text-secondary)">${formatPlannerHoursValue(agent.hours)}h</span>
            </div>`).join('');

        cards += `
            <div class="stat-card">
                <h4 style="color: var(--accent); margin-bottom: 0.5rem;">${bucket.name}</h4>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                    ${bucket.agentCount} ${t('reports-agents-hours')} · ${formatPlannerHoursValue(bucket.totalHours)} ${t('reports-hours-unit')}
                </div>
                <div style="max-height: 250px; overflow-y: auto; padding-right: 0.75rem;">
                    ${agentRows}
                </div>
            </div>`;
    }

    return cards;
}

function renderReports() {
    const container = document.getElementById('reportsContent');
    if (!container) return;

    if (!reportStart || !reportEnd) {
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
            ${t('reports-select-range')}
        </div>`;
        return;
    }

    const reportModel = buildReportReadModel(getPlannerData(), reportStart, reportEnd);
    const shopBuckets = reportModel.shop.buckets;
    const roleBuckets = reportModel.roles.buckets;

    if (!reportModel.hasData) {
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
            ${t('reports-no-data')}
        </div>`;
        return;
    }

    const rangeLabel = reportModel.range.label;

    const shopHoursSection = shopBuckets.length > 0 ? `
        <div class="chart-container">
            <h3 class="chart-title">${t('reports-hours-per-shop')} — ${rangeLabel}</h3>
            <table style="margin-top: 1rem;">
                <thead>
                    <tr>
                        <th>${t('reports-shop')}</th>
                        <th>${t('reports-total-hours')}</th>
                        <th>${t('reports-nr-agents')}</th>
                    </tr>
                </thead>
                <tbody>${renderHoursTableRows(shopBuckets, reportModel.shop.grandTotal)}</tbody>
            </table>
        </div>` : '';

    const shopDistributionSection = shopBuckets.length > 0 ? `
        <div class="chart-container" style="margin-top: 1.5rem;">
            <h3 class="chart-title">${t('reports-distribution')} — ${rangeLabel}</h3>
            <div class="dashboard-grid" style="margin-top: 1rem;">
                ${renderDistributionCards(shopBuckets)}
            </div>
        </div>` : '';

    const roleHoursSection = roleBuckets.length > 0 ? `
        <div class="chart-container" style="margin-top: 1.5rem;">
            <h3 class="chart-title">${t('reports-role-hours')} — ${rangeLabel}</h3>
            <table style="margin-top: 1rem;">
                <thead>
                    <tr>
                        <th>${t('reports-shop')}</th>
                        <th>${t('reports-total-hours')}</th>
                        <th>${t('reports-nr-agents')}</th>
                    </tr>
                </thead>
                <tbody>${renderHoursTableRows(roleBuckets, reportModel.roles.grandTotal)}</tbody>
            </table>
        </div>` : '';

    const roleDistributionSection = roleBuckets.length > 0 ? `
        <div class="chart-container" style="margin-top: 1.5rem;">
            <h3 class="chart-title">${t('reports-role-distribution')} — ${rangeLabel}</h3>
            <div class="dashboard-grid" style="margin-top: 1rem;">
                ${renderDistributionCards(roleBuckets)}
            </div>
        </div>` : '';

    container.innerHTML = `
        ${shopHoursSection}
        ${shopDistributionSection}
        ${roleHoursSection}
        ${roleDistributionSection}`;
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
