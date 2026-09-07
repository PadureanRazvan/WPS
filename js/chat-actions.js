import { getAgentDaysForMonth, getMonthKey, isNonWorkingCode, parseShiftEntry, extractHoursFromDay, PLANNER_TEAMS } from './config.js';
import { buildCreateAgentCommand } from './users-command.js';

const TEAMS = new Set(['RO zooplus', 'HU zooplus', 'IT zooplus', 'NL zooplus', 'CS zooplus', 'SK zooplus', 'SV-SE zooplus', '2L 2nd Level', 'QA Quality Assurance', 'TL Team Lead']);
const SECTIONS = new Set(['dashboard', 'users', 'planner', 'productivity', 'upload', 'reports', 'logs', 'info']);
const normalizeName = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function getChatCalendarDate(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now).map(part => [part.type, part.value]));
    return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

function invalid() {
    const error = new Error('Invalid or ambiguous proposed changes. Ask Sherpa to prepare them again.');
    error.code = 'invalid-action';
    return error;
}

export function findAgentById(agents, id) {
    if (typeof id !== 'string' || !id) return null;
    const matches = agents.filter(agent => agent.id === id);
    return matches.length === 1 ? matches[0] : null;
}

export function buildChatActionPlan(rawActions, agents, { now = new Date() } = {}) {
    if (!Array.isArray(rawActions) || rawActions.length > 15) throw invalid();
    const calendarDate = getChatCalendarDate(now);
    const monthKey = getMonthKey(calendarDate);
    const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
    const byId = new Map(), updatesById = new Map(), deleted = new Set(), cellKeys = new Set();
    const creates = [], actions = [], navigations = [];
    const names = new Set(agents.map(agent => normalizeName(agent.fullName)));
    const usernames = new Set(agents.map(agent => normalizeName(agent.username)));

    for (const { command, params } of rawActions) {
        const count = { SET_CELL: 3, ADD_AGENT: 5, DELETE_AGENT: 1, NAVIGATE: 1 }[command];
        if (!count || !Array.isArray(params) || params.length !== count || params.some(value => typeof value !== 'string' || value.length > 1000)) throw invalid();
        if (command === 'NAVIGATE') {
            if (!SECTIONS.has(params[0])) throw invalid();
            navigations.push(params[0]);
            continue;
        }
        if (command === 'ADD_AGENT') {
            const [fullName, username, primaryTeam, contractType, hours] = params;
            if (fullName.trim().length < 3 || !username.trim() || !TEAMS.has(primaryTeam)
                || !['Full-time', 'Part-time'].includes(contractType) || !/^[4-8]$/.test(hours)
                || (contractType === 'Full-time' && hours !== '8')
                || names.has(normalizeName(fullName)) || usernames.has(normalizeName(username))) throw invalid();
            const hireDateStr = `${monthKey}-${String(calendarDate.getDate()).padStart(2, '0')}`;
            const result = buildCreateAgentCommand({ fullName, username, primaryTeam, contractType, contractHours: hours, hireDateStr }, { now: calendarDate });
            if (!result.ok) throw invalid();
            names.add(normalizeName(fullName));
            usernames.add(normalizeName(username));
            creates.push(result.payload);
            actions.push({ command, agentName: fullName, username, primaryTeam, contractType, hours, dateKey: hireDateStr });
            continue;
        }
        const agent = findAgentById(agents, params[0]);
        if (!agent) throw invalid();
        byId.set(agent.id, agent);
        if (command === 'DELETE_AGENT') {
            if (deleted.has(agent.id) || updatesById.has(agent.id)) throw invalid();
            deleted.add(agent.id);
            actions.push({ command, agentName: agent.fullName, username: agent.username || '', primaryTeam: agent.primaryTeam || '' });
            continue;
        }
        const [, day, value] = params;
        if (!/^([1-9]|[12][0-9]|3[01])$/.test(day) || Number(day) > daysInMonth || deleted.has(agent.id)) throw invalid();
        const entries = value.split('+').map(part => parseShiftEntry(part));
        if (value && !isNonWorkingCode(value) && (!entries.every(entry => entry && entry.hours > 0 && (!entry.team || PLANNER_TEAMS.includes(entry.team))) || extractHoursFromDay(value) > 12)) throw invalid();
        const cellKey = `${agent.id}|${day}`;
        if (cellKeys.has(cellKey)) throw invalid();
        cellKeys.add(cellKey);
        if (!updatesById.has(agent.id)) {
            const days = [...getAgentDaysForMonth(agent, monthKey)];
            while (days.length < 31) days.push('');
            updatesById.set(agent.id, { agentId: agent.id, updateData: { [`monthlyDays.${monthKey}`]: days } });
        }
        updatesById.get(agent.id).updateData[`monthlyDays.${monthKey}`][Number(day) - 1] = value;
        actions.push({ command, agentName: agent.fullName, username: agent.username || '', dateKey: `${monthKey}-${day.padStart(2, '0')}`, value,
            exceedsContract: extractHoursFromDay(value) > (agent.contractHours || 8) });
    }
    // Missing stored month arrays must still use their effective default schedule as the baseline.
    const baselines = [...byId.values()].map(agent => updatesById.has(agent.id) ? {
        ...agent, monthlyDays: { ...agent.monthlyDays, [monthKey]: [...getAgentDaysForMonth(agent, monthKey)] }
    } : agent);
    return { monthKey, actions, navigations, creates, deletes: [...deleted], updates: [...updatesById.values()], baselines,
        requiresConfirmation: actions.length > 0 };
}
