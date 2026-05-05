// js/planner-view-state.js

const DEFAULT_VIEW_OPTIONS = {
    showWeekTotals: false,
    highlightWeekends: true,
    compactView: false
};

function copyDateRange(dateRange = {}) {
    return {
        start: dateRange.start || null,
        end: dateRange.end || null
    };
}

function uniqueValues(values) {
    return [...new Set((values || []).filter(Boolean))];
}

function normalizeSelectedTeams(selectedTeams) {
    const teams = uniqueValues(selectedTeams);
    if (teams.length === 0 || teams.includes('all')) {
        return ['all'];
    }
    return teams;
}

function copyPlannerViewState(state = {}, overrides = {}) {
    return {
        selectedMonths: [...(state.selectedMonths || [])],
        selectedTeams: normalizeSelectedTeams(state.selectedTeams || ['all']),
        selectedAgents: uniqueValues(state.selectedAgents || []),
        dateRange: copyDateRange(state.dateRange),
        rangeType: state.rangeType || 'preset',
        presetRange: state.presetRange || 'current-month',
        agentSearchTerm: state.agentSearchTerm || '',
        filterType: state.filterType || 'agent',
        viewOptions: {
            ...DEFAULT_VIEW_OPTIONS,
            ...(state.viewOptions || {})
        },
        ...overrides
    };
}

function startOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}

function getReferenceDate(referenceDate) {
    const date = referenceDate ? new Date(referenceDate) : new Date();
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildPresetDateRange(presetRange, referenceDate) {
    const currentDate = getReferenceDate(referenceDate);

    switch (presetRange) {
        case 'next-month':
            return {
                start: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1),
                end: new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0)
            };
        case 'today': {
            const today = startOfDay(currentDate);
            return { start: today, end: today };
        }
        case 'tomorrow': {
            const tomorrow = startOfDay(currentDate);
            tomorrow.setDate(tomorrow.getDate() + 1);
            return { start: tomorrow, end: tomorrow };
        }
        case 'current-month':
        default:
            return {
                start: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
                end: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
            };
    }
}

export function createPlannerViewState(initialState = {}) {
    return copyPlannerViewState(initialState);
}

export function setPlannerDateRange(state, start, end) {
    return copyPlannerViewState(state, {
        dateRange: { start, end }
    });
}

export function togglePlannerMonth(state, monthKey) {
    const selectedMonths = [...(state.selectedMonths || [])];
    const index = selectedMonths.indexOf(monthKey);

    if (index > -1) {
        selectedMonths.splice(index, 1);
    } else if (monthKey) {
        selectedMonths.push(monthKey);
    }

    return copyPlannerViewState(state, { selectedMonths });
}

export function selectPlannerMonths(state, monthKeys) {
    return copyPlannerViewState(state, {
        selectedMonths: uniqueValues(monthKeys)
    });
}

export function clearPlannerMonths(state) {
    return copyPlannerViewState(state, { selectedMonths: [] });
}

export function togglePlannerTeam(state, teamId) {
    if (teamId === 'all') {
        return copyPlannerViewState(state, { selectedTeams: ['all'] });
    }

    const selectedTeams = (state.selectedTeams || ['all']).includes('all')
        ? []
        : [...state.selectedTeams];
    const index = selectedTeams.indexOf(teamId);

    if (index > -1) {
        selectedTeams.splice(index, 1);
    } else if (teamId) {
        selectedTeams.push(teamId);
    }

    return copyPlannerViewState(state, {
        selectedTeams: normalizeSelectedTeams(selectedTeams)
    });
}

export function setPlannerFilterType(state, filterType) {
    return copyPlannerViewState(state, { filterType });
}

export function applyPlannerFilterSelection(state, { filterType = state.filterType, value, checked } = {}) {
    if (filterType === 'team') {
        const selectedTeams = (state.selectedTeams || ['all']).includes('all')
            ? []
            : [...state.selectedTeams];
        const index = selectedTeams.indexOf(value);

        if (checked && index === -1 && value) {
            selectedTeams.push(value);
        } else if (!checked && index > -1) {
            selectedTeams.splice(index, 1);
        }

        return copyPlannerViewState(state, {
            selectedTeams: normalizeSelectedTeams(selectedTeams)
        });
    }

    const selectedAgents = [...(state.selectedAgents || [])];
    const index = selectedAgents.indexOf(value);

    if (checked && index === -1 && value) {
        selectedAgents.push(value);
    } else if (!checked && index > -1) {
        selectedAgents.splice(index, 1);
    }

    return copyPlannerViewState(state, {
        selectedAgents: uniqueValues(selectedAgents)
    });
}

export function clearPlannerAgentAndTeamSelections(state) {
    return copyPlannerViewState(state, {
        selectedTeams: ['all'],
        selectedAgents: [],
        agentSearchTerm: ''
    });
}

export function setPlannerRangeType(state, rangeType) {
    return copyPlannerViewState(state, { rangeType });
}

export function applyPlannerPresetRange(state, presetRange, referenceDate) {
    return copyPlannerViewState(state, {
        presetRange,
        dateRange: buildPresetDateRange(presetRange, referenceDate)
    });
}

export function setPlannerAgentSearchTerm(state, term) {
    return copyPlannerViewState(state, {
        agentSearchTerm: term || ''
    });
}

export function setPlannerViewOption(state, option, value) {
    return copyPlannerViewState(state, {
        viewOptions: {
            ...DEFAULT_VIEW_OPTIONS,
            ...(state.viewOptions || {}),
            [option]: value
        }
    });
}

export function resetPlannerFilters(state, { today } = {}) {
    const presetState = applyPlannerPresetRange(state, 'current-month', today);
    return copyPlannerViewState(presetState, {
        selectedTeams: ['all'],
        selectedAgents: [],
        agentSearchTerm: ''
    });
}
