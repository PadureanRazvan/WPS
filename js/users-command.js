// js/users-command.js

import {
    generateDefaultSchedule,
    getAgentDaysForMonth,
    getMonthKey,
    rewriteMonthlyDaysForPrimaryTeamChange
} from './config.js';
import {
    applyInactiveCodeToMonth,
    buildContractMonthDaysFromDate,
    buildPrimaryTeamHistoryForChange,
    clearInactiveCodeFromMonth,
    getDateKey,
    normalizeAgentLifecycleDate
} from './agent-lifecycle.js';

function identityTimestamp(date) {
    return date;
}

function parseLocalDate(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value);
    if (value?.toDate) return value.toDate();
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function teamCodeFromPrimaryTeam(primaryTeam) {
    return String(primaryTeam || '').trim().split(' ')[0] || '';
}

function getMonthStartFromKey(monthKey) {
    const [yearStr, monthStr] = String(monthKey || '').split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (!year || !month) return null;
    return new Date(year, month - 1, 1);
}

export function getUserCommandDateKey(date) {
    return getDateKey(date);
}

export function normalizeUserInlineDateValue(value) {
    if (!value) return '';

    const date = normalizeAgentLifecycleDate(value);
    if (!date) return '';
    return getDateKey(date);
}

export function normalizeUserInlineFieldValue(field, value) {
    if (field === 'contractHours') {
        const numericValue = typeof value === 'number' ? value : parseInt(value, 10);
        return Number.isNaN(numericValue) ? '' : String(numericValue);
    }

    if (field === 'hireDate') {
        return normalizeUserInlineDateValue(value);
    }

    if (value == null) return '';
    return String(value).trim();
}

export function getComparableUserInlineFieldState(user, field) {
    if (field === 'contractHours') {
        const currentHours = user?.contractHours ?? ((user?.contractType || 'Full-time') === 'Full-time' ? 8 : '');
        return normalizeUserInlineFieldValue(field, currentHours);
    }

    if (field === 'contractType') {
        return normalizeUserInlineFieldValue(field, user?.contractType || 'Full-time');
    }

    const normalizedValue = normalizeUserInlineFieldValue(field, user?.[field]);

    if (field === 'primaryTeam') {
        const storedTeams = Array.isArray(user?.teams)
            ? user.teams.map(team => String(team || '').trim()).filter(Boolean)
            : [];

        return JSON.stringify({
            primaryTeam: normalizedValue,
            teams: storedTeams
        });
    }

    return normalizedValue;
}

export function getComparableUserInlineDraftState(field, rawValue) {
    const normalizedValue = normalizeUserInlineFieldValue(field, rawValue);

    if (field === 'primaryTeam') {
        const teamCode = teamCodeFromPrimaryTeam(normalizedValue);
        return JSON.stringify({
            primaryTeam: normalizedValue,
            teams: teamCode ? [teamCode] : []
        });
    }

    return normalizedValue;
}

export function buildCreateAgentCommand(input = {}, { now = new Date() } = {}) {
    const fullName = String(input.fullName || '').trim();
    const username = String(input.username || '').trim();
    const contractType = String(input.contractType || 'Full-time').trim() || 'Full-time';
    const primaryTeam = String(input.primaryTeam || '').trim();
    const hireDateStr = String(input.hireDateStr || '').trim();

    if (!fullName || !username || !hireDateStr) {
        return { ok: false, error: 'fill-required-fields' };
    }

    const contractHours = contractType === 'Part-time'
        ? parseInt(input.contractHours, 10)
        : 8;

    if (contractType === 'Part-time' && (!contractHours || contractHours < 4 || contractHours > 7)) {
        return { ok: false, error: 'pt-hours-range' };
    }

    const teamCode = teamCodeFromPrimaryTeam(primaryTeam);
    const monthKey = getMonthKey(now);
    const hireDate = parseLocalDate(hireDateStr);
    const scheduleAgent = {
        contractHours,
        primaryTeam,
        hireDate
    };
    const days = generateDefaultSchedule(scheduleAgent, monthKey);

    return {
        ok: true,
        monthKey,
        teamCode,
        contractHours,
        payload: {
            fullName,
            username,
            contractHours,
            contractType,
            primaryTeam,
            teams: teamCode ? [teamCode] : [],
            hireDate,
            isActive: true,
            monthlyDays: { [monthKey]: days },
            monthlyNotes: {}
        }
    };
}

export function buildContractChangeCommand(user, {
    newContractType,
    contractHours: rawContractHours,
    fromDateStr,
    now = new Date()
} = {}) {
    if (!fromDateStr) return { ok: false, error: 'select-start-date' };

    const fromDate = normalizeAgentLifecycleDate(fromDateStr);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    if (!fromDate || fromDate.getFullYear() !== currentYear || fromDate.getMonth() !== currentMonth) {
        return { ok: false, error: 'date-must-be-current-month' };
    }

    const contractHours = newContractType === 'Part-time'
        ? parseInt(rawContractHours, 10)
        : 8;

    if (newContractType === 'Part-time' && (!contractHours || contractHours < 4 || contractHours > 7)) {
        return { ok: false, error: 'pt-hours-range' };
    }

    const teamCode = teamCodeFromPrimaryTeam(user?.primaryTeam || 'RO zooplus');
    const monthKey = getMonthKey(now);
    const existingDays = getAgentDaysForMonth(user, monthKey);
    const mergedDays = buildContractMonthDaysFromDate({
        existingDays,
        fromDate,
        contractHours,
        teamCode
    });

    return {
        ok: true,
        fromDate,
        monthKey,
        contractHours,
        updateData: {
            contractType: newContractType,
            contractHours,
            [`monthlyDays.${monthKey}`]: mergedDays
        },
        activity: {
            name: user?.fullName,
            type: newContractType,
            hours: contractHours
        }
    };
}

export function buildPrimaryTeamChangeCommand(user, { newPrimaryTeam, fromDateStr } = {}) {
    if (!fromDateStr) return { ok: false, error: 'select-start-date' };

    const fromDate = parseLocalDate(fromDateStr);
    const hireDate = normalizeAgentLifecycleDate(user?.hireDate);
    const normalizedFrom = normalizeAgentLifecycleDate(fromDate);

    if (hireDate && normalizedFrom && normalizedFrom < hireDate) {
        return { ok: false, error: 'team-date-before-hire' };
    }

    const teamCode = teamCodeFromPrimaryTeam(newPrimaryTeam);
    const primaryTeamHistory = buildPrimaryTeamHistoryForChange(user, newPrimaryTeam, fromDate);
    const monthlyDayUpdates = rewriteMonthlyDaysForPrimaryTeamChange(user, newPrimaryTeam, fromDate);
    const updateData = {
        primaryTeam: newPrimaryTeam,
        teams: teamCode ? [teamCode] : [],
        primaryTeamHistory
    };

    for (const [monthKey, days] of Object.entries(monthlyDayUpdates)) {
        updateData[`monthlyDays.${monthKey}`] = days;
    }

    return {
        ok: true,
        fromDate,
        teamCode,
        oldTeam: user?.primaryTeam || '',
        updateData,
        activity: {
            name: user?.fullName,
            from: fromDateStr,
            oldTeam: user?.primaryTeam || '',
            newTeam: newPrimaryTeam
        }
    };
}

export function buildDeactivateAgentCommand(user, {
    startDate,
    endDate = null,
    noteText = '',
    now = new Date(),
    timestampFromDate = identityTimestamp
} = {}) {
    const normalizedStart = normalizeAgentLifecycleDate(startDate);
    if (!normalizedStart) return { ok: false, error: 'select-start-date-deact' };

    const normalizedEnd = endDate ? normalizeAgentLifecycleDate(endDate) : null;
    if (normalizedEnd && normalizedEnd < normalizedStart) {
        return { ok: false, error: 'end-date-after-start' };
    }

    const monthKey = getMonthKey(now);
    const existingDays = getAgentDaysForMonth(user, monthKey);
    const newDays = applyInactiveCodeToMonth(existingDays, now, normalizedStart, normalizedEnd);
    const trimmedNote = String(noteText || '').trim();
    const mode = normalizedEnd ? 'period' : 'indefinite';
    const fromLabel = normalizedStart.toLocaleDateString('ro-RO');
    const toLabel = normalizedEnd ? normalizedEnd.toLocaleDateString('ro-RO') : 'indefinit';

    return {
        ok: true,
        monthKey,
        updateData: {
            isActive: false,
            [`monthlyDays.${monthKey}`]: newDays,
            inactiveFrom: timestampFromDate(normalizedStart),
            inactiveTo: normalizedEnd ? timestampFromDate(normalizedEnd) : null,
            deactivationNote: trimmedNote || null
        },
        activity: {
            name: user?.fullName,
            mode,
            from: fromLabel,
            to: toLabel,
            note: trimmedNote
        },
        labels: {
            from: fromLabel,
            to: toLabel
        }
    };
}

export function buildReactivateAgentCommand(user, { now = new Date() } = {}) {
    const reactivateMonthKey = getMonthKey(now);
    const futureMonthKeys = Object.keys(user?.monthlyDays || {})
        .filter(monthKey => monthKey >= reactivateMonthKey)
        .sort();
    const updateData = {
        isActive: true,
        inactiveFrom: null,
        inactiveTo: null,
        deactivationNote: null
    };

    futureMonthKeys.forEach(monthKey => {
        const monthStart = getMonthStartFromKey(monthKey);
        if (!monthStart) return;

        const existingDays = getAgentDaysForMonth(user, monthKey);
        updateData[`monthlyDays.${monthKey}`] = clearInactiveCodeFromMonth(existingDays, monthStart, now);
    });

    return {
        ok: true,
        updateData,
        activity: { name: user?.fullName }
    };
}

export function buildInlineUserEditCommand(user, {
    field,
    rawValue,
    eventType,
    initialValue,
    timestampFromDate = identityTimestamp
} = {}) {
    if (!field || !user || field === 'isActive') {
        return { ok: true, action: 'noop' };
    }

    if (field === 'contractType') {
        if (eventType !== 'change') return { ok: true, action: 'noop' };
        const value = normalizeUserInlineFieldValue('contractType', rawValue);
        if (value === getComparableUserInlineFieldState(user, 'contractType')) {
            return { ok: true, action: 'noop' };
        }
        return { ok: true, action: 'open-contract-modal', value };
    }

    if (field === 'primaryTeam') {
        if (eventType !== 'change') return { ok: true, action: 'noop' };
        const value = normalizeUserInlineFieldValue('primaryTeam', rawValue);
        if (getComparableUserInlineDraftState(field, value) === getComparableUserInlineFieldState(user, field)) {
            return { ok: true, action: 'noop' };
        }
        return { ok: true, action: 'open-primary-team-modal', value };
    }

    const currentState = getComparableUserInlineFieldState(user, field);
    const lastSavedState = initialValue || currentState;
    let value = rawValue;
    let comparisonValue = value;

    if (field === 'contractHours') {
        value = parseInt(value, 10);
        comparisonValue = value;
        if (Number.isNaN(value) || value < 4 || value > 8) {
            return { ok: false, error: 'hours-range-error', rerender: true };
        }
    } else if (field === 'hireDate') {
        if (!value) {
            return { ok: false, error: 'hire-date-empty', rerender: true };
        }
        const parsedDate = parseLocalDate(value);
        comparisonValue = parsedDate;
        value = timestampFromDate(parsedDate);
    } else if (field === 'fullName' && !String(value || '').trim()) {
        return { ok: false, error: 'name-empty', rerender: true };
    } else if (typeof value === 'string') {
        value = value.trim();
        comparisonValue = value;
    }

    const nextState = getComparableUserInlineDraftState(field, comparisonValue);
    if (nextState === currentState || nextState === lastSavedState) {
        return { ok: true, action: 'noop', initialValue: currentState };
    }

    return {
        ok: true,
        action: 'update',
        nextState,
        updatePayload: { [field]: value },
        logDetails: { field, agentId: user.id }
    };
}
