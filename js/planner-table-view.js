// js/planner-table-view.js

const DEFAULT_LABELS = {
    agent: 'Agent',
    hours: 'Hours',
    total: 'Total',
    weekTotal: 'Week Total',
    delete: 'Delete'
};

const DELETE_ICON_SVG = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
const CELL_PRESENTATION_STYLE = 'text-align: center; vertical-align: middle; font-variant-numeric: tabular-nums; font-feature-settings: &quot;tnum&quot; 1, &quot;kern&quot; 1; letter-spacing: 0; word-spacing: 0; text-align-last: center;';

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

function classAttribute(classNames) {
    return escapeHtml((classNames || []).filter(Boolean).join(' '));
}

function renderTextHeader(className, text) {
    return `<th class="${escapeHtml(className)}">${escapeHtml(text)}</th>`;
}

function renderPlannerHeader(headerModel, labels) {
    const className = classAttribute(headerModel.classNames);

    if (headerModel.type === 'week-total') {
        return `<th class="${className}">${escapeHtml(labels.weekTotal)}</th>`;
    }

    return `<th class="${className}">${escapeHtml(headerModel.dayName)}<br>${escapeHtml(headerModel.dayNumber)}</th>`;
}

function renderPlannerCell(cellModel) {
    if (cellModel.type === 'week-total') {
        return `<td class="${classAttribute(cellModel.classNames)}">${escapeHtml(cellModel.totalHoursLabel)}</td>`;
    }

    const classNames = [
        'planner-cell',
        'selectable',
        ...(cellModel.classNames || []),
        cellModel.sizeClass,
        cellModel.title ? 'has-note' : ''
    ].filter(Boolean);
    const titleAttribute = cellModel.title ? ` title="${escapeHtml(cellModel.title)}"` : '';
    const displayText = (cellModel.displayLines || []).map(escapeHtml).join('<br>');

    return [
        `<td class="${classAttribute(classNames)}"`,
        ` data-agent-id="${escapeHtml(cellModel.agentId)}"`,
        ` data-day="${escapeHtml(cellModel.dayIndex)}"`,
        ` data-month="${escapeHtml(cellModel.monthKey)}"`,
        ` data-raw-value="${escapeHtml(cellModel.rawValue)}"`,
        titleAttribute,
        ` style="${CELL_PRESENTATION_STYLE}">`,
        displayText,
        '</td>'
    ].join('');
}

function renderAgentRow(rowModel, labels) {
    const cells = (rowModel.cells || []).map(renderPlannerCell).join('');

    return [
        '<tr class="agent-row">',
        `<td class="agent-name" title="${escapeHtml(rowModel.agentName)}">`,
        '<div class="cell-content-wrapper">',
        `<span>${escapeHtml(rowModel.agentName)}</span>`,
        `<button class="delete-agent-btn" data-agent-id="${escapeHtml(rowModel.agentId)}" data-month-key="${escapeHtml(rowModel.deleteMonthKey)}" title="${escapeHtml(labels.delete)}">`,
        DELETE_ICON_SVG,
        '</button>',
        '</div>',
        '</td>',
        `<td class="agent-hours">${escapeHtml(rowModel.contractHoursLabel)}</td>`,
        cells,
        `<td class="agent-total">${escapeHtml(rowModel.totalHoursLabel)}</td>`,
        '</tr>'
    ].join('');
}

export function buildPlannerTableHtml(readModel = {}, labels = {}) {
    const normalizedLabels = normalizeLabels(labels);
    const headerCells = [
        renderTextHeader('agent-name-header', normalizedLabels.agent),
        renderTextHeader('hours-header', normalizedLabels.hours),
        ...(readModel.headers || []).map(header => renderPlannerHeader(header, normalizedLabels)),
        renderTextHeader('total-header', normalizedLabels.total)
    ].join('');
    const rows = (readModel.rows || []).map(row => renderAgentRow(row, normalizedLabels)).join('');

    return [
        '<table class="unified-planner-table">',
        '<thead>',
        `<tr class="date-header-row">${headerCells}</tr>`,
        '</thead>',
        `<tbody id="plannerTableBody">${rows}</tbody>`,
        '</table>'
    ].join('');
}

export function renderPlannerTableView(container, readModel = {}, labels = {}) {
    if (!container) return;

    container.classList?.toggle('few-days-view', Boolean(readModel.fewDaysView));
    container.innerHTML = buildPlannerTableHtml(readModel, labels);
}
