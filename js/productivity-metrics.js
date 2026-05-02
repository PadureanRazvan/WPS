import { normalizeTeamForDisplay } from './config.js';

export function normalizeProductivityName(name) {
    if (!name) return '';
    return String(name)
        .replace(/[._]fsp$/i, '')
        .replace(/[._]/g, ' ')
        .trim()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function findProductivityAgent(fileName, agents = []) {
    const normalizedFile = normalizeProductivityName(fileName);
    if (!normalizedFile) return null;

    let match = agents.find(agent => normalizeProductivityName(agent.fullName) === normalizedFile);
    if (match) return match;

    match = agents.find(agent => normalizeProductivityName(agent.username) === normalizedFile);
    if (match) return match;

    return agents.find(agent => {
        const normalizedAgent = normalizeProductivityName(agent.fullName);
        return normalizedAgent && (normalizedFile.includes(normalizedAgent) || normalizedAgent.includes(normalizedFile));
    }) || null;
}

function getTeamCount(entry, teamCode) {
    if (!entry?.teams) return 0;

    let total = 0;
    entry.teams.forEach((count, team) => {
        if (normalizeTeamForDisplay(team) === teamCode) {
            total += Number(count) || 0;
        }
    });
    return total;
}

function collectEntryKeys(...entryMaps) {
    const keys = new Set();
    entryMaps.forEach(map => {
        if (!map) return;
        map.forEach((_, key) => keys.add(key));
    });
    return keys;
}

export function calculateMatchedTeamTrendPoint({
    agents = [],
    team,
    ticketEntries,
    callEntries,
    getEligibleHoursForTeam
}) {
    const teamCode = normalizeTeamForDisplay(team);
    const allNames = collectEntryKeys(ticketEntries, callEntries);
    let items = 0;
    let hours = 0;

    allNames.forEach(normalizedName => {
        const ticketEntry = ticketEntries?.get(normalizedName);
        const callEntry = callEntries?.get(normalizedName);
        const originalName = ticketEntry?.originalName || callEntry?.originalName || normalizedName;
        const agent = findProductivityAgent(originalName, agents);
        if (!agent) return;

        const agentItems = getTeamCount(ticketEntry, teamCode) + getTeamCount(callEntry, teamCode);
        if (agentItems <= 0) return;

        items += agentItems;
        hours += Number(getEligibleHoursForTeam?.(agent, teamCode)) || 0;
    });

    return {
        items,
        hours,
        productivity: hours > 0 && items > 0 ? items / hours : null
    };
}
