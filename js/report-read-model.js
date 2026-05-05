import {
    TEAM_DISPLAY_NAMES,
    getEffectiveAgentDayValue,
    getEffectivePrimaryTeamCode,
    getEffectiveReportRoleCode,
    isNonWorkingCode,
    isReportRoleTeamCode,
    normalizeTeamForDisplay,
    parseShiftEntry
} from './schedule-semantics.js';

function normalizeReportBoundaryDate(value) {
    if (!value) return null;

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        const localDate = new Date(year, month - 1, day);
        localDate.setHours(0, 0, 0, 0);
        return localDate;
    }

    const date = value instanceof Date
        ? new Date(value)
        : value?.toDate
            ? value.toDate()
            : new Date(value);

    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function formatReportDate(date) {
    const normalizedDate = normalizeReportBoundaryDate(date);
    if (!normalizedDate) return '';

    const year = normalizedDate.getFullYear();
    const month = String(normalizedDate.getMonth() + 1).padStart(2, '0');
    const day = String(normalizedDate.getDate()).padStart(2, '0');
    return `${day}.${month}.${year}`;
}

export function formatReportDateRange(start, end) {
    const startLabel = formatReportDate(start);
    const endLabel = formatReportDate(end);
    return startLabel && endLabel ? `${startLabel} - ${endLabel}` : '';
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

function addReportHours(bucketGroup, displayName, agentName, hours) {
    if (!bucketGroup[displayName]) {
        bucketGroup[displayName] = { totalHours: 0, agents: new Map() };
    }

    bucketGroup[displayName].totalHours += hours;
    bucketGroup[displayName].agents.set(
        agentName,
        (bucketGroup[displayName].agents.get(agentName) || 0) + hours
    );
}

export function calculatePlannerReportData(agents, start, end) {
    if (!Array.isArray(agents) || agents.length === 0) return null;

    const startDate = normalizeReportBoundaryDate(start);
    const endDate = normalizeReportBoundaryDate(end);
    if (!startDate || !endDate || startDate > endDate) return null;

    const shopData = {};
    const roleData = {};
    let shopGrandTotal = 0;
    let roleGrandTotal = 0;

    for (const agent of agents) {
        const agentName = agent.fullName || agent.username || 'Unknown';
        const current = new Date(startDate);

        while (current <= endDate) {
            const dayValue = getEffectiveAgentDayValue(agent, current);
            const reportRoleCode = getEffectiveReportRoleCode(agent, current);
            const primaryTeamCode = reportRoleCode || getEffectivePrimaryTeamCode(agent, current);

            for (const entry of parsePlannerDayEntries(dayValue)) {
                const resolvedCode = reportRoleCode || entry.team || primaryTeamCode;
                const displayName = TEAM_DISPLAY_NAMES[resolvedCode] || resolvedCode;

                if (isReportRoleTeamCode(resolvedCode)) {
                    addReportHours(roleData, displayName, agentName, entry.hours);
                    roleGrandTotal += entry.hours;
                } else {
                    addReportHours(shopData, displayName, agentName, entry.hours);
                    shopGrandTotal += entry.hours;
                }
            }

            current.setDate(current.getDate() + 1);
        }
    }

    return { shopData, roleData, shopGrandTotal, roleGrandTotal };
}

function toBucketModels(data) {
    return Object.entries(data || {})
        .sort((a, b) => b[1].totalHours - a[1].totalHours)
        .map(([name, bucket]) => ({
            name,
            totalHours: bucket.totalHours,
            agentCount: bucket.agents.size,
            agents: [...bucket.agents.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([agentName, hours]) => ({ name: agentName, hours }))
        }));
}

function createEmptyReportReadModel(start, end) {
    return {
        range: {
            start: normalizeReportBoundaryDate(start),
            end: normalizeReportBoundaryDate(end),
            label: formatReportDateRange(start, end)
        },
        shop: {
            buckets: [],
            grandTotal: 0
        },
        roles: {
            buckets: [],
            grandTotal: 0
        },
        hasData: false
    };
}

export function buildReportReadModel(agents, start, end) {
    const reportData = calculatePlannerReportData(agents, start, end);

    if (!reportData) {
        return createEmptyReportReadModel(start, end);
    }

    const shopBuckets = toBucketModels(reportData.shopData);
    const roleBuckets = toBucketModels(reportData.roleData);

    return {
        range: {
            start: normalizeReportBoundaryDate(start),
            end: normalizeReportBoundaryDate(end),
            label: formatReportDateRange(start, end)
        },
        shop: {
            buckets: shopBuckets,
            grandTotal: reportData.shopGrandTotal
        },
        roles: {
            buckets: roleBuckets,
            grandTotal: reportData.roleGrandTotal
        },
        hasData: shopBuckets.length > 0 || roleBuckets.length > 0
    };
}
