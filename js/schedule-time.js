// Schedule Time helpers — PURE, DOM-free time math for the Orar (Schedule) section.
//
// Phase 1 scope: parsing/validating 24h "HH:MM" strings, computing worked
// minutes for a single same-day shift, and formatting minutes as an hours
// string for the preview table and demo visuals.
//
// IMPORTANT: no overnight support in Phase 1. A shift whose end_time is less
// than or equal to its start_time is treated as invalid here; overnight shifts
// (end past midnight) are intentionally out of scope and documented as a
// future-phase concern.
//
// This module is side-effect-free so it unit-tests cleanly without a DOM or
// browser globals.

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/**
 * Parse a 24h "HH:MM" (or "H:MM") string into minutes since 00:00.
 * Accepts a single- or double-digit hour. Hours 0-23, minutes 0-59.
 * Returns null for anything invalid (letters, out-of-range, missing colon,
 * empty, non-string, extra characters).
 *
 * @param {string} str
 * @returns {number|null} minutes since midnight, or null when invalid
 */
export function parseTimeToMinutes(str) {
    if (typeof str !== 'string') return null;

    const match = TIME_PATTERN.exec(str.trim());
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;

    return hours * 60 + minutes;
}

/**
 * Boolean wrapper over parseTimeToMinutes.
 *
 * @param {string} str
 * @returns {boolean} true when str is a valid 24h "HH:MM" time
 */
export function isValidTimeString(str) {
    return parseTimeToMinutes(str) !== null;
}

/**
 * Coerce a break value into a non-negative number of minutes.
 * Blank, null, undefined, or NaN-producing input becomes 0.
 * Negative values are clamped to 0.
 *
 * @param {*} value
 * @returns {number} non-negative break minutes
 */
function coerceBreakMinutes(value) {
    if (value === null || value === undefined || value === '') return 0;
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return num < 0 ? 0 : num;
}

/**
 * Compute worked minutes for a single same-day shift:
 *   worked = (end - start) - break
 *
 * Returns null when:
 *   - either time string is invalid,
 *   - end <= start (no overnight support in Phase 1), or
 *   - break >= the start-to-end span (break would consume the whole shift).
 *
 * The break is coerced to a non-negative number; blank/NaN becomes 0.
 *
 * @param {string} startStr 24h "HH:MM"
 * @param {string} endStr 24h "HH:MM"
 * @param {number|string} [breakMinutes=0]
 * @returns {number|null} worked minutes, or null when invalid
 */
export function computeWorkedMinutes(startStr, endStr, breakMinutes = 0) {
    const start = parseTimeToMinutes(startStr);
    const end = parseTimeToMinutes(endStr);
    if (start === null || end === null) return null;

    // No overnight in Phase 1: the shift must end strictly after it starts.
    if (end <= start) return null;

    const span = end - start;
    const breakMins = coerceBreakMinutes(breakMinutes);

    // A break equal to or longer than the shift leaves no worked time.
    if (breakMins >= span) return null;

    return span - breakMins;
}

/**
 * Format a minute count as an hours string with one decimal, trimming a
 * trailing ".0" (e.g. 450 => "7.5", 480 => "8"). Returns "" for null/NaN.
 *
 * @param {number|null} mins
 * @returns {string} hours string, or "" when null/NaN
 */
export function formatMinutesAsHours(mins) {
    if (mins === null || mins === undefined) return '';
    const num = Number(mins);
    if (!Number.isFinite(num)) return '';

    const hours = num / 60;
    // One decimal, then drop a trailing ".0" so whole hours read cleanly.
    return hours.toFixed(1).replace(/\.0$/, '');
}

/**
 * Worked minutes from a shift start up to an intra-day cutoff:
 *   worked = (cutoff - start) - break, clamped to >= 0
 *
 * Returns null when cutoff or start is invalid, or when cutoff <= start.
 *
 * FOUNDATION FOR A LATER PHASE: this supports future intra-day productivity
 * (e.g. "how many hours has an agent worked so far by 13:00 today"). It is not
 * wired into any Phase 1 feature yet.
 *
 * @param {string} cutoffStr 24h "HH:MM"
 * @param {string} startStr 24h "HH:MM"
 * @param {number|string} [breakMinutes=0]
 * @returns {number|null} worked minutes so far (>= 0), or null when invalid
 */
export function workedMinutesUntil(cutoffStr, startStr, breakMinutes = 0) {
    const cutoff = parseTimeToMinutes(cutoffStr);
    const start = parseTimeToMinutes(startStr);
    if (cutoff === null || start === null) return null;
    if (cutoff <= start) return null;

    const breakMins = coerceBreakMinutes(breakMinutes);
    const worked = (cutoff - start) - breakMins;
    return worked < 0 ? 0 : worked;
}
