import {
    LEAVE_CODES,
    extractHoursFromDay,
    formatPlannerHoursValue,
    getDateKey,
    getMonthKey,
    normalizeTeamForDisplay,
    parseShiftEntry
} from './config.js';
import { buildPlannerReadModel } from './planner-read-model.js';

const EXPORT_HEADERS = [
    'Month',
    'Date',
    'Day',
    'Name',
    'Username',
    'Contract Type',
    'Contract Hours',
    'Primary Team',
    'Shop',
    'Planned Hours',
    'Schedule',
    'Note'
];

function escapeCsvValue(value) {
    const text = String(value ?? '');
    if (!/[",\n\r]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

function normalizeDate(value) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function getPrimaryTeamCode(agent) {
    const primaryTeam = String(agent?.primaryTeam || '').trim();
    if (!primaryTeam) return '';
    return normalizeTeamForDisplay(primaryTeam.split(/\s+/)[0].toUpperCase());
}

function getAgentContractHours(agent) {
    const hours = agent?.contractHours ?? ((agent?.contractType || 'Full-time') === 'Full-time' ? 8 : '');
    return formatPlannerHoursValue(hours);
}

function buildDatesByCellKey(dates = []) {
    const datesByCellKey = new Map();
    dates.forEach(date => {
        datesByCellKey.set(`${getMonthKey(date)}|${date.getDate() - 1}`, date);
    });
    return datesByCellKey;
}

function buildScheduleAllocations(schedule, agent) {
    const value = String(schedule || '').trim();
    if (!value) return [];

    if (LEAVE_CODES.includes(value)) {
        return [{ shop: value, plannedHours: '0' }];
    }

    const parts = value.split('+').map(part => part.trim()).filter(Boolean);
    const allocations = parts
        .map(part => parseShiftEntry(part))
        .filter(Boolean)
        .map(parsed => ({
            shop: parsed.team ? normalizeTeamForDisplay(parsed.team) : getPrimaryTeamCode(agent),
            plannedHours: formatPlannerHoursValue(parsed.hours)
        }));

    if (allocations.length > 0) {
        return allocations;
    }

    return [{
        shop: getPrimaryTeamCode(agent),
        plannedHours: formatPlannerHoursValue(extractHoursFromDay(value))
    }];
}

function buildExportRow({ agent, cell, date, allocation, dayName }) {
    return {
        month: cell.monthKey,
        date: getDateKey(date),
        day: dayName,
        name: agent?.fullName || agent?.name || '',
        username: agent?.username || '',
        contractType: agent?.contractType || '',
        contractHours: getAgentContractHours(agent),
        primaryTeam: agent?.primaryTeam || '',
        shop: allocation.shop || '',
        plannedHours: allocation.plannedHours || '',
        schedule: cell.rawValue || '',
        note: cell.title || ''
    };
}

export function buildPlannerExportRows(agents, startDate, endDate, options = {}) {
    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);
    if (!start || !end || start > end) return [];

    const readModel = buildPlannerReadModel(agents, start, end, {
        dayNames: options.dayNames,
        filterState: options.filterState,
        today: options.today,
        unknownAgentLabel: options.unknownAgentLabel,
        viewOptions: {
            ...(options.viewOptions || {}),
            showWeekTotals: false
        }
    });
    const agentsById = new Map((agents || []).map(agent => [agent.id, agent]));
    const datesByCellKey = buildDatesByCellKey(readModel.dates);
    const rows = [];

    readModel.rows.forEach(row => {
        const agent = agentsById.get(row.agentId) || {};

        row.cells.forEach(cell => {
            if (cell.type !== 'day') return;
            if (!String(cell.rawValue || '').trim() && !cell.title) return;

            const date = datesByCellKey.get(`${cell.monthKey}|${cell.dayIndex}`);
            if (!date) return;

            const dayName = readModel.headers.find(header =>
                header.type === 'day' &&
                header.date &&
                getDateKey(header.date) === getDateKey(date)
            )?.dayName || '';

            const allocations = buildScheduleAllocations(cell.rawValue, agent);
            const normalizedAllocations = allocations.length > 0
                ? allocations
                : [{ shop: '', plannedHours: '' }];

            normalizedAllocations.forEach(allocation => {
                rows.push(buildExportRow({ agent, cell, date, allocation, dayName }));
            });
        });
    });

    return rows;
}

export function buildPlannerExportCsv(rows = []) {
    return [
        EXPORT_HEADERS,
        ...rows.map(row => [
            row.month,
            row.date,
            row.day,
            row.name,
            row.username,
            row.contractType,
            row.contractHours,
            row.primaryTeam,
            row.shop,
            row.plannedHours,
            row.schedule,
            row.note
        ])
    ]
        .map(row => row.map(escapeCsvValue).join(','))
        .join('\n');
}

export function buildPlannerExportFilename(startDate, endDate) {
    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);
    if (!start || !end) return 'planner-export.csv';

    const isSameMonth = start.getFullYear() === end.getFullYear() &&
        start.getMonth() === end.getMonth();
    const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const isFullMonth = isSameMonth && start.getDate() === 1 && end.getDate() === monthEnd.getDate();

    if (isFullMonth) {
        return `planner-${getMonthKey(start)}.csv`;
    }

    return `planner-${getDateKey(start)}-to-${getDateKey(end)}.csv`;
}

export function downloadPlannerExportCsv({
    filename,
    csv,
    doc = globalThis.document,
    url = globalThis.URL,
    BlobAdapter = globalThis.Blob
} = {}) {
    const blob = new BlobAdapter([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const objectUrl = url.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    url.revokeObjectURL(objectUrl);
}
