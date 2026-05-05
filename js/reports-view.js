// js/reports-view.js
import { formatPlannerHoursValue } from './schedule-semantics.js';

const DEFAULT_LABELS = {
    selectRange: 'Select a date range to generate reports.',
    noData: 'No planned data for the selected range.',
    hoursPerShop: 'Planned Hours per Shop',
    distribution: 'Agent Distribution per Shop',
    roleHours: 'Planned TL/QA Hours',
    roleDistribution: 'TL/QA Agent Distribution',
    shop: 'Shop',
    totalHours: 'Total Hours',
    agentCount: 'Nr. Agents',
    agentsHours: 'agents',
    hoursUnit: 'hours',
    total: 'TOTAL'
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function normalizeLabels(labels = {}) {
    return {
        ...DEFAULT_LABELS,
        ...labels
    };
}

function formatHours(value) {
    return escapeHtml(formatPlannerHoursValue(value));
}

function buildPlaceholderHtml(message) {
    return `<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
            ${escapeHtml(message)}
        </div>`;
}

function buildTitle(title, rangeLabel) {
    return `${escapeHtml(title)} &mdash; ${escapeHtml(rangeLabel)}`;
}

export function buildReportHoursTableRows(buckets = [], grandTotal = 0, labels = {}) {
    const normalizedLabels = normalizeLabels(labels);
    const bucketRows = buckets.map(bucket => `
            <tr>
                <td>${escapeHtml(bucket.name)}</td>
                <td style="color: var(--accent); font-weight: bold;">${formatHours(bucket.totalHours)}</td>
                <td>${escapeHtml(bucket.agentCount)}</td>
            </tr>`).join('');

    return `${bucketRows}
        <tr style="border-top: 2px solid var(--border); font-weight: bold;">
            <td>${escapeHtml(normalizedLabels.total)}</td>
            <td style="color: var(--accent);">${formatHours(grandTotal)}</td>
            <td></td>
        </tr>`;
}

export function buildReportDistributionCards(buckets = [], labels = {}) {
    const normalizedLabels = normalizeLabels(labels);

    return buckets.map(bucket => {
        const agentRows = (bucket.agents || []).map(agent => `
            <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                <span>${escapeHtml(agent.name)}</span>
                <span style="color: var(--text-secondary)">${formatHours(agent.hours)}h</span>
            </div>`).join('');

        return `
            <div class="stat-card">
                <h4 style="color: var(--accent); margin-bottom: 0.5rem;">${escapeHtml(bucket.name)}</h4>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                    ${escapeHtml(bucket.agentCount)} ${escapeHtml(normalizedLabels.agentsHours)} &middot; ${formatHours(bucket.totalHours)} ${escapeHtml(normalizedLabels.hoursUnit)}
                </div>
                <div style="max-height: 250px; overflow-y: auto; padding-right: 0.75rem;">
                    ${agentRows}
                </div>
            </div>`;
    }).join('');
}

function buildHoursSection(title, rangeLabel, buckets, grandTotal, labels, style = '') {
    if (!buckets.length) return '';

    return `
        <div class="chart-container"${style ? ` style="${escapeHtml(style)}"` : ''}>
            <h3 class="chart-title">${buildTitle(title, rangeLabel)}</h3>
            <table style="margin-top: 1rem;">
                <thead>
                    <tr>
                        <th>${escapeHtml(labels.shop)}</th>
                        <th>${escapeHtml(labels.totalHours)}</th>
                        <th>${escapeHtml(labels.agentCount)}</th>
                    </tr>
                </thead>
                <tbody>${buildReportHoursTableRows(buckets, grandTotal, labels)}</tbody>
            </table>
        </div>`;
}

function buildDistributionSection(title, rangeLabel, buckets, labels) {
    if (!buckets.length) return '';

    return `
        <div class="chart-container" style="margin-top: 1.5rem;">
            <h3 class="chart-title">${buildTitle(title, rangeLabel)}</h3>
            <div class="dashboard-grid" style="margin-top: 1rem;">
                ${buildReportDistributionCards(buckets, labels)}
            </div>
        </div>`;
}

export function buildReportsHtml(reportModel = null, labels = {}) {
    const normalizedLabels = normalizeLabels(labels);

    if (!reportModel) {
        return buildPlaceholderHtml(normalizedLabels.selectRange);
    }

    if (!reportModel.hasData) {
        return buildPlaceholderHtml(normalizedLabels.noData);
    }

    const rangeLabel = reportModel.range?.label || '';
    const shopBuckets = reportModel.shop?.buckets || [];
    const roleBuckets = reportModel.roles?.buckets || [];

    return [
        buildHoursSection(normalizedLabels.hoursPerShop, rangeLabel, shopBuckets, reportModel.shop?.grandTotal || 0, normalizedLabels),
        buildDistributionSection(normalizedLabels.distribution, rangeLabel, shopBuckets, normalizedLabels),
        buildHoursSection(normalizedLabels.roleHours, rangeLabel, roleBuckets, reportModel.roles?.grandTotal || 0, normalizedLabels, 'margin-top: 1.5rem;'),
        buildDistributionSection(normalizedLabels.roleDistribution, rangeLabel, roleBuckets, normalizedLabels)
    ].join('');
}

export function renderReportsView(container, reportModel = null, labels = {}) {
    if (!container) return;

    container.innerHTML = buildReportsHtml(reportModel, labels);
}
