import { formatPlannerHoursValue } from './config.js';

function productivityColor(hours, productivity) {
    if (hours === 0) return 'var(--text-secondary)';
    if (productivity >= 5) return 'var(--success)';
    if (productivity >= 3) return 'var(--warning)';
    return 'var(--error)';
}

function averageColor(avgDisplay) {
    if (avgDisplay !== 'N/A' && avgDisplay >= 5) return 'var(--success)';
    if (avgDisplay !== 'N/A' && avgDisplay >= 3) return 'var(--warning)';
    return 'var(--error)';
}

function productivityDisplay(hours, productivity) {
    return hours > 0 ? productivity.toFixed(2) : 'N/A';
}

function uploadedTeamTooltip(row) {
    return [...(row.teams || new Map()).entries()].map(([team, count]) => `${team}: ${count}`).join(', ');
}

function centeredMessageHtml(message, padding = '2rem') {
    return `<p style="color: var(--text-secondary); text-align: center; padding: ${padding};">${message}</p>`;
}

function statCard(label, value, detail = '', valueStyle = '') {
    return `
            <div class="stat-card">
                <div class="stat-label">${label}</div>
                <div class="stat-value"${valueStyle ? ` style="${valueStyle}"` : ''}>${value}</div>
                ${detail ? `<div class="stat-detail">${detail}</div>` : ''}
            </div>`;
}

export function buildProductivityOverviewView({
    rows = [],
    summary = null,
    daysInRange = 0,
    datesWithData = 0,
    t = key => key
} = {}) {
    const totalAgents = rows.length;
    const totalTickets = summary ? summary.tickets : rows.reduce((sum, row) => sum + row.tickets, 0);
    const totalCalls = summary ? summary.calls : rows.reduce((sum, row) => sum + row.calls, 0);
    const totalAll = summary ? summary.total : rows.reduce((sum, row) => sum + row.total, 0);
    const totalHours = summary ? summary.hours : rows.reduce((sum, row) => sum + row.hours, 0);
    const averageProductivity = summary ? summary.productivity : (totalHours > 0 ? totalAll / totalHours : null);
    const avgProd = averageProductivity !== null ? averageProductivity.toFixed(2) : 'N/A';
    const rangeLabel = daysInRange === 1 ? `1 ${t('prod-day')}` : `${daysInRange} ${t('prod-days')}`;

    const statsHtml = `
            ${statCard(
                t('prod-agents-processed'),
                totalAgents,
                `${rangeLabel} (${datesWithData} ${t('prod-with-data')})`
            )}
            ${statCard(t('prod-tickets-resolved'), totalTickets, t('prod-from-xlsx'))}
            ${statCard(t('prod-calls-answered'), totalCalls, t('prod-from-csv'))}
            ${statCard(
                t('prod-average'),
                avgProd,
                t('prod-formula'),
                `color: ${averageColor(avgProd)}`
            )}
        `;

    if (rows.length === 0) {
        return {
            statsHtml,
            contentHtml: centeredMessageHtml(t('prod-no-agents'))
        };
    }

    let contentHtml = `<table>
        <thead>
            <tr>
                <th>#</th>
                <th>${t('th-agent')}</th>
                <th>${t('th-teams')}</th>
                <th>${t('th-tickets')}</th>
                <th>${t('th-calls')}</th>
                <th>${t('th-total')}</th>
                <th>${t('th-hours-worked')}</th>
                <th>${t('th-productivity')}</th>
            </tr>
        </thead>
        <tbody>`;

    rows.forEach((row, index) => {
        const prodColor = productivityColor(row.hours, row.productivity);
        const prodDisplay = productivityDisplay(row.hours, row.productivity);
        const teamTooltip = uploadedTeamTooltip(row);

        contentHtml += `<tr>
            <td style="color: var(--text-secondary);">${index + 1}</td>
            <td style="font-weight: 500;">${row.name}</td>
            <td title="${teamTooltip}"><span style="background: rgba(99,102,241,0.15); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; letter-spacing: 0.5px;">${row.teamsDisplay}</span></td>
            <td>${row.tickets}</td>
            <td>${row.calls}</td>
            <td style="font-weight: bold;">${row.total}</td>
            <td>${formatPlannerHoursValue(row.hours)}h</td>
            <td style="color: ${prodColor}; font-weight: bold;">${prodDisplay}</td>
        </tr>`;
    });

    contentHtml += '</tbody></table>';
    return { statsHtml, contentHtml };
}

export function buildProductivityDetailView({
    rows = [],
    selectedCount = 0,
    t = key => key
} = {}) {
    const daysWithData = new Set(rows.filter(row => row.hasData).map(row => row.dateKey)).size;
    const totalTickets = rows.reduce((sum, row) => sum + row.tickets, 0);
    const totalCalls = rows.reduce((sum, row) => sum + row.calls, 0);
    const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
    const totalAll = totalTickets + totalCalls;
    const avgProd = totalHours > 0 ? (totalAll / totalHours).toFixed(2) : 'N/A';

    const statsHtml = `
            ${statCard(
                t('prod-agents-selected'),
                selectedCount,
                `${daysWithData} ${t('prod-days-with-data')}`
            )}
            ${statCard(t('prod-total-tickets'), totalTickets)}
            ${statCard(t('prod-total-calls'), totalCalls)}
            ${statCard(
                t('prod-average'),
                avgProd,
                t('prod-formula'),
                `color: ${averageColor(avgProd)}`
            )}
        `;

    if (rows.length === 0) {
        return {
            statsHtml,
            contentHtml: centeredMessageHtml(t('prod-no-results'))
        };
    }

    let contentHtml = `<table>
        <thead>
            <tr>
                <th>${t('th-date')}</th>
                <th>${t('th-agent')}</th>
                <th>${t('th-teams')}</th>
                <th>${t('th-tickets')}</th>
                <th>${t('th-calls')}</th>
                <th>${t('th-total')}</th>
                <th>${t('th-schedule')}</th>
                <th>${t('th-hours')}</th>
                <th>${t('th-productivity')}</th>
            </tr>
        </thead>
        <tbody>`;

    let lastDate = '';
    rows.forEach(row => {
        const prodColor = productivityColor(row.hours, row.productivity);
        const prodDisplay = productivityDisplay(row.hours, row.productivity);
        const teamTooltip = uploadedTeamTooltip(row);
        const rowBg = row.isWeekend ? 'background: rgba(255,255,255,0.03);' : '';
        const noDataStyle = !row.hasData ? 'opacity: 0.4;' : '';
        const showDate = row.dateKey !== lastDate;
        lastDate = row.dateKey;

        contentHtml += `<tr style="${rowBg}${noDataStyle}">
            <td style="font-weight: ${showDate ? '500' : '300'}; color: ${row.isWeekend ? 'var(--warning)' : 'var(--text-primary)'};">${showDate ? row.dateLabel : ''}</td>
            <td style="font-weight: 500;">${row.name}</td>
            <td title="${teamTooltip}"><span style="background: rgba(99,102,241,0.15); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">${row.teamsDisplay}</span></td>
            <td>${row.tickets || '-'}</td>
            <td>${row.calls || '-'}</td>
            <td style="font-weight: bold;">${row.total || '-'}</td>
            <td style="font-size: 0.85rem; color: var(--text-secondary);">${row.dayValue || '-'}</td>
            <td>${formatPlannerHoursValue(row.hours)}h</td>
            <td style="color: ${prodColor}; font-weight: bold;">${prodDisplay}</td>
        </tr>`;
    });

    contentHtml += '</tbody></table>';
    return { statsHtml, contentHtml };
}
