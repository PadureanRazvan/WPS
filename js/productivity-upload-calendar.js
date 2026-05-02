export function getProductivityDateStatus(entry) {
    const ticketAgents = entry?.ticketsData?.size || 0;
    const callAgents = entry?.callsData?.size || 0;
    const hasTickets = ticketAgents > 0;
    const hasCalls = callAgents > 0;

    return {
        hasTickets,
        hasCalls,
        ticketAgents,
        callAgents,
        isComplete: hasTickets && hasCalls,
        hasAnyData: hasTickets || hasCalls
    };
}

function escapeCsvValue(value) {
    const text = String(value ?? '');
    if (!/[",\n\r]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

function addExportRows(rows, dateKey, fileType, dataMap) {
    if (!dataMap) return;

    dataMap.forEach(entry => {
        if (!entry?.teams || entry.teams.size === 0) {
            const fallbackCount = fileType === 'tickets' ? entry?.tickets : entry?.calls;
            rows.push([dateKey, fileType, entry?.originalName || '', '', fallbackCount || 0]);
            return;
        }

        entry.teams.forEach((count, team) => {
            rows.push([dateKey, fileType, entry?.originalName || '', team, count || 0]);
        });
    });
}

export function buildProductivityExportRows(dateKey, entry) {
    const rows = [];
    addExportRows(rows, dateKey, 'tickets', entry?.ticketsData);
    addExportRows(rows, dateKey, 'calls', entry?.callsData);
    return rows;
}

export function buildProductivityExportCsv(dateKey, entry) {
    const rows = [
        ['date', 'file_type', 'agent', 'team', 'count'],
        ...buildProductivityExportRows(dateKey, entry)
    ];

    return rows
        .map(row => row.map(escapeCsvValue).join(','))
        .join('\n');
}
