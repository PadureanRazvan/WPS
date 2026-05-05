import { PRODUCTIVITY_TEAMS, getEffectiveAgentDayValue, normalizeTeamForDisplay } from './config.js';
import {
    formatProductivityDateKey,
    getProductivityEligibleHoursForRange,
    getProductivityEligibleHoursForTeamInRange,
    getProductivityTeamsFromPlanner
} from './productivity-calculation.js';
import {
    isPerAgentProductivityRoleExcluded,
    normalizeProductivityName
} from './productivity-metrics.js';

function hasDataForDate(dataByDate, dateKey) {
    const entry = dataByDate.get(dateKey);
    if (!entry) return false;
    const hasTickets = entry.ticketsData && entry.ticketsData.size > 0;
    const hasCalls = entry.callsData && entry.callsData.size > 0;
    return hasTickets || hasCalls;
}

function getTeamCountForEntry(entry, normalizedName, teamFilter) {
    let total = 0;
    const agentEntry = entry?.get(normalizedName);
    if (!agentEntry?.teams) return total;

    agentEntry.teams.forEach((count, team) => {
        if (normalizeTeamForDisplay(team) === teamFilter) {
            total += count;
        }
    });
    return total;
}

function findSelectedAgent(agents, normalizedName) {
    return agents.find(agent =>
        normalizeProductivityName(agent.fullName) === normalizedName ||
        normalizeProductivityName(agent.username) === normalizedName
    );
}

function getDateLabel(date) {
    const dayOfWeek = date.toLocaleDateString('ro-RO', { weekday: 'short' });
    return `${dayOfWeek} ${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getProductivityDataForSingleDate(dataByDate, dateKey, normalizedName) {
    const entry = dataByDate.get(dateKey);
    if (!entry) return { tickets: 0, calls: 0, teams: new Map() };

    let tickets = 0;
    let calls = 0;
    const teams = new Map();

    if (entry.ticketsData) {
        const ticketEntry = entry.ticketsData.get(normalizedName);
        if (ticketEntry) {
            tickets = ticketEntry.tickets || 0;
            if (ticketEntry.teams) {
                ticketEntry.teams.forEach((count, team) => {
                    const normalizedTeam = normalizeTeamForDisplay(team);
                    teams.set(normalizedTeam, (teams.get(normalizedTeam) || 0) + count);
                });
            }
        }
    }

    if (entry.callsData) {
        const callEntry = entry.callsData.get(normalizedName);
        if (callEntry) {
            calls = callEntry.calls || 0;
            if (callEntry.teams) {
                callEntry.teams.forEach((count, team) => {
                    const normalizedTeam = normalizeTeamForDisplay(team);
                    teams.set(normalizedTeam, (teams.get(normalizedTeam) || 0) + count);
                });
            }
        }
    }

    return { tickets, calls, teams };
}

export function buildProductivityDetailRows({
    dataByDate = new Map(),
    agents = [],
    selectedAgents = new Set(),
    start,
    end,
    teamFilter = 'all'
} = {}) {
    const rows = [];
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(0, 0, 0, 0);

    while (current <= endDate) {
        const rowDate = new Date(current);
        const dateKey = formatProductivityDateKey(rowDate);
        const hasData = hasDataForDate(dataByDate, dateKey);
        const dateLabel = getDateLabel(rowDate);
        const isWeekend = rowDate.getDay() === 0 || rowDate.getDay() === 6;

        selectedAgents.forEach(normalizedName => {
            const agent = findSelectedAgent(agents, normalizedName);
            if (!agent) return;
            if (isPerAgentProductivityRoleExcluded(agent, rowDate)) return;

            const dayValue = getEffectiveAgentDayValue(agent, rowDate);
            const singleDateData = hasData
                ? getProductivityDataForSingleDate(dataByDate, dateKey, normalizedName)
                : { tickets: 0, calls: 0, teams: new Map() };

            let tickets;
            let calls;
            let hours;
            if (teamFilter !== 'all') {
                const singleEntry = hasData ? dataByDate.get(dateKey) : null;
                tickets = getTeamCountForEntry(singleEntry?.ticketsData, normalizedName, teamFilter);
                calls = getTeamCountForEntry(singleEntry?.callsData, normalizedName, teamFilter);
                if (tickets === 0 && calls === 0) return;
                hours = getProductivityEligibleHoursForTeamInRange(agent, rowDate, rowDate, teamFilter);
            } else {
                tickets = singleDateData.tickets;
                calls = singleDateData.calls;
                hours = getProductivityEligibleHoursForRange(agent, rowDate, rowDate);
            }

            const total = tickets + calls;
            const productivity = hours > 0 ? total / hours : 0;

            let teamsDisplay;
            if (teamFilter !== 'all') {
                teamsDisplay = teamFilter;
            } else {
                const fileTeams = [...singleDateData.teams.keys()]
                    .filter(team => PRODUCTIVITY_TEAMS.includes(team))
                    .sort();
                if (fileTeams.length > 0) {
                    teamsDisplay = fileTeams.join('/');
                } else {
                    const dayTeams = getProductivityTeamsFromPlanner(agent, rowDate, rowDate);
                    teamsDisplay = dayTeams.length > 0 ? dayTeams.join('/') : (agent.primaryTeam?.split(' ')[0] || '-');
                }
            }

            rows.push({
                dateKey,
                dateLabel,
                isWeekend,
                hasData,
                name: agent.fullName,
                teamsDisplay,
                teams: singleDateData.teams,
                tickets,
                calls,
                total,
                hours,
                dayValue,
                productivity
            });
        });

        current.setDate(current.getDate() + 1);
    }

    return rows;
}
