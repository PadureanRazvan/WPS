// js/reports.js
import { getPlannerData } from './planner.js';
import { translations, formatPlannerHoursValue, calculatePlannerReportData } from './config.js';

function getLang() { return localStorage.getItem('language') || 'ro'; }
function t(key) { const l = getLang(); return (translations[l] && translations[l][key]) || key; }

let reportsPicker = null;
let reportStart = null;
let reportEnd = null;

// --- Render ---
function sortBucketsByHours(data) {
    return Object.entries(data || {}).sort((a, b) => b[1].totalHours - a[1].totalHours);
}

function renderHoursTableRows(sortedBuckets, grandTotal) {
    let rows = '';
    for (const [name, data] of sortedBuckets) {
        rows += `
            <tr>
                <td>${name}</td>
                <td style="color: var(--accent); font-weight: bold;">${formatPlannerHoursValue(data.totalHours)}</td>
                <td>${data.agents.size}</td>
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

function renderDistributionCards(sortedBuckets) {
    let cards = '';

    for (const [name, data] of sortedBuckets) {
        const sortedAgents = [...data.agents.entries()].sort((a, b) => b[1] - a[1]);
        const agentRows = sortedAgents.map(([agentName, hours]) => `
            <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                <span>${agentName}</span>
                <span style="color: var(--text-secondary)">${formatPlannerHoursValue(hours)}h</span>
            </div>`).join('');

        cards += `
            <div class="stat-card">
                <h4 style="color: var(--accent); margin-bottom: 0.5rem;">${name}</h4>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                    ${data.agents.size} ${t('reports-agents-hours')} · ${formatPlannerHoursValue(data.totalHours)} ${t('reports-hours-unit')}
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

    const reportData = calculatePlannerReportData(getPlannerData(), reportStart, reportEnd);
    const sortedShops = sortBucketsByHours(reportData?.shopData);
    const sortedRoles = sortBucketsByHours(reportData?.roleData);

    if (!reportData || (sortedShops.length === 0 && sortedRoles.length === 0)) {
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
            ${t('reports-no-data')}
        </div>`;
        return;
    }

    // Format date range for title
    const fmt = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${day}.${m}.${y}`;
    };
    const rangeLabel = fmt(reportStart) + ' - ' + fmt(reportEnd);

    const shopHoursSection = sortedShops.length > 0 ? `
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
                <tbody>${renderHoursTableRows(sortedShops, reportData.shopGrandTotal)}</tbody>
            </table>
        </div>` : '';

    const shopDistributionSection = sortedShops.length > 0 ? `
        <div class="chart-container" style="margin-top: 1.5rem;">
            <h3 class="chart-title">${t('reports-distribution')} — ${rangeLabel}</h3>
            <div class="dashboard-grid" style="margin-top: 1rem;">
                ${renderDistributionCards(sortedShops)}
            </div>
        </div>` : '';

    const roleHoursSection = sortedRoles.length > 0 ? `
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
                <tbody>${renderHoursTableRows(sortedRoles, reportData.roleGrandTotal)}</tbody>
            </table>
        </div>` : '';

    const roleDistributionSection = sortedRoles.length > 0 ? `
        <div class="chart-container" style="margin-top: 1.5rem;">
            <h3 class="chart-title">${t('reports-role-distribution')} — ${rangeLabel}</h3>
            <div class="dashboard-grid" style="margin-top: 1rem;">
                ${renderDistributionCards(sortedRoles)}
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
