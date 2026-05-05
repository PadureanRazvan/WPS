// js/agent-lifecycle.js

export const REPORT_ROLE_TEAM_CODES = ['TL', 'QA'];

export function normalizeAgentLifecycleDate(value) {
    if (!value) return null;

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        const localDate = new Date(year, month - 1, day);
        localDate.setHours(0, 0, 0, 0);
        return localDate;
    }

    const date = value instanceof Date
        ? new Date(value)
        : value?.toDate
            ? value.toDate()
            : new Date(value);

    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

export function getDateKey(date) {
    const normalized = normalizeAgentLifecycleDate(date);
    if (!normalized) return '';

    const year = normalized.getFullYear();
    const month = String(normalized.getMonth() + 1).padStart(2, '0');
    const day = String(normalized.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizePrimaryTeamHistoryEntry(entry) {
    const fromDate = normalizeAgentLifecycleDate(entry?.from);
    const primaryTeam = String(entry?.primaryTeam || '').trim();

    if (!fromDate || !primaryTeam) return null;
    return {
        from: getDateKey(fromDate),
        primaryTeam
    };
}

function getNormalizedPrimaryTeamHistory(agent) {
    return Array.isArray(agent?.primaryTeamHistory)
        ? agent.primaryTeamHistory
            .map(normalizePrimaryTeamHistoryEntry)
            .filter(Boolean)
            .sort((a, b) => a.from.localeCompare(b.from))
        : [];
}

export function getEffectivePrimaryTeam(agent, date) {
    const targetDateKey = getDateKey(date);
    const history = getNormalizedPrimaryTeamHistory(agent);
    let effectiveTeam = '';

    for (const entry of history) {
        if (entry.from <= targetDateKey) {
            effectiveTeam = entry.primaryTeam;
        } else {
            break;
        }
    }

    return effectiveTeam || String(agent?.primaryTeam || '').trim();
}

export function getEffectivePrimaryTeamCode(agent, date) {
    return getEffectivePrimaryTeam(agent, date).split(' ')[0]?.toUpperCase() || '';
}

export function buildPrimaryTeamHistoryForChange(agent, newPrimaryTeam, fromDate) {
    const fromKey = getDateKey(fromDate);
    const nextTeam = String(newPrimaryTeam || '').trim();
    if (!fromKey || !nextTeam) return getNormalizedPrimaryTeamHistory(agent);

    const history = getNormalizedPrimaryTeamHistory(agent);
    const seededHistory = history.length > 0
        ? history
        : [{
            from: getDateKey(agent?.hireDate) || fromKey,
            primaryTeam: String(agent?.primaryTeam || '').trim()
        }].filter(entry => entry.primaryTeam);

    const nextHistory = seededHistory.filter(entry => entry.from < fromKey);
    const previousEntry = nextHistory[nextHistory.length - 1];

    if (!previousEntry || previousEntry.primaryTeam !== nextTeam) {
        nextHistory.push({ from: fromKey, primaryTeam: nextTeam });
    }

    return nextHistory;
}

export function isReportRoleTeamCode(teamCode) {
    return REPORT_ROLE_TEAM_CODES.includes(String(teamCode || '').trim().toUpperCase());
}

export function getEffectiveReportRoleCode(agent, date) {
    const effectiveCode = getEffectivePrimaryTeamCode(agent, date);
    return isReportRoleTeamCode(effectiveCode) ? effectiveCode : null;
}

export function isDateBeforeAgentStart(agent, date) {
    const normalizedDate = normalizeAgentLifecycleDate(date);
    const hireDate = normalizeAgentLifecycleDate(agent?.hireDate);

    if (!normalizedDate || !hireDate) return false;
    return normalizedDate < hireDate;
}

export function isAgentInactiveOnDate(agent, date) {
    if (!agent?.inactiveFrom || agent?.isActive !== false) return false;

    const normalizedDate = normalizeAgentLifecycleDate(date);
    const inactiveFrom = normalizeAgentLifecycleDate(agent.inactiveFrom);
    const inactiveTo = agent.inactiveTo ? normalizeAgentLifecycleDate(agent.inactiveTo) : null;

    if (!normalizedDate || !inactiveFrom) return false;
    return normalizedDate >= inactiveFrom && (!inactiveTo || normalizedDate <= inactiveTo);
}

export function getAgentLifecycleState(agent, date) {
    const isBeforeStart = isDateBeforeAgentStart(agent, date);
    const isInactive = !isBeforeStart && isAgentInactiveOnDate(agent, date);
    const effectivePrimaryTeam = getEffectivePrimaryTeam(agent, date);
    const effectivePrimaryTeamCode = getEffectivePrimaryTeamCode(agent, date);
    const effectiveReportRoleCode = getEffectiveReportRoleCode(agent, date);

    return {
        status: isBeforeStart ? 'pre-start' : isInactive ? 'inactive' : 'active',
        isBeforeStart,
        isInactive,
        isActive: !isBeforeStart && !isInactive,
        effectivePrimaryTeam,
        effectivePrimaryTeamCode,
        effectiveReportRoleCode
    };
}

function isDateWithinInclusiveRange(date, startDate, endDate) {
    const normalizedDate = normalizeAgentLifecycleDate(date);
    const normalizedStart = normalizeAgentLifecycleDate(startDate);
    const normalizedEnd = endDate ? normalizeAgentLifecycleDate(endDate) : null;

    if (!normalizedDate || !normalizedStart) return false;
    return normalizedDate >= normalizedStart && (!normalizedEnd || normalizedDate <= normalizedEnd);
}

export function applyInactiveCodeToMonth(existingDays, monthDate, startDate, endDate) {
    const monthStart = normalizeAgentLifecycleDate(monthDate);
    if (!monthStart) return [...(existingDays || [])];

    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const nextDays = [...(existingDays || [])];

    while (nextDays.length < 31) nextDays.push('');

    for (let i = 0; i < nextDays.length; i++) {
        const dayNumber = i + 1;
        if (dayNumber > daysInMonth) {
            nextDays[i] = nextDays[i] || '';
            continue;
        }

        const cellDate = new Date(year, month, dayNumber);
        if (isDateWithinInclusiveRange(cellDate, startDate, endDate)) {
            nextDays[i] = 'DZ';
        } else {
            nextDays[i] = nextDays[i] || '';
        }
    }

    return nextDays;
}

export function clearInactiveCodeFromMonth(existingDays, monthDate, clearFromDate) {
    const monthStart = normalizeAgentLifecycleDate(monthDate);
    const normalizedClearFrom = normalizeAgentLifecycleDate(clearFromDate);
    if (!monthStart || !normalizedClearFrom) return [...(existingDays || [])];

    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const nextDays = [...(existingDays || [])];

    while (nextDays.length < 31) nextDays.push('');

    for (let i = 0; i < nextDays.length; i++) {
        const dayNumber = i + 1;
        if (dayNumber > daysInMonth) {
            nextDays[i] = nextDays[i] || '';
            continue;
        }

        const cellDate = new Date(year, month, dayNumber);
        if (cellDate >= normalizedClearFrom && nextDays[i] === 'DZ') {
            nextDays[i] = '';
        } else {
            nextDays[i] = nextDays[i] || '';
        }
    }

    return nextDays;
}

export function buildContractMonthDaysFromDate({
    existingDays = [],
    fromDate,
    contractHours,
    primaryTeam,
    teamCode
}) {
    const startDate = normalizeAgentLifecycleDate(fromDate);
    if (!startDate) return [...existingDays];

    const year = startDate.getFullYear();
    const month = startDate.getMonth();
    const startDay = startDate.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const resolvedTeamCode = String(teamCode || primaryTeam || '').trim().split(' ')[0]?.toUpperCase() || '';
    const nextDays = [...existingDays];

    while (nextDays.length < 31) nextDays.push('');

    for (let day = startDay; day <= 31; day++) {
        const dayIndex = day - 1;
        if (day > daysInMonth) {
            nextDays[dayIndex] = '';
            continue;
        }

        const cellDate = new Date(year, month, day);
        const dayOfWeek = cellDate.getDay();
        nextDays[dayIndex] = dayOfWeek >= 1 && dayOfWeek <= 5
            ? `${contractHours}${resolvedTeamCode}`
            : '';
    }

    return nextDays;
}

export function isPerAgentProductivityRoleExcluded(agent, date) {
    return Boolean(getEffectiveReportRoleCode(agent, date));
}

export function hasPerAgentProductivityEligibleDate(agent, start, end) {
    const current = normalizeAgentLifecycleDate(start);
    const endDate = normalizeAgentLifecycleDate(end);
    if (!current || !endDate) return false;

    while (current <= endDate) {
        if (!isPerAgentProductivityRoleExcluded(agent, current)) return true;
        current.setDate(current.getDate() + 1);
    }

    return false;
}
