// js/planner-read-model.js

import {
    PLANNER_TEAMS,
    UPLOAD_VALID_TEAMS,
    extractHoursFromDay,
    formatPlannerHoursValue,
    getAgentNotesForMonth,
    getEffectiveAgentDayValue,
    getMonthKey
} from './config.js';

const LEAVE_CLASS_NAMES = {
    SL: 'sick-leave',
    Co: 'holiday',
    CM: 'medical-leave',
    LB: 'day-off',
    MA: 'maternity-leave',
    DO: 'donation-leave',
    DC: 'bereavement-leave',
    DZ: 'deactivated'
};

const DEFAULT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDaysInRange(startDate, endDate) {
    if (!startDate || !endDate) return [];

    const days = [];
    for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate() + 1)) {
        days.push(new Date(dt));
    }
    return days;
}

function isSameDay(firstDate, secondDate) {
    if (!firstDate || !secondDate) return false;

    return firstDate.getDate() === secondDate.getDate() &&
        firstDate.getMonth() === secondDate.getMonth() &&
        firstDate.getFullYear() === secondDate.getFullYear();
}

function getValidTeamPattern() {
    return [...new Set([...PLANNER_TEAMS, ...UPLOAD_VALID_TEAMS])].join('|');
}

function isWorkingPlannerCell(dayValue) {
    const teamPattern = getValidTeamPattern();
    return new RegExp(`\\d+(?:\\.5)?\\s*(${teamPattern})`, 'i').test(dayValue || '');
}

function hasMultipleTeamEntries(dayValue) {
    if (!dayValue) return false;
    if (dayValue.includes('+')) return true;

    const teamPattern = getValidTeamPattern();
    const matches = dayValue.match(new RegExp(`\\d+(?:\\.5)?\\s*(${teamPattern})`, 'gi'));
    return (matches || []).length > 1;
}

function getCellTitle(agent, monthKey, dayIndex, dayValue) {
    const notesForMonth = getAgentNotesForMonth(agent, monthKey);
    const note = notesForMonth[dayIndex.toString()];

    if (dayValue === 'DZ' && agent.deactivationNote) {
        return agent.deactivationNote;
    }

    return note || '';
}

export function formatPlannerCellContent(dayValue) {
    const value = String(dayValue || '').trim();
    if (!value) return [];

    if (Object.hasOwn(LEAVE_CLASS_NAMES, value)) {
        return [value];
    }

    if (value.includes('+')) {
        const parts = value.split('+').map(part => part.trim().replace(/\s+/g, ''));
        const teamPattern = getValidTeamPattern();
        const allAreValidTeams = parts.every(part => {
            const pattern = new RegExp(`^\\d+(?:\\.5)?(${teamPattern})$`);
            return pattern.test(part);
        });

        return allAreValidTeams ? parts : [parts.join('+')];
    }

    return [value.replace(/\s+/g, '')];
}

export function getPlannerCellClassNames(dayValue, date, options = {}) {
    const classes = ['day-cell'];
    const value = String(dayValue || '');

    if (!value.trim()) {
        classes.push('empty');
    } else if (Object.hasOwn(LEAVE_CLASS_NAMES, value)) {
        classes.push(LEAVE_CLASS_NAMES[value]);
    } else if (isWorkingPlannerCell(value)) {
        classes.push('working');

        if (hasMultipleTeamEntries(value)) {
            classes.push('multi-team');
        }
    }

    const highlightWeekends = options.highlightWeekends !== false;
    if (highlightWeekends && date) {
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            classes.push('weekend');
        }
    }

    if (options.today && isSameDay(date, options.today)) {
        classes.push('today');
    }

    return classes;
}

export function getPlannerCellTextSizeClass(displayLines) {
    const lines = Array.isArray(displayLines) ? displayLines : [];
    if (lines.length === 0) return '';

    const lineCount = lines.length;
    const maxLineLength = Math.max(...lines.map(line => String(line).length));

    if (lineCount > 1) {
        if (lineCount > 3 || maxLineLength > 12) return 'small-text';
        if (lineCount > 2 || maxLineLength > 9) return 'medium-text';
        return '';
    }

    if (maxLineLength > 15) return 'tiny-text';
    if (maxLineLength > 12) return 'small-text';
    if (maxLineLength > 9) return 'medium-text';
    return '';
}

export function filterPlannerAgents(agents, filterState = {}) {
    let filteredAgents = [...(agents || [])];
    const selectedAgents = filterState.selectedAgents || [];
    const selectedTeams = filterState.selectedTeams || ['all'];

    if (selectedAgents.length > 0) {
        filteredAgents = filteredAgents.filter(agent => selectedAgents.includes(agent.id));
    } else if (selectedTeams.length > 0 && !selectedTeams.includes('all')) {
        filteredAgents = filteredAgents.filter(agent =>
            agent.teams && agent.teams.some(team => selectedTeams.includes(team))
        );
    }

    if (filterState.filterType === 'agent') {
        const searchTerm = filterState.agentSearchTerm?.toLowerCase();
        if (searchTerm) {
            filteredAgents = filteredAgents.filter(agent =>
                (agent.fullName && agent.fullName.toLowerCase().includes(searchTerm)) ||
                (agent.username && agent.username.toLowerCase().includes(searchTerm))
            );
        }
    }

    return filteredAgents;
}

function buildHeader(date, dayNames, viewOptions, today) {
    const dayOfWeek = date.getDay();
    const dayName = dayNames[dayOfWeek] || DEFAULT_DAY_NAMES[dayOfWeek];
    const classNames = ['date-header'];

    if (viewOptions.highlightWeekends !== false && (dayOfWeek === 0 || dayOfWeek === 6)) {
        classNames.push('weekend');
    }

    if (today && isSameDay(date, today)) {
        classNames.push('today');
    }

    return {
        type: 'day',
        date,
        dayName,
        dayNumber: date.getDate(),
        classNames
    };
}

function buildCell(agent, date, viewOptions, today) {
    const monthKey = getMonthKey(date);
    const dayIndex = date.getDate() - 1;
    const rawValue = getEffectiveAgentDayValue(agent, date) || '';
    const displayLines = formatPlannerCellContent(rawValue);
    const classNames = getPlannerCellClassNames(rawValue, date, {
        highlightWeekends: viewOptions.highlightWeekends,
        today
    });
    const title = getCellTitle(agent, monthKey, dayIndex, rawValue);

    return {
        type: 'day',
        key: `${agent.id}|${monthKey}|${dayIndex}`,
        agentId: agent.id,
        monthKey,
        dayIndex,
        rawValue,
        displayLines,
        classNames,
        sizeClass: getPlannerCellTextSizeClass(displayLines),
        title
    };
}

function buildPlannerRow(agent, dates, options) {
    const renderedMonthKeys = [...new Set(dates.map(date => getMonthKey(date)))];
    const deleteMonthKey = renderedMonthKeys.length === 1 ? renderedMonthKeys[0] : '';
    const cells = [];
    let weeklyHours = 0;
    let totalHours = 0;

    dates.forEach(date => {
        const cell = buildCell(agent, date, options.viewOptions, options.today);
        cells.push(cell);

        const dayHours = extractHoursFromDay(cell.rawValue);
        totalHours += dayHours;

        if (options.viewOptions.showWeekTotals) {
            weeklyHours += dayHours;

            if (date.getDay() === 0) {
                cells.push({
                    type: 'week-total',
                    totalHours: weeklyHours,
                    totalHoursLabel: `${formatPlannerHoursValue(weeklyHours)}h`,
                    classNames: ['week-total-cell']
                });
                weeklyHours = 0;
            }
        }
    });

    return {
        agentId: agent.id,
        agentName: agent.fullName || agent.name || options.unknownAgentLabel,
        contractHoursLabel: agent.contractHours ? `${agent.contractHours}h` : '8h',
        deleteMonthKey,
        cells,
        totalHours,
        totalHoursLabel: `${formatPlannerHoursValue(totalHours)}h`
    };
}

export function buildPlannerReadModel(agents, startDate, endDate, options = {}) {
    const dates = getDaysInRange(startDate, endDate);
    const viewOptions = {
        showWeekTotals: false,
        highlightWeekends: true,
        ...(options.viewOptions || {})
    };
    const readModelOptions = {
        dayNames: options.dayNames || DEFAULT_DAY_NAMES,
        filterState: options.filterState || {},
        today: options.today || new Date(),
        unknownAgentLabel: options.unknownAgentLabel || 'Unknown Agent',
        viewOptions
    };

    const headers = [];
    dates.forEach(date => {
        const header = buildHeader(date, readModelOptions.dayNames, viewOptions, readModelOptions.today);
        headers.push(header);

        if (viewOptions.showWeekTotals && date.getDay() === 0) {
            headers.push({
                type: 'week-total',
                classNames: ['week-total-header', 'date-header']
            });
        }
    });

    const filteredAgents = filterPlannerAgents(agents, readModelOptions.filterState);

    return {
        fewDaysView: dates.length > 0 && dates.length < 10,
        dates,
        headers,
        rows: filteredAgents.map(agent => buildPlannerRow(agent, dates, readModelOptions))
    };
}
