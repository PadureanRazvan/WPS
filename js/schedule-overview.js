// js/schedule-overview.js
//
// Schedule ("Orar") overview read model — Phase 2. PURE, DOM-free.
//
// Turns the stored rows of a saved month schedule into the summary metrics and
// the sorted, display-ready row list the overview panel renders. Working rows
// (status other than "dayoff") drive the metrics; day-off rows are kept for the
// table but do not count toward scheduled agents, average start, or total hours.
//
// Side-effect-free so it unit-tests cleanly without a DOM. Reuses the pure time
// helper from ./schedule-time.js for worked-hours formatting.

import { formatMinutesAsHours } from './schedule-time.js';

function str(value) {
    return value === null || value === undefined ? '' : String(value);
}

function isDayOff(row) {
    return str(row?.status) === 'dayoff';
}

// Average a list of "HH:MM" start strings into a single "HH:MM" string.
// Ignores anything that is not a valid HH:MM. Returns "" for an empty result.
function averageStartTime(startTimes) {
    const valid = startTimes.filter(time => /^\d{1,2}:\d{2}$/.test(str(time)));
    if (!valid.length) return '';
    const totalMinutes = valid.reduce((sum, time) => {
        const [hh, mm] = str(time).split(':');
        return sum + (Number(hh) * 60 + Number(mm));
    }, 0);
    const avg = Math.round(totalMinutes / valid.length);
    const hh = Math.floor(avg / 60);
    const mm = avg % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Sort by date ascending, then by agent display name (case-insensitive).
function compareRows(a, b) {
    const da = str(a.date);
    const db = str(b.date);
    if (da !== db) return da < db ? -1 : 1;
    const na = str(a.agentName || a.agentUsername).toLowerCase();
    const nb = str(b.agentName || b.agentUsername).toLowerCase();
    if (na !== nb) return na < nb ? -1 : 1;
    return 0;
}

/**
 * Build the overview read model for a saved month's stored rows.
 *
 * @param {Array<object>} [rows=[]] stored schedule rows (see schedule-persistence)
 * @param {{ rosterSize?: number }} [options={}] rosterSize drives coverage %
 * @returns {{ rows: object[], metrics: object }}
 */
export function buildScheduleOverview(rows = [], options = {}) {
    const list = Array.isArray(rows) ? rows.slice() : [];
    const rosterSize = Number.isFinite(options.rosterSize) ? options.rosterSize : 0;

    const working = list.filter(row => !isDayOff(row));
    const uniqueAgents = new Set(
        working.map(row => str(row.agentUsername).toLowerCase()).filter(Boolean)
    );

    const totalWorkedMinutes = working.reduce(
        (sum, row) => sum + (Number(row.workedMinutes) || 0),
        0
    );

    const agentsScheduled = uniqueAgents.size;
    const metrics = {
        agentsScheduled,
        avgStart: averageStartTime(working.map(row => row.startTime)),
        totalShiftHours: Math.round((totalWorkedMinutes / 60) * 10) / 10,
        coveragePct: rosterSize > 0 ? Math.round((agentsScheduled / rosterSize) * 100) : 0,
        totalShifts: working.length,
        daysOff: list.length - working.length
    };

    const sortedRows = list.sort(compareRows).map(row => ({
        agentName: str(row.agentName),
        agentUsername: str(row.agentUsername),
        date: str(row.date),
        startTime: str(row.startTime),
        endTime: str(row.endTime),
        breakMinutes: Number(row.breakMinutes) || 0,
        workedHours: isDayOff(row) ? '' : formatMinutesAsHours(Number(row.workedMinutes) || 0),
        status: str(row.status) || 'ok'
    }));

    return { rows: sortedRows, metrics };
}
