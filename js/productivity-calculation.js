import {
    PRODUCTIVITY_TEAMS,
    getEffectiveAgentDayValue,
    getEffectivePrimaryTeamCode,
    normalizeTeamForDisplay,
    isNonWorkingCode,
    parseShiftEntry,
    extractHoursFromDay
} from './schedule-semantics.js';
import {
    findProductivityAgent,
    isPerAgentProductivityRoleExcluded,
    normalizeProductivityName
} from './productivity-metrics.js';

const PRODUCTIVITY_HOURS_EXCLUDED_PRIMARY_TEAM_CODES = new Set(['TL', 'QA']);

export function formatProductivityDateKey(date) {
    if (typeof date === 'string') return date;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function getProductivityDaysInRange(start, end) {
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(0, 0, 0, 0);
    return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function parsePlannerDayEntries(dayValue) {
    if (!dayValue || typeof dayValue !== 'string') return [];

    const trimmed = dayValue.trim();
    if (isNonWorkingCode(trimmed)) return [];

    return trimmed
        .split('+')
        .map(part => parseShiftEntry(part))
        .filter(Boolean)
        .map(parsed => ({
            hours: parsed.hours,
            team: parsed.team ? normalizeTeamForDisplay(parsed.team) : null
        }));
}

function getPrimaryTeamCode(agent, date = null) {
    if (date) {
        return normalizeTeamForDisplay(getEffectivePrimaryTeamCode(agent, date));
    }

    return normalizeTeamForDisplay(agent.primaryTeam?.split(' ')[0]?.toUpperCase() || '');
}

function hasExcludedProductivityHours(agent, date = null) {
    return PRODUCTIVITY_HOURS_EXCLUDED_PRIMARY_TEAM_CODES.has(getPrimaryTeamCode(agent, date));
}

export function getProductivityEligibleHoursForRange(agent, start, end) {
    let totalHours = 0;
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    while (current <= endDate) {
        if (!hasExcludedProductivityHours(agent, current)) {
            totalHours += extractHoursFromDay(getEffectiveAgentDayValue(agent, current));
        }
        current.setDate(current.getDate() + 1);
    }

    return totalHours;
}

export function getProductivityEligibleHoursForTeamInRange(agent, start, end, teamFilter) {
    let totalHours = 0;
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    const filterUpper = normalizeTeamForDisplay(teamFilter.toUpperCase());

    while (current <= endDate) {
        if (!hasExcludedProductivityHours(agent, current)) {
            const dayValue = getEffectiveAgentDayValue(agent, current);
            const primaryCode = getPrimaryTeamCode(agent, current);
            for (const entry of parsePlannerDayEntries(dayValue)) {
                const teamCode = entry.team || primaryCode;
                if (teamCode === filterUpper) {
                    totalHours += entry.hours;
                }
            }
        }
        current.setDate(current.getDate() + 1);
    }

    return totalHours;
}

export function getProductivityTeamsFromPlanner(agent, start, end) {
    const teams = new Set();
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    while (current <= endDate) {
        const dayValue = getEffectiveAgentDayValue(agent, current);
        for (const entry of parsePlannerDayEntries(dayValue)) {
            if (entry.team) {
                teams.add(entry.team);
            }
        }
        current.setDate(current.getDate() + 1);
    }

    return [...teams].sort();
}

export function hasAnyProductivityData(dataByDate) {
    for (const [, entry] of dataByDate) {
        if ((entry.ticketsData && entry.ticketsData.size > 0) || (entry.callsData && entry.callsData.size > 0)) return true;
    }
    return false;
}

export function mergeProductivityDataForRange({
    dataByDate,
    agents,
    start,
    end,
    excludePerAgentRoles = false
}) {
    const mergedTickets = new Map();
    const mergedCalls = new Map();
    let datesWithData = 0;

    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(0, 0, 0, 0);

    while (current <= endDate) {
        const dateKey = formatProductivityDateKey(current);
        const entry = dataByDate.get(dateKey);
        if (entry) {
            if (entry.ticketsData || entry.callsData) datesWithData++;

            const shouldSkipForPerAgent = (val) => {
                if (!excludePerAgentRoles) return false;
                const agent = findProductivityAgent(val.originalName, agents);
                return !agent || isPerAgentProductivityRoleExcluded(agent, current);
            };

            if (entry.ticketsData) {
                entry.ticketsData.forEach((val, key) => {
                    if (shouldSkipForPerAgent(val)) return;
                    if (!mergedTickets.has(key)) {
                        mergedTickets.set(key, { originalName: val.originalName, tickets: 0, teams: new Map() });
                    }
                    const merged = mergedTickets.get(key);
                    merged.tickets += val.tickets;
                    val.teams.forEach((count, team) => {
                        merged.teams.set(team, (merged.teams.get(team) || 0) + count);
                    });
                });
            }

            if (entry.callsData) {
                entry.callsData.forEach((val, key) => {
                    if (shouldSkipForPerAgent(val)) return;
                    if (!mergedCalls.has(key)) {
                        mergedCalls.set(key, { originalName: val.originalName, calls: 0, teams: new Map() });
                    }
                    const merged = mergedCalls.get(key);
                    merged.calls += val.calls;
                    val.teams.forEach((count, team) => {
                        merged.teams.set(team, (merged.teams.get(team) || 0) + count);
                    });
                });
            }
        }
        current.setDate(current.getDate() + 1);
    }

    return { mergedTickets, mergedCalls, datesWithData };
}

export function calculateProductivityOverview({
    dataByDate,
    agents,
    start,
    end,
    teamFilter = 'all'
}) {
    if (!hasAnyProductivityData(dataByDate)) return { rows: [], datesWithData: 0 };

    const { mergedTickets, mergedCalls, datesWithData } = mergeProductivityDataForRange({
        dataByDate,
        agents,
        start,
        end,
        excludePerAgentRoles: true
    });
    if (mergedTickets.size === 0 && mergedCalls.size === 0) {
        return { rows: [], datesWithData };
    }

    const rows = [];
    const allNames = new Set();
    mergedTickets.forEach((_, key) => allNames.add(key));
    mergedCalls.forEach((_, key) => allNames.add(key));

    allNames.forEach(normalizedName => {
        const ticketEntry = mergedTickets.get(normalizedName);
        const callEntry = mergedCalls.get(normalizedName);
        const originalName = ticketEntry?.originalName || callEntry?.originalName || normalizedName;
        const agent = findProductivityAgent(originalName, agents);
        if (!agent) return;

        const ticketsByTeam = new Map();
        const callsByTeam = new Map();
        if (ticketEntry?.teams) {
            ticketEntry.teams.forEach((count, team) => {
                const normalized = normalizeTeamForDisplay(team);
                ticketsByTeam.set(normalized, (ticketsByTeam.get(normalized) || 0) + count);
            });
        }
        if (callEntry?.teams) {
            callEntry.teams.forEach((count, team) => {
                const normalized = normalizeTeamForDisplay(team);
                callsByTeam.set(normalized, (callsByTeam.get(normalized) || 0) + count);
            });
        }

        let tickets;
        let calls;
        let hours;
        if (teamFilter !== 'all') {
            tickets = ticketsByTeam.get(teamFilter) || 0;
            calls = callsByTeam.get(teamFilter) || 0;
            if (tickets === 0 && calls === 0) return;
            hours = getProductivityEligibleHoursForTeamInRange(agent, start, end, teamFilter);
        } else {
            tickets = ticketEntry?.tickets || 0;
            calls = callEntry?.calls || 0;
            hours = getProductivityEligibleHoursForRange(agent, start, end);
        }
        const total = tickets + calls;

        const teamBreakdown = new Map();
        ticketsByTeam.forEach((count, team) => teamBreakdown.set(team, (teamBreakdown.get(team) || 0) + count));
        callsByTeam.forEach((count, team) => teamBreakdown.set(team, (teamBreakdown.get(team) || 0) + count));
        const fileTeams = [...teamBreakdown.keys()].filter(team => PRODUCTIVITY_TEAMS.includes(team)).sort();

        let teamsDisplay;
        if (teamFilter !== 'all') {
            teamsDisplay = teamFilter;
        } else if (fileTeams.length > 0) {
            teamsDisplay = fileTeams.join('/');
        } else {
            const plannerTeams = getProductivityTeamsFromPlanner(agent, start, end);
            teamsDisplay = plannerTeams.length > 0 ? plannerTeams.join('/') : (agent.primaryTeam?.split(' ')[0] || '-');
        }

        const productivity = hours > 0 ? (total / hours) : 0;

        rows.push({
            name: agent.fullName,
            primaryTeam: agent.primaryTeam || '',
            teamsDisplay,
            teams: teamBreakdown,
            tickets,
            calls,
            total,
            hours,
            productivity
        });
    });

    return {
        rows: rows.sort((a, b) => b.productivity - a.productivity),
        datesWithData
    };
}

export function getUploadedProductivityTeams(entry) {
    const teamSet = new Set();
    const addUploadedEntryTeams = (uploadedEntry) => {
        if (!uploadedEntry?.teams) return;
        uploadedEntry.teams.forEach((count, team) => {
            const normalizedTeam = normalizeTeamForDisplay(team);
            if (count > 0 && PRODUCTIVITY_TEAMS.includes(normalizedTeam)) {
                teamSet.add(normalizedTeam);
            }
        });
    };

    if (entry?.ticketsData) entry.ticketsData.forEach(addUploadedEntryTeams);
    if (entry?.callsData) entry.callsData.forEach(addUploadedEntryTeams);
    return teamSet;
}

export function getMatchedProductivityAgentNames(dataByDate, agents) {
    const agentNames = new Map();
    dataByDate.forEach(entry => {
        const addFromMap = (map) => {
            if (!map) return;
            map.forEach((val) => {
                const agent = findProductivityAgent(val.originalName, agents);
                if (agent) {
                    const agentKey = normalizeProductivityName(agent.fullName);
                    if (agentNames.has(agentKey)) return;
                    agentNames.set(agentKey, { fullName: agent.fullName, primaryTeam: agent.primaryTeam, agent });
                }
            });
        };
        addFromMap(entry.ticketsData);
        addFromMap(entry.callsData);
    });

    agents.forEach(agent => {
        const key = normalizeProductivityName(agent.fullName);
        if (!agentNames.has(key)) {
            agentNames.set(key, { fullName: agent.fullName, primaryTeam: agent.primaryTeam, agent });
        }
    });

    return agentNames;
}
