import { normalizeTeamForDisplay } from './config.js';
import {
    findProductivityAgent,
    hasPerAgentProductivityEligibleDate,
    isPerAgentProductivityRoleExcluded,
    normalizeProductivityName
} from './productivity-metrics.js';
import { formatProductivityDateKey } from './productivity-calculation.js';

function getPrimaryTeamCode(primaryTeam) {
    return String(primaryTeam || '').split(' ')[0] || '';
}

function entryHasTeamData(entry, teamCode) {
    if (!entry?.teams) return false;

    let hasTeam = false;
    entry.teams.forEach((count, team) => {
        if (count > 0 && normalizeTeamForDisplay(team) === teamCode) {
            hasTeam = true;
        }
    });
    return hasTeam;
}

function buildAgentOption(agent) {
    const key = normalizeProductivityName(agent?.fullName);
    if (!key) return null;

    return [
        key,
        {
            fullName: agent.fullName,
            primaryTeam: agent.primaryTeam,
            agent
        }
    ];
}

function createUploadedNameMatcher(agents, findAgent) {
    const cache = new Map();

    return originalName => {
        const key = normalizeProductivityName(originalName);
        if (!key) return null;
        if (!cache.has(key)) {
            cache.set(key, findAgent(originalName, agents));
        }
        return cache.get(key);
    };
}

function collectUploadedTeamAgentKeys({
    dataByDate,
    agents,
    start,
    end,
    teamFilter,
    findAgent,
    isRoleExcluded
}) {
    const matchingAgents = new Set();
    const normalizedTeamFilter = normalizeTeamForDisplay(teamFilter);
    const matchUploadedAgent = createUploadedNameMatcher(agents, findAgent);
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(0, 0, 0, 0);

    const addUploadedEntry = (entry, rowDate) => {
        if (!entryHasTeamData(entry, normalizedTeamFilter)) return;

        const agent = matchUploadedAgent(entry.originalName);
        if (!agent || isRoleExcluded(agent, rowDate)) return;

        const key = normalizeProductivityName(agent.fullName);
        if (key) matchingAgents.add(key);
    };

    while (current <= endDate) {
        const rowDate = new Date(current);
        const entry = dataByDate.get(formatProductivityDateKey(rowDate));
        if (entry?.ticketsData) {
            entry.ticketsData.forEach(uploadedEntry => addUploadedEntry(uploadedEntry, rowDate));
        }
        if (entry?.callsData) {
            entry.callsData.forEach(uploadedEntry => addUploadedEntry(uploadedEntry, rowDate));
        }
        current.setDate(current.getDate() + 1);
    }

    return matchingAgents;
}

export function buildProductivityAgentSelectionOptions({
    dataByDate = new Map(),
    agents = [],
    start,
    end,
    teamFilter = 'all',
    findAgent = findProductivityAgent,
    hasEligibleDate = hasPerAgentProductivityEligibleDate,
    isRoleExcluded = isPerAgentProductivityRoleExcluded
} = {}) {
    const agentNames = new Map();
    agents.forEach(agent => {
        const option = buildAgentOption(agent);
        if (option && !agentNames.has(option[0])) {
            agentNames.set(option[0], option[1]);
        }
    });

    let options = [...agentNames.entries()].filter(([, info]) =>
        hasEligibleDate(info.agent, start, end)
    );

    if (teamFilter !== 'all') {
        const matchingAgents = collectUploadedTeamAgentKeys({
            dataByDate,
            agents,
            start,
            end,
            teamFilter,
            findAgent,
            isRoleExcluded
        });
        options = options.filter(([normalizedName]) => matchingAgents.has(normalizedName));
    }

    options.sort((a, b) => String(a[1].fullName || '').localeCompare(String(b[1].fullName || '')));
    return options;
}

export function pruneProductivityAgentSelection(selectedAgents = new Set(), allowedAgents = []) {
    const allowedAgentKeys = new Set(allowedAgents.map(([normalizedName]) => normalizedName));
    return new Set([...selectedAgents].filter(normalizedName => allowedAgentKeys.has(normalizedName)));
}

function cacheKeysEqual(a, b) {
    return Boolean(a && b)
        && a.dataVersion === b.dataVersion
        && a.startKey === b.startKey
        && a.endKey === b.endKey
        && a.teamFilter === b.teamFilter
        && a.usersRef === b.usersRef;
}

export function createProductivityAgentSelectionCache() {
    let cachedKey = null;
    let cachedOptions = [];

    return {
        get(key, buildOptions) {
            if (cacheKeysEqual(cachedKey, key)) {
                return cachedOptions;
            }
            cachedOptions = buildOptions();
            cachedKey = { ...key };
            return cachedOptions;
        },
        clear() {
            cachedKey = null;
            cachedOptions = [];
        }
    };
}
