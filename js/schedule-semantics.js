import {
    getAgentLifecycleState,
    getEffectivePrimaryTeamCode,
    normalizeAgentLifecycleDate
} from './agent-lifecycle.js';

export {
    REPORT_ROLE_TEAM_CODES,
    buildPrimaryTeamHistoryForChange,
    getDateKey,
    getEffectivePrimaryTeam,
    getEffectivePrimaryTeamCode,
    getEffectiveReportRoleCode,
    isReportRoleTeamCode
} from './agent-lifecycle.js';

// === CENTRALIZED CONSTANTS ===

// Leave/absence codes — single source of truth
export const LEAVE_CODES = ['Co', 'CM', 'LB', 'SL', 'MA', 'DO', 'DC', 'DZ'];

// Check if a schedule value is a non-working code (leave, deactivated, or empty)
export function isNonWorkingCode(value) {
    const trimmed = (value || '').trim();
    return !trimmed || LEAVE_CODES.includes(trimmed);
}

// Normalize team codes for display: SK and CZ merge into CS
export function normalizeTeamForDisplay(code) {
    if (code === 'SK' || code === 'CZ') return 'CS';
    return code;
}

export function isValidPlannerHoursValue(value) {
    const numericValue = typeof value === 'number' ? value : parseFloat(String(value || '').trim());
    if (!Number.isFinite(numericValue) || numericValue < 0) return false;
    return Math.abs((numericValue * 2) - Math.round(numericValue * 2)) < 1e-9;
}

export function formatPlannerHoursValue(value) {
    const numericValue = typeof value === 'number' ? value : parseFloat(String(value || '').trim());
    if (!Number.isFinite(numericValue)) return '';

    const normalizedValue = Math.round(numericValue * 2) / 2;
    return Number.isInteger(normalizedValue) ? String(normalizedValue) : normalizedValue.toFixed(1);
}

// Parse a single shift entry (e.g. "8RO", "42L", "4CS") into { hours, team }
// Handles team codes starting with digits like "2L" (2nd Level)
export function parseShiftEntry(entry) {
    const p = entry.trim();
    const plannerHoursPattern = '\\d+(?:\\.5)?';
    // Try matching team codes that start with a digit (e.g. "42L" = 4h + 2L)
    const match2L = p.match(new RegExp(`^(${plannerHoursPattern})(2L)$`, 'i'));
    if (match2L) {
        return { hours: parseFloat(match2L[1]), team: match2L[2].toUpperCase() };
    }
    // Standard: digits followed by optional letters (e.g. "8RO", "4HU", "8")
    const match = p.match(new RegExp(`^(${plannerHoursPattern})\\s*([A-Za-z-]+)?$`));
    if (match) {
        return { hours: parseFloat(match[1]), team: match[2] ? match[2].toUpperCase() : null };
    }
    return null;
}

// Extract total hours from a day value string (e.g. "8RO", "42L", "4CS+42L")
export function extractHoursFromDay(dayValue) {
    if (!dayValue || typeof dayValue !== 'string') return 0;
    const trimmed = dayValue.trim();
    if (isNonWorkingCode(trimmed)) return 0;
    let total = 0;
    const parts = trimmed.split('+');
    for (const part of parts) {
        const parsed = parseShiftEntry(part);
        if (parsed) total += parsed.hours;
    }
    return total;
}

// All teams used in the planner allocation UI
export const PLANNER_TEAMS = ['RO', 'HU', 'IT', 'NL', 'CS', 'SK', 'SV-SE', '2L', 'QA', 'TL'];

// Teams used for productivity display (main customer-facing teams)
export const PRODUCTIVITY_TEAMS = ['RO', 'HU', 'IT', 'NL', 'CS', 'SV-SE', 'DE', 'BRO', 'BDE'];

// Valid team codes in uploaded files
export const UPLOAD_VALID_TEAMS = ['RO', 'HU', 'IT', 'NL', 'CS', 'SK', 'SV-SE', 'DE', 'BRO', 'BDE'];

// Team display names for reports
export const TEAM_DISPLAY_NAMES = {
    'RO': 'RO zooplus', 'HU': 'HU zooplus', 'IT': 'IT zooplus',
    'NL': 'NL zooplus', 'CS': 'CS zooplus', 'SK': 'SK zooplus',
    'SV-SE': 'SV-SE zooplus', 'DE': 'DE zooplus', 'BRO': 'BRO zooplus', 'BDE': 'BDE zooplus',
    '2L': '2nd Level', 'QA': 'QA', 'TL': 'Team Lead'
};

// --- Month-keyed data helpers (for multi-month planner support) ---

/** Returns "YYYY-MM" from a Date object */
export function getMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthStartFromKey(monthKey) {
    const [yearStr, monthStr] = String(monthKey || '').split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (!year || !month) return null;
    return new Date(year, month - 1, 1);
}

export function rewriteMonthlyDaysForPrimaryTeamChange(agent, newPrimaryTeam, fromDate) {
    const from = normalizeAgentLifecycleDate(fromDate);
    if (!from || !agent?.monthlyDays) return {};

    const fromMonthKey = getMonthKey(from);
    const newTeamCode = String(newPrimaryTeam || '').trim().split(' ')[0]?.toUpperCase() || '';
    if (!newTeamCode) return {};

    const updates = {};

    Object.keys(agent.monthlyDays)
        .filter(monthKey => monthKey >= fromMonthKey)
        .sort()
        .forEach(monthKey => {
            const monthStart = getMonthStartFromKey(monthKey);
            if (!monthStart) return;

            const year = monthStart.getFullYear();
            const month = monthStart.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const nextDays = [...(agent.monthlyDays[monthKey] || [])];
            while (nextDays.length < 31) nextDays.push('');

            for (let day = 1; day <= daysInMonth; day++) {
                const cellDate = new Date(year, month, day);
                cellDate.setHours(0, 0, 0, 0);
                if (cellDate < from) continue;

                const dayIndex = day - 1;
                const currentValue = String(nextDays[dayIndex] || '').trim();
                if (!currentValue || currentValue.includes('+') || isNonWorkingCode(currentValue)) continue;

                const parsed = parseShiftEntry(currentValue);
                if (!parsed) continue;

                const oldTeamCode = normalizeTeamForDisplay(getEffectivePrimaryTeamCode(agent, cellDate));
                const parsedTeamCode = parsed.team ? normalizeTeamForDisplay(parsed.team) : null;
                if (parsedTeamCode && parsedTeamCode !== oldTeamCode) continue;

                nextDays[dayIndex] = `${formatPlannerHoursValue(parsed.hours)}${newTeamCode}`;
            }

            updates[monthKey] = nextDays;
        });

    return updates;
}

function applyHireDateBoundaryToDays(agent, monthKey, sourceDays = []) {
    const hireDate = normalizeAgentLifecycleDate(agent?.hireDate);
    if (!hireDate) return [...sourceDays];

    const [yearStr, monthStr] = String(monthKey || '').split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;

    if (Number.isNaN(year) || Number.isNaN(month)) {
        return [...sourceDays];
    }

    const monthStart = new Date(year, month, 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0);
    monthEnd.setHours(0, 0, 0, 0);

    if (monthEnd < hireDate) {
        return [];
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const normalizedDays = [...sourceDays];
    while (normalizedDays.length < 31) normalizedDays.push('');

    if (monthStart.getFullYear() === hireDate.getFullYear() && monthStart.getMonth() === hireDate.getMonth()) {
        for (let day = 1; day < hireDate.getDate(); day++) {
            normalizedDays[day - 1] = '';
        }
    }

    for (let day = daysInMonth + 1; day <= 31; day++) {
        normalizedDays[day - 1] = '';
    }

    return normalizedDays;
}

/**
 * Generates a default weekday schedule from an agent's contract info.
 * Returns a 31-element array: "{hours}{team}" on Mon-Fri, "" on weekends/overflow.
 */
export function generateDefaultSchedule(agent, monthKey) {
    const hours = agent.contractHours || 8;
    const [yearStr, monthStr] = monthKey.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    const hireDate = normalizeAgentLifecycleDate(agent?.hireDate);

    for (let d = 1; d <= 31; d++) {
        if (d <= daysInMonth) {
            const cellDate = new Date(year, month, d);
            if (hireDate && cellDate < hireDate) {
                days.push('');
                continue;
            }
            const dayOfWeek = new Date(year, month, d).getDay();
            const teamCode = getEffectivePrimaryTeamCode(agent, cellDate);
            const entry = teamCode ? `${hours}${teamCode}` : `${hours}`;
            days.push(dayOfWeek >= 1 && dayOfWeek <= 5 ? entry : '');
        } else {
            days.push('');
        }
    }
    return days;
}

/** Returns the days array for a specific month.
 *  Priority: saved monthlyDays > legacy days > auto-generated from contract.
 *  Auto-generation only for months on/after the agent's hire date. */
export function getAgentDaysForMonth(agent, monthKey) {
    const hireDate = normalizeAgentLifecycleDate(agent?.hireDate);
    if (hireDate) {
        const hireMonthKey = getMonthKey(hireDate);
        if (monthKey < hireMonthKey) return [];
    }

    // 1. Migrated agent — use saved month data
    if (agent.monthlyDays) {
        if (agent.monthlyDays[monthKey]) {
            return applyHireDateBoundaryToDays(agent, monthKey, agent.monthlyDays[monthKey]);
        }
        // 2. No data for this month — auto-generate if after hire date
        if (agent.contractHours && agent.primaryTeam) {
            return applyHireDateBoundaryToDays(agent, monthKey, generateDefaultSchedule(agent, monthKey));
        }
        return [];
    }
    // 3. Fully unmigrated agent — legacy flat array
    return applyHireDateBoundaryToDays(agent, monthKey, agent.days || []);
}

/** Returns the planner value that should be visible/effective for a given date. */
export function getEffectiveAgentDayValue(agent, date) {
    const lifecycleState = getAgentLifecycleState(agent, date);
    if (lifecycleState.isBeforeStart) {
        return '';
    }

    if (lifecycleState.isInactive) {
        return 'DZ';
    }

    const monthKey = getMonthKey(date);
    const dayIndex = date.getDate() - 1;
    const daysArray = getAgentDaysForMonth(agent, monthKey);
    return daysArray[dayIndex] || '';
}

/** Returns the notes object for a specific month, with backward-compat fallback. */
export function getAgentNotesForMonth(agent, monthKey) {
    if (agent.monthlyNotes) {
        return agent.monthlyNotes[monthKey] || {};
    }
    return agent.dayNotes || {};
}
