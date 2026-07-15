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
    period: 'Reporting period',
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
    return `<div class="reports-status" role="status">${escapeHtml(message)}</div>`;
}

export function buildReportHoursTableRows(buckets = [], grandTotal = 0, labels = {}) {
    const normalizedLabels = normalizeLabels(labels);
    const bucketRows = buckets.map(bucket => `
            <tr class="report-hours-row">
                <th scope="row">${escapeHtml(bucket.name)}</th>
                <td class="report-hours-value">${formatHours(bucket.totalHours)} <span class="report-cell-unit">${escapeHtml(normalizedLabels.hoursUnit)}</span></td>
                <td>${escapeHtml(bucket.agentCount)}</td>
            </tr>`).join('');

    return `${bucketRows}
        <tr class="report-hours-total">
            <th scope="row">${escapeHtml(normalizedLabels.total)}</th>
            <td class="report-hours-value">${formatHours(grandTotal)} <span class="report-cell-unit">${escapeHtml(normalizedLabels.hoursUnit)}</span></td>
            <td></td>
        </tr>`;
}

export function buildReportDistributionCards(buckets = [], labels = {}) {
    const normalizedLabels = normalizeLabels(labels);

    return buckets.map(bucket => {
        const agentRows = (bucket.agents || []).map(agent => `
                    <li class="report-agent-row">
                        <span class="report-agent-name">${escapeHtml(agent.name)}</span>
                        <span class="report-agent-hours">${formatHours(agent.hours)} <span>${escapeHtml(normalizedLabels.hoursUnit)}</span></span>
                    </li>`).join('');

        return `
            <details class="report-team-card" open>
                <summary class="report-team-summary">
                    <span class="report-team-identity">
                        <strong>${escapeHtml(bucket.name)}</strong>
                        <span class="report-team-meta">${escapeHtml(bucket.agentCount)} ${escapeHtml(normalizedLabels.agentsHours)} &middot; ${formatHours(bucket.totalHours)} ${escapeHtml(normalizedLabels.hoursUnit)}</span>
                    </span>
                    <span class="report-team-chevron" aria-hidden="true"></span>
                </summary>
                <ul class="report-agent-list">${agentRows}
                </ul>
            </details>`;
    }).join('');
}

function buildHoursPanel(title, rangeLabel, buckets, grandTotal, labels) {
    return `
        <div class="report-table-surface">
            <table class="report-hours-table">
                <caption class="visually-hidden">${escapeHtml(title)} &mdash; ${escapeHtml(rangeLabel)}</caption>
                <thead>
                    <tr>
                        <th scope="col">${escapeHtml(labels.shop)}</th>
                        <th scope="col">${escapeHtml(labels.totalHours)}</th>
                        <th scope="col">${escapeHtml(labels.agentCount)}</th>
                    </tr>
                </thead>
                <tbody>${buildReportHoursTableRows(buckets, grandTotal, labels)}</tbody>
            </table>
        </div>`;
}

function buildDistributionPanel(title, buckets, labels, titleId) {
    return `
        <section class="report-distribution" aria-labelledby="${titleId}">
            <h4 id="${titleId}" class="report-distribution-title">${escapeHtml(title)}</h4>
            <div class="report-distribution-grid">
                ${buildReportDistributionCards(buckets, labels)}
            </div>
        </section>`;
}

function buildReportDomain({ id, hoursTitle, distributionTitle, rangeLabel, buckets, grandTotal, labels }) {
    if (!buckets.length) return '';

    const titleId = `report-domain-${id}`;
    const distributionTitleId = `report-distribution-${id}`;

    return `
        <section class="report-domain" aria-labelledby="${titleId}">
            <header class="report-domain-header">
                <h3 id="${titleId}" class="report-domain-title">${escapeHtml(hoursTitle)}</h3>
                <div class="report-domain-total" aria-label="${escapeHtml(labels.totalHours)}: ${formatHours(grandTotal)} ${escapeHtml(labels.hoursUnit)}">
                    <span>${escapeHtml(labels.totalHours)}</span>
                    <strong>${formatHours(grandTotal)} <small>${escapeHtml(labels.hoursUnit)}</small></strong>
                </div>
            </header>
            <div class="report-domain-layout">
                ${buildHoursPanel(hoursTitle, rangeLabel, buckets, grandTotal, labels)}
                ${buildDistributionPanel(distributionTitle, buckets, labels, distributionTitleId)}
            </div>
        </section>`;
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

    return `
        <div class="reports-workspace">
            <header class="reports-workspace-header">
                <span>${escapeHtml(normalizedLabels.period)}</span>
                <strong>${escapeHtml(rangeLabel)}</strong>
            </header>
            ${buildReportDomain({
                id: 'shops',
                hoursTitle: normalizedLabels.hoursPerShop,
                distributionTitle: normalizedLabels.distribution,
                rangeLabel,
                buckets: shopBuckets,
                grandTotal: reportModel.shop?.grandTotal || 0,
                labels: normalizedLabels
            })}
            ${buildReportDomain({
                id: 'roles',
                hoursTitle: normalizedLabels.roleHours,
                distributionTitle: normalizedLabels.roleDistribution,
                rangeLabel,
                buckets: roleBuckets,
                grandTotal: reportModel.roles?.grandTotal || 0,
                labels: normalizedLabels
            })}
        </div>`;
}

export function renderReportsView(container, reportModel = null, labels = {}) {
    if (!container) return;

    container.innerHTML = buildReportsHtml(reportModel, labels);
}
