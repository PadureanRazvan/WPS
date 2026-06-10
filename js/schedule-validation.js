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

// Remove an Excel "text guard" from a value. The CSV template emits dates as
// ="2026-06-01" so Excel keeps them as text instead of reformatting them; our
// quote-aware CSV parser turns that into =2026-06-01, and some tools leave it as
// ="2026-06-01". Strip both shapes so the inner value can be parsed.
function stripExcelGuard(value) {
    let text = asTrimmedString(value);
    if (text.startsWith('=')) text = text.slice(1);
    const quoted = /^"(.*)"$/.exec(text);
    if (quoted) text = quoted[1];
    return text.trim();
}

// Confirm a (year, month, day) triple is a real calendar date (UTC round-trip,
// timezone-proof) and return canonical "YYYY-MM-DD", or null when impossible
// (e.g. 2026-02-30, 2026-13-01).
function toCanonicalDate(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }
    const pad = n => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Normalize a date cell to canonical "YYYY-MM-DD", or null when it cannot be
 * resolved unambiguously. Accepts (after stripping any Excel text guard):
 *   - year-first ISO with -, / or . separators: 2026-06-01, 2026/06/01, 2026.06.01
 *   - day/month-first with a 4-digit year ONLY when one of the leading parts is
 *     > 12, which forces the day: 13/06/2026 -> 2026-06-13
 *
 * Ambiguous day/month dates (both <= 12, e.g. 06.07.2026) are deliberately
 * REJECTED rather than guessed — a silently swapped day/month would corrupt a
 * schedule. Those surface as INVALID_DATE so the user restores YYYY-MM-DD.
 *
 * @param {*} raw
 * @returns {string|null} canonical "YYYY-MM-DD" or null
 */
export function normalizeScheduleDate(raw) {
    const text = stripExcelGuard(raw);
    if (text === '') return null;

    // Year-first (unambiguous).
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
    if (m) {
        return toCanonicalDate(Number(m[1]), Number(m[2]), Number(m[3]));
    }

    // Day/month-first with a 4-digit year: resolvable only when one leading
    // part is > 12 (that part must be the day).
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
    if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        const year = Number(m[3]);
        if (a > 12 && b <= 12) return toCanonicalDate(year, b, a);
        if (b > 12 && a <= 12) return toCanonicalDate(year, a, b);
        return null; // ambiguous (both <= 12) or both > 12
    }

    return null;
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
        const date = normalizeScheduleDate(row?.date);
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

        // Date + month checks. Normalize first (Excel-safe); a bad date
        // short-circuits the month comparison.
        const normalizedDate = normalizeScheduleDate(row?.date);
        if (normalizedDate === null) {
            errors.push(makeError(SCHEDULE_ERROR_CODES.INVALID_DATE));
        } else {
            // Compare against the explicit expectedMonth when provided,
            // otherwise against the row's own month column.
            const referenceMonth = expectedMonth || asTrimmedString(row?.month);
            if (referenceMonth && normalizedDate.slice(0, 7) !== referenceMonth) {
                errors.push(makeError(SCHEDULE_ERROR_CODES.MONTH_MISMATCH));
            }
        }

        // Duplicate (agent_username, date) within the batch (normalized date).
        const dupUsername = asTrimmedString(row?.agentUsername).toLowerCase();
        if (dupUsername && normalizedDate && duplicateCounts.get(`${dupUsername}|${normalizedDate}`) > 1) {
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
            workedMinutes,
            normalizedDate
        };
    });

    return { results, summary };
}
