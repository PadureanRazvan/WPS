// Schedule Validation — PURE, DOM-free validation for imported Orar (Schedule) rows.
//
// Phase 1 scope: validate a batch of parsed schedule rows (one shift per agent
// per day) against a known agent list, flagging unknown agents, bad dates,
// month mismatches, malformed times, impossible shifts, oversized breaks, and
// duplicate (agent, date) pairs. Clean rows get their worked minutes computed;
// rows with an empty start AND end are treated as a day off (not an error).
//
// IMPORTANT: no overnight support in Phase 1. A shift whose end_time is less
// than or equal to its start_time is an END_BEFORE_START error here; overnight
// shifts (end past midnight) are intentionally out of scope and documented as a
// future-phase concern.
//
// This module is side-effect-free and DOM-free so it unit-tests cleanly without
// a browser. It reuses the pure time helpers from ./schedule-time.js and the
// agent name/username matcher from ./productivity-metrics.js (used only as a
// secondary fallback — agent_username is the primary identifier per the client).

import {
    parseTimeToMinutes,
    computeWorkedMinutes
} from './schedule-time.js';
import { findProductivityAgent } from './productivity-metrics.js';

// Stable error codes (also used as data-translate-friendly identifiers by the UI).
export const SCHEDULE_ERROR_CODES = {
    UNKNOWN_AGENT: 'UNKNOWN_AGENT',
    INVALID_DATE: 'INVALID_DATE',
    MONTH_MISMATCH: 'MONTH_MISMATCH',
    INVALID_START: 'INVALID_START',
    INVALID_END: 'INVALID_END',
    END_BEFORE_START: 'END_BEFORE_START',
    BREAK_TOO_LONG: 'BREAK_TOO_LONG',
    DUPLICATE: 'DUPLICATE'
};

// Default English messages. The UI may map codes to its own data-translate
// strings; these keep the pure module self-describing for logs and tests.
const DEFAULT_MESSAGES = {
    UNKNOWN_AGENT: 'No agent matches this username.',
    INVALID_DATE: 'Date is not a real calendar date (expected YYYY-MM-DD).',
    MONTH_MISMATCH: 'Date month does not match the expected month.',
    INVALID_START: 'Start time is not a valid 24h HH:MM value.',
    INVALID_END: 'End time is not a valid 24h HH:MM value.',
    END_BEFORE_START: 'End time must be after start time (no overnight shifts in Phase 1).',
    BREAK_TOO_LONG: 'Break is equal to or longer than the shift span.',
    DUPLICATE: 'Duplicate row: this agent already has a shift on this date.'
};

function makeError(code) {
    return { code, message: DEFAULT_MESSAGES[code] || code };
}

function asTrimmedString(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

// Strict "YYYY-MM-DD" calendar-date check. Returns the matching "YYYY-MM"
// month key when the date is real, or null when it is malformed or impossible
// (e.g. 2026-02-30, 2026-13-01). Uses UTC construction so it is timezone-proof.
function getDateMonthKey(dateStr) {
    const text = asTrimmedString(dateStr);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    // Round-trip through a UTC Date to reject impossible days (e.g. Feb 30).
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return `${match[1]}-${match[2]}`;
}

// Resolve a row to a known agent. Primary: case-insensitive username match.
// Secondary fallback: findProductivityAgent on the human-readable agent_name.
function resolveAgent(row, agents) {
    const username = asTrimmedString(row?.agentUsername).toLowerCase();
    if (username) {
        const byUsername = agents.find(
            agent => asTrimmedString(agent?.username).toLowerCase() === username
        );
        if (byUsername) return byUsername;
    }

    const name = asTrimmedString(row?.agentName);
    if (name) {
        const byName = findProductivityAgent(name, agents);
        if (byName) return byName;
    }

    return null;
}

// Build a count of how many times each (username|date) pair appears in the
// batch so we can flag every member of a duplicate group. Rows with a blank
// username or blank date never participate in duplicate detection.
function buildDuplicateCounts(rows) {
    const counts = new Map();
    rows.forEach(row => {
        const username = asTrimmedString(row?.agentUsername).toLowerCase();
        const date = asTrimmedString(row?.date);
        if (!username || !date) return;
        const key = `${username}|${date}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
}

/**
 * Validate a batch of parsed schedule rows.
 *
 * Each row is expected to carry (at least): agentUsername, agentName, month,
 * date ("YYYY-MM-DD"), startTime ("HH:MM"), endTime ("HH:MM"), breakMinutes.
 *
 * Status per row:
 *   - "dayoff": startTime AND endTime both empty — no errors, workedMinutes 0.
 *   - "error":  one or more validation errors — workedMinutes null.
 *   - "ok":     clean working row — workedMinutes computed.
 *
 * @param {Array<object>} rows parsed schedule rows
 * @param {Array<object>} [agents=[]] known agents (with username / fullName)
 * @param {{ expectedMonth?: string }} [options={}]
 * @returns {{ results: Array<object>, summary: { ok: number, errors: number, daysOff: number, total: number } }}
 */
export function validateScheduleRows(rows, agents = [], options = {}) {
    const rowList = Array.isArray(rows) ? rows : [];
    const agentList = Array.isArray(agents) ? agents : [];
    const expectedMonth = asTrimmedString(options?.expectedMonth);

    const duplicateCounts = buildDuplicateCounts(rowList);

    const summary = { ok: 0, errors: 0, daysOff: 0, total: rowList.length };

    const results = rowList.map(row => {
        const errors = [];

        // Agent resolution (username primary, name fallback).
        const resolvedAgent = resolveAgent(row, agentList);
        if (!resolvedAgent) {
            errors.push(makeError(SCHEDULE_ERROR_CODES.UNKNOWN_AGENT));
        }

        // Date + month checks. A bad date short-circuits the month comparison.
        const dateStr = asTrimmedString(row?.date);
        const dateMonthKey = getDateMonthKey(dateStr);
        if (dateMonthKey === null) {
            errors.push(makeError(SCHEDULE_ERROR_CODES.INVALID_DATE));
        } else {
            // Compare against the explicit expectedMonth when provided,
            // otherwise against the row's own month column.
            const referenceMonth = expectedMonth || asTrimmedString(row?.month);
            if (referenceMonth && dateMonthKey !== referenceMonth) {
                errors.push(makeError(SCHEDULE_ERROR_CODES.MONTH_MISMATCH));
            }
        }

        // Duplicate (agent_username, date) within the batch.
        const dupUsername = asTrimmedString(row?.agentUsername).toLowerCase();
        if (dupUsername && dateStr && duplicateCounts.get(`${dupUsername}|${dateStr}`) > 1) {
            errors.push(makeError(SCHEDULE_ERROR_CODES.DUPLICATE));
        }

        // Time / shift checks. Empty start AND end => day off.
        const startStr = asTrimmedString(row?.startTime);
        const endStr = asTrimmedString(row?.endTime);
        const isDayOff = startStr === '' && endStr === '';

        let workedMinutes = null;

        if (isDayOff) {
            workedMinutes = 0;
        } else {
            const start = parseTimeToMinutes(startStr);
            const end = parseTimeToMinutes(endStr);

            if (start === null) {
                errors.push(makeError(SCHEDULE_ERROR_CODES.INVALID_START));
            }
            if (end === null) {
                errors.push(makeError(SCHEDULE_ERROR_CODES.INVALID_END));
            }

            // Only run span/break checks when both endpoints are valid times.
            if (start !== null && end !== null) {
                if (end <= start) {
                    errors.push(makeError(SCHEDULE_ERROR_CODES.END_BEFORE_START));
                } else {
                    const computed = computeWorkedMinutes(startStr, endStr, row?.breakMinutes);
                    // computeWorkedMinutes returns null only for break >= span here
                    // (times are valid and end > start), so that maps to BREAK_TOO_LONG.
                    if (computed === null) {
                        errors.push(makeError(SCHEDULE_ERROR_CODES.BREAK_TOO_LONG));
                    } else {
                        workedMinutes = computed;
                    }
                }
            }
        }

        let status;
        if (errors.length > 0) {
            status = 'error';
            workedMinutes = null;
            summary.errors += 1;
        } else if (isDayOff) {
            status = 'dayoff';
            summary.daysOff += 1;
        } else {
            status = 'ok';
            summary.ok += 1;
        }

        return {
            row,
            status,
            errors,
            resolvedAgent: resolvedAgent || null,
            workedMinutes
        };
    });

    return { results, summary };
}
