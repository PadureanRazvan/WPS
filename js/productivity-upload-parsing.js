import { normalizeProductivityName } from './productivity-metrics.js';

const QUEUE_TO_TEAM = {
    'ro zooplus': 'RO', 'ro bitiba': 'RO',
    'hu zooplus': 'HU', 'hu bitiba': 'HU',
    'it zooplus': 'IT', 'it bitiba': 'IT',
    'nl zooplus': 'NL', 'nl bitiba': 'NL',
    'cs zooplus': 'CS', 'cs bitiba': 'CS',
    'sk zooplus': 'SK', 'sk bitiba': 'SK',
    'sv-se zooplus': 'SV-SE', 'sv-se bitiba': 'SV-SE',
    'de zooplus': 'DE', 'de bitiba': 'DE'
};

const LANGUAGE_TO_TEAM = {
    'ro': 'RO', 'hu': 'HU', 'it': 'IT', 'nl': 'NL',
    'cs': 'CS', 'sk': 'SK', 'sv-se': 'SV-SE', 'de': 'DE',
    'en': 'EN', 'en-gb': 'EN', 'bg': 'BG', 'da': 'DA',
    'el': 'EL', 'es': 'ES', 'fi': 'FI', 'fr': 'FR',
    'hr': 'HR', 'nb-no': 'NO', 'pl': 'PL', 'pt-pt': 'OTHER',
    'ru-ru': 'RU', 'sl': 'SL'
};

export function queueToProductivityTeam(queueName) {
    if (!queueName) return 'OTHER';
    const lower = queueName.toLowerCase().trim();
    for (const [key, team] of Object.entries(QUEUE_TO_TEAM)) {
        if (lower.startsWith(key)) return team;
    }
    return 'OTHER';
}

export function languageToProductivityTeam(lang) {
    if (!lang) return 'OTHER';
    return LANGUAGE_TO_TEAM[lang.toLowerCase().trim()] || 'OTHER';
}

export function parseProductivityCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else { current += ch; }
        } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',') { result.push(current); current = ''; }
            else { current += ch; }
        }
    }
    result.push(current);
    return result;
}

export async function parseTicketsXLSX(file, dependencies = {}) {
    const JSZipAdapter = dependencies.JSZip || globalThis.JSZip;
    const DOMParserAdapter = dependencies.DOMParser || globalThis.DOMParser;
    if (!JSZipAdapter || !DOMParserAdapter) {
        throw new Error('Ticket XLSX parsing requires JSZip and DOMParser.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZipAdapter.loadAsync(arrayBuffer);

    const strings = [];
    const sstFile = zip.file('xl/sharedStrings.xml');
    if (sstFile) {
        const sstXml = await sstFile.async('string');
        const parser = new DOMParserAdapter();
        const doc = parser.parseFromString(sstXml, 'text/xml');
        const siElements = doc.getElementsByTagName('si');
        for (let i = 0; i < siElements.length; i++) {
            const tElements = siElements[i].getElementsByTagName('t');
            let text = '';
            for (let j = 0; j < tElements.length; j++) {
                text += tElements[j].textContent || '';
            }
            strings.push(text);
        }
    }

    const sheetFile = zip.file('xl/worksheets/sheet1.xml');
    if (!sheetFile) throw new Error('Could not find sheet1.xml in XLSX');

    const sheetXml = await sheetFile.async('string');
    const parser = new DOMParserAdapter();
    const doc = parser.parseFromString(sheetXml, 'text/xml');
    const rows = doc.getElementsByTagName('row');

    const result = new Map();
    let skippedHeader = false;

    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('c');
        const rowData = {};
        for (let j = 0; j < cells.length; j++) {
            const cell = cells[j];
            const ref = cell.getAttribute('r') || '';
            const col = ref.replace(/\d+/g, '');
            const type = cell.getAttribute('t');
            const vEl = cell.getElementsByTagName('v')[0];
            const rawVal = vEl ? vEl.textContent : '';
            rowData[col] = type === 's' ? (strings[parseInt(rawVal)] || '') : rawVal;
        }

        if (!skippedHeader) {
            if (rowData.A === 'Agent name') skippedHeader = true;
            continue;
        }

        const agentName = rowData.A || '';
        const language = rowData.B || '';
        const ticketsResolved = parseFloat(rowData.D) || 0;

        if (!agentName || agentName === '---') continue;
        if (ticketsResolved === 0) continue;

        const normalized = normalizeProductivityName(agentName);
        const teamCode = languageToProductivityTeam(language);

        if (!result.has(normalized)) {
            result.set(normalized, { originalName: agentName, tickets: 0, teams: new Map() });
        }
        const entry = result.get(normalized);
        entry.tickets += ticketsResolved;
        entry.teams.set(teamCode, (entry.teams.get(teamCode) || 0) + ticketsResolved);
    }

    return result;
}

export function parseCallsCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) throw new Error('CSV file is empty or has no data rows');

    const headers = parseProductivityCSVLine(lines[0]);
    const agentIdx = headers.findIndex(h => h.trim().toLowerCase() === 'agent name');
    const queueIdx = headers.findIndex(h => h.trim().toLowerCase() === 'call queue name');
    const statusIdx = headers.findIndex(h => h.trim().toLowerCase() === 'call status');

    if (agentIdx === -1 || statusIdx === -1) {
        throw new Error('Could not find required columns: Agent Name, Call Status');
    }

    const result = new Map();
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = parseProductivityCSVLine(line);
        const agentName = cols[agentIdx]?.trim() || '';
        const queueName = queueIdx >= 0 ? (cols[queueIdx]?.trim() || '') : '';
        const status = cols[statusIdx]?.trim() || '';

        if (status !== 'Answered' || !agentName) continue;

        const normalized = normalizeProductivityName(agentName);
        const teamCode = queueToProductivityTeam(queueName);

        if (!result.has(normalized)) {
            result.set(normalized, { originalName: agentName, calls: 0, teams: new Map() });
        }
        const entry = result.get(normalized);
        entry.calls += 1;
        entry.teams.set(teamCode, (entry.teams.get(teamCode) || 0) + 1);
    }
    return result;
}
