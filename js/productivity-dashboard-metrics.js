import { normalizeTeamForDisplay, PRODUCTIVITY_TEAMS } from './config.js';
import { calculateMatchedTeamTrendPoint, normalizeProductivityName } from './productivity-metrics.js';

function hasUploadedDateData(entry) {
    return Boolean(
        (entry?.ticketsData && entry.ticketsData.size > 0) ||
        (entry?.callsData && entry.callsData.size > 0)
    );
}

function getUploadedDateKeys(dataByDate) {
    return [...dataByDate.keys()].filter(dateKey => hasUploadedDateData(dataByDate.get(dateKey)));
}

function addUploadedEntryTeams(teamSet, entry) {
    if (!entry?.teams) return;

    entry.teams.forEach((count, team) => {
        const normalizedTeam = normalizeTeamForDisplay(team);
        if (count > 0 && PRODUCTIVITY_TEAMS.includes(normalizedTeam)) {
            teamSet.add(normalizedTeam);
        }
    });
}

function buildMonthDateKeys(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dates = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        dates.push(`${year}-${mm}-${dd}`);
    }
    return dates;
}

export function buildAverageProductivitySummary({
    dataByDate = new Map(),
    agents = [],
    getEligibleHoursForRange = () => 0
} = {}) {
    if (dataByDate.size === 0 || agents.length === 0) return { average: null, days: 0 };

    const uploadedDateKeys = getUploadedDateKeys(dataByDate)
        .sort()
        .slice(-7);

    if (uploadedDateKeys.length === 0) return { average: null, days: 0 };

    let totalItems = 0;
    let totalHours = 0;

    for (const dateKey of uploadedDateKeys) {
        const entry = dataByDate.get(dateKey);
        const currentDate = new Date(`${dateKey}T00:00:00`);

        for (const agent of agents) {
            const normalizedName = normalizeProductivityName(agent.fullName || agent.username || '');

            let items = 0;
            const ticketEntry = entry.ticketsData?.get(normalizedName);
            if (ticketEntry) items += ticketEntry.tickets || 0;

            const callEntry = entry.callsData?.get(normalizedName);
            if (callEntry) items += callEntry.calls || 0;

            totalItems += items;
            totalHours += Number(getEligibleHoursForRange(agent, currentDate, currentDate)) || 0;
        }
    }

    return {
        average: totalHours > 0 ? totalItems / totalHours : null,
        days: uploadedDateKeys.length
    };
}

export function buildProductivityTrendData({
    dataByDate = new Map(),
    agents = [],
    targetYear,
    targetMonth,
    getEligibleHoursForTeamInRange = () => 0,
    now = new Date()
} = {}) {
    const datesWithData = new Set(getUploadedDateKeys(dataByDate));
    if (datesWithData.size === 0) return null;

    const year = targetYear != null ? targetYear : now.getFullYear();
    const month = targetMonth != null ? targetMonth : now.getMonth();
    const allDates = buildMonthDateKeys(year, month);

    const teamSet = new Set();
    for (const dateKey of allDates) {
        if (!datesWithData.has(dateKey)) continue;
        const entry = dataByDate.get(dateKey);
        if (entry?.ticketsData) entry.ticketsData.forEach(value => addUploadedEntryTeams(teamSet, value));
        if (entry?.callsData) entry.callsData.forEach(value => addUploadedEntryTeams(teamSet, value));
    }

    const teamNames = [...teamSet].sort();
    if (teamNames.length === 0) return null;

    const teamSeries = {};
    teamNames.forEach(team => {
        teamSeries[team] = [];
    });

    for (const dateKey of allDates) {
        if (!datesWithData.has(dateKey)) {
            teamNames.forEach(team => teamSeries[team].push(null));
            continue;
        }

        const entry = dataByDate.get(dateKey);
        const currentDate = new Date(`${dateKey}T00:00:00`);

        for (const team of teamNames) {
            const point = calculateMatchedTeamTrendPoint({
                agents,
                team,
                ticketEntries: entry?.ticketsData,
                callEntries: entry?.callsData,
                getEligibleHoursForTeam: agent => getEligibleHoursForTeamInRange(agent, currentDate, currentDate, team)
            });
            teamSeries[team].push(point.productivity);
        }
    }

    const activeTeams = {};
    for (const team of teamNames) {
        if (teamSeries[team].some(value => value !== null)) {
            activeTeams[team] = teamSeries[team];
        }
    }

    return { dates: allDates, teams: activeTeams };
}
