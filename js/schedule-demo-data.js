// Schedule Demo Data — PURE, DOM-free generator for the Orar (Schedule) section.
//
// Phase 1 scope: this module fabricates DISPLAY-ONLY placeholder shift data so
// the new "Orar" visual section looks alive before any real import/persistence
// exists. The output is meant only for rendering the stylish demo panel and its
// summary metrics.
//
// HARD CONSTRAINTS:
//   - This data is DISPLAY-ONLY. It must NEVER be persisted (no Firestore),
//     never passed into Planner/Productivity/Reports/Users logic, and never
//     treated as a real schedule. It exists purely to populate a demo visual.
//   - Generation is DETERMINISTIC. It is seeded from each agent's
//     username/index via a tiny string hash plus a seeded linear-congruential
//     generator (LCG). It does NOT call Math.random and does NOT use any
//     time-based seed, so the same input always yields byte-identical output.
//     That stability keeps renders flicker-free and makes the module
//     unit-testable.
//
// This module is side-effect-free so it unit-tests cleanly without a DOM or
// browser globals. It reuses the pure time helpers from ./schedule-time.js for
// worked-hours math (sibling module in the same Orar feature area).

import { computeWorkedMinutes, formatMinutesAsHours } from './schedule-time.js';

// Believable shift starts for the demo. Each is paired with an ~8h span so the
// generated end_time stays within the same day (no overnight in Phase 1).
const SHIFT_STARTS = ['08:00', '09:00', '10:00', '14:00'];

// A short rotation of team codes so the demo table shows some variety. These
// mirror the team-code style used elsewhere in the app but are illustrative
// only — they are not validated against real teams.
const DEMO_TEAMS = ['RO', 'IT', 'HU', 'NL'];

const DEFAULT_SPAN_MINUTES = 8 * 60; // ~8h shift
const DEFAULT_BREAK_MINUTES = 30;
const DEFAULT_DEMO_DATE = '2026-06-01';

// Fabricated placeholder roster used when the caller passes no agents. The first
// two entries are intentionally fixed (Maria Popescu / mpopescu and Andrei
// Ionescu / ionescu) per the Phase 1 spec so the section reads as realistic.
const FALLBACK_AGENTS = [
    { fullName: 'Maria Popescu', username: 'mpopescu' },
    { fullName: 'Andrei Ionescu', username: 'ionescu' },
    { fullName: 'Elena Dumitrescu', username: 'edumitrescu' },
    { fullName: 'Cristian Stan', username: 'cstan' },
    { fullName: 'Ioana Marin', username: 'imarin' },
    { fullName: 'Vlad Georgescu', username: 'vgeorgescu' }
];

/**
 * Tiny deterministic string hash (FNV-1a, 32-bit). Pure and stable: the same
 * string always maps to the same unsigned 32-bit integer. Used only to seed the
 * LCG below — never for security.
 *
 * @param {string} str
 * @returns {number} unsigned 32-bit hash
 */
function hashString(str) {
    let hash = 0x811c9dc5; // FNV offset basis
    const text = String(str ?? '');
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        // FNV prime multiply, kept in 32-bit range via Math.imul.
        hash = Math.imul(hash, 0x01000193);
    }
    // Coerce to an unsigned 32-bit integer.
    return hash >>> 0;
}

/**
 * Create a seeded pseudo-random generator (linear-congruential generator).
 * Deterministic: a given seed produces a fixed sequence of floats in [0, 1).
 * This deliberately replaces Math.random so demo output is reproducible and
 * unit-testable.
 *
 * Constants are the widely used Numerical Recipes LCG (modulus 2^32).
 *
 * @param {number} seed
 * @returns {() => number} next() returning a float in [0, 1)
 */
function createSeededRandom(seed) {
    // Keep state as an unsigned 32-bit integer; avoid a zero state.
    let state = (seed >>> 0) || 1;
    return function next() {
        // state = (a * state + c) mod 2^32, with Math.imul for 32-bit multiply.
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        return state / 0x100000000; // divide by 2^32 -> [0, 1)
    };
}

/**
 * Pick a deterministic item from a list using one draw of the seeded RNG.
 *
 * @template T
 * @param {() => number} rand
 * @param {T[]} list
 * @returns {T}
 */
function pickFrom(rand, list) {
    const index = Math.floor(rand() * list.length) % list.length;
    return list[index];
}

/**
 * Add a minute count to a "HH:MM" start string, returning a "HH:MM" end string.
 * Always same-day in Phase 1 (callers keep spans well under 24h).
 *
 * @param {string} startStr 24h "HH:MM"
 * @param {number} addMinutes
 * @returns {string} 24h "HH:MM"
 */
function addMinutesToTime(startStr, addMinutes) {
    const [hourPart, minutePart] = String(startStr).split(':');
    const total = (Number(hourPart) * 60 + Number(minutePart)) + addMinutes;
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Normalize a caller-supplied agent into the minimal { fullName, username }
 * shape this generator needs. Mirrors the app convention that username is the
 * primary identifier and fullName is human-readable only.
 *
 * @param {object} agent
 * @param {number} index
 * @returns {{ fullName: string, username: string }}
 */
function normalizeAgent(agent, index) {
    const fullName = String(agent?.fullName || agent?.name || '').trim();
    const username = String(agent?.username || '').trim();
    return {
        fullName: fullName || username || `Agent ${index + 1}`,
        username: username || (fullName ? fullName.toLowerCase().replace(/\s+/g, '.') : `agent${index + 1}`)
    };
}

/**
 * Build one deterministic demo schedule row for a single agent.
 *
 * @param {{ fullName: string, username: string }} agent
 * @param {number} index agent's position in the roster (part of the seed)
 * @param {string} date "YYYY-MM-DD" demo date applied to every row
 * @returns {object|null} a row, or null if a (defensive) invalid span occurs
 */
function buildAgentRow(agent, index, date) {
    // Seed from username + index so each agent is stable and distinct, and so
    // reordering the roster does not silently reuse another agent's shift.
    const seed = hashString(`${agent.username}#${index}`);
    const rand = createSeededRandom(seed);

    const startTime = pickFrom(rand, SHIFT_STARTS);
    const team = pickFrom(rand, DEMO_TEAMS);
    const endTime = addMinutesToTime(startTime, DEFAULT_SPAN_MINUTES);
    const breakMinutes = DEFAULT_BREAK_MINUTES;

    const workedMinutes = computeWorkedMinutes(startTime, endTime, breakMinutes);
    if (workedMinutes === null) return null; // defensive; ~8h span never trips this

    return {
        agentName: agent.fullName,
        username: agent.username,
        date,
        startTime,
        endTime,
        breakMinutes,
        workedHours: formatMinutesAsHours(workedMinutes),
        team
    };
}

/**
 * Average a list of "HH:MM" start strings into a single "HH:MM" string.
 * Returns "" for an empty list.
 *
 * @param {string[]} startTimes
 * @returns {string} "HH:MM"
 */
function averageStartTime(startTimes) {
    if (!startTimes.length) return '';
    const totalMinutes = startTimes.reduce((sum, time) => {
        const [hh, mm] = String(time).split(':');
        return sum + (Number(hh) * 60 + Number(mm));
    }, 0);
    const avg = Math.round(totalMinutes / startTimes.length);
    const hh = Math.floor(avg / 60);
    const mm = avg % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Compute the DISPLAY-ONLY summary metrics for a set of demo rows.
 *
 * @param {object[]} rows
 * @param {number} rosterSize total agents considered (for coverage %)
 * @returns {{ agentsScheduled: number, avgStart: string, totalShiftHours: number, coveragePct: number }}
 */
function computeMetrics(rows, rosterSize) {
    const agentsScheduled = rows.length;
    const avgStart = averageStartTime(rows.map(row => row.startTime));
    const totalShiftHours = Math.round(
        rows.reduce((sum, row) => sum + (Number(row.workedHours) || 0), 0) * 10
    ) / 10;
    const coveragePct = rosterSize > 0
        ? Math.round((agentsScheduled / rosterSize) * 100)
        : 0;

    return { agentsScheduled, avgStart, totalShiftHours, coveragePct };
}

/**
 * Build the full DISPLAY-ONLY demo dataset for the Orar (Schedule) section.
 *
 * Deterministic: the same `agents`/`options` always yield identical output. No
 * Math.random, no time-based seed. Safe to call on every render.
 *
 * @param {Array<{ fullName?: string, name?: string, username?: string }>} [agents=[]]
 *        Real roster (only name/username are read). When empty, a fixed
 *        placeholder roster is fabricated so the section is not blank.
 * @param {{ date?: string }} [options={}]
 *        date: "YYYY-MM-DD" applied to every demo row (defaults to a fixed date
 *        so output stays stable and time-independent).
 * @returns {{ rows: object[], metrics: object }}
 */
export function buildScheduleDemoData(agents = [], options = {}) {
    const date = typeof options.date === 'string' && options.date.trim()
        ? options.date.trim()
        : DEFAULT_DEMO_DATE;

    const sourceAgents = Array.isArray(agents) && agents.length > 0
        ? agents
        : FALLBACK_AGENTS;

    const rows = sourceAgents
        .map((agent, index) => buildAgentRow(normalizeAgent(agent, index), index, date))
        .filter(Boolean);

    const metrics = computeMetrics(rows, sourceAgents.length);

    return { rows, metrics };
}
