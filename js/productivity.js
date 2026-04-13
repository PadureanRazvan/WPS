// js/productivity.js
import { db } from './firebase-config.js';
import { collection, doc, setDoc, deleteDoc, getDocs } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { getPlannerData } from './planner.js';
import { getUsersData } from './users.js';
import { showTemporaryMessage } from './ui.js';
import { translations, isNonWorkingCode, normalizeTeamForDisplay, PRODUCTIVITY_TEAMS, parseShiftEntry, extractHoursFromDay, getMonthKey, getAgentDaysForMonth } from './config.js';

function getLang() { return localStorage.getItem('language') || 'ro'; }
function t(key) { const l = getLang(); return (translations[l] && translations[l][key]) || key; }

// --- State ---
// Per-date storage: Map<dateKey, { ticketsData: Map, callsData: Map }>
const dataByDate = new Map();
let uploadDate = '';  // current selected upload date (YYYY-MM-DD)
let dateStart = new Date();
let dateEnd = new Date();
let currentTeamFilter = 'all';
let productivityPicker = null;
let currentView = 'overview'; // 'overview' or 'detail'
let selectedAgents = new Set(); // normalized names of selected agents

// --- Name Normalization & Matching ---

function normalizeName(name) {
    if (!name) return '';
    return name
        .replace(/[._]fsp$/i, '')
        .replace(/[._]/g, ' ')
        .trim()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function matchAgent(fileName) {
    const normalizedFile = normalizeName(fileName);
    if (!normalizedFile) return null;
    const users = getUsersData();

    let match = users.find(u => normalizeName(u.fullName) === normalizedFile);
    if (match) return match;

    match = users.find(u => normalizeName(u.username) === normalizedFile);
    if (match) return match;

    match = users.find(u => {
        const nu = normalizeName(u.fullName);
        return nu && (normalizedFile.includes(nu) || nu.includes(normalizedFile));
    });
    return match || null;
}

// --- Queue/Language to Team Mapping ---

const QUEUE_TO_TEAM = {
    'ro zooplus': 'RO', 'ro bitiba': 'RO',
    'hu zooplus': 'HU', 'hu bitiba': 'HU',
    'it zooplus': 'IT', 'it bitiba': 'IT',
    'nl zooplus': 'NL', 'nl bitiba': 'NL',
    'cs zooplus': 'CS', 'cs bitiba': 'CS',
    'sk zooplus': 'SK', 'sk bitiba': 'SK',
    'sv-se zooplus': 'SV-SE', 'sv-se bitiba': 'SV-SE',
    'de zooplus': 'DE', 'de bitiba': 'DE',
};

function queueToTeam(queueName) {
    if (!queueName) return 'OTHER';
    const lower = queueName.toLowerCase().trim();
    for (const [key, team] of Object.entries(QUEUE_TO_TEAM)) {
        if (lower.startsWith(key)) return team;
    }
    return 'OTHER';
}

const LANGUAGE_TO_TEAM = {
    'ro': 'RO', 'hu': 'HU', 'it': 'IT', 'nl': 'NL',
    'cs': 'CS', 'sk': 'SK', 'sv-se': 'SV-SE', 'de': 'DE',
    'en': 'EN', 'en-gb': 'EN', 'bg': 'BG', 'da': 'DA',
    'el': 'EL', 'es': 'ES', 'fi': 'FI', 'fr': 'FR',
    'hr': 'HR', 'nb-no': 'NO', 'pl': 'PL', 'pt-pt': 'OTHER',
    'ru-ru': 'RU', 'sl': 'SL',
};

function languageToTeam(lang) {
    if (!lang) return 'OTHER';
    return LANGUAGE_TO_TEAM[lang.toLowerCase().trim()] || 'OTHER';
}

// --- XLSX Parser (Tickets) ---

async function parseTicketsXLSX(file) {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const strings = [];
    const sstFile = zip.file('xl/sharedStrings.xml');
    if (sstFile) {
        const sstXml = await sstFile.async('string');
        const parser = new DOMParser();
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
    const parser = new DOMParser();
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
            if (rowData['A'] === 'Agent name') skippedHeader = true;
            continue;
        }

        const agentName = rowData['A'] || '';
        const language = rowData['B'] || '';
        const ticketsResolved = parseFloat(rowData['D']) || 0;

        if (!agentName || agentName === '---') continue;
        if (ticketsResolved === 0) continue;

        const normalized = normalizeName(agentName);
        const teamCode = languageToTeam(language);

        if (!result.has(normalized)) {
            result.set(normalized, { originalName: agentName, tickets: 0, teams: new Map() });
        }
        const entry = result.get(normalized);
        entry.tickets += ticketsResolved;
        entry.teams.set(teamCode, (entry.teams.get(teamCode) || 0) + ticketsResolved);
    }

    return result;
}

// --- CSV Parser (Calls) ---

function parseCallsCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) throw new Error('CSV file is empty or has no data rows');

    const headers = parseCSVLine(lines[0]);
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

        const cols = parseCSVLine(line);
        const agentName = cols[agentIdx]?.trim() || '';
        const queueName = queueIdx >= 0 ? (cols[queueIdx]?.trim() || '') : '';
        const status = cols[statusIdx]?.trim() || '';

        if (status !== 'Answered' || !agentName) continue;

        const normalized = normalizeName(agentName);
        const teamCode = queueToTeam(queueName);

        if (!result.has(normalized)) {
            result.set(normalized, { originalName: agentName, calls: 0, teams: new Map() });
        }
        const entry = result.get(normalized);
        entry.calls += 1;
        entry.teams.set(teamCode, (entry.teams.get(teamCode) || 0) + 1);
    }
    return result;
}

function parseCSVLine(line) {
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

// --- Hours Parser ---

function parseHoursFromDayValue(dayValue) {
    return extractHoursFromDay(dayValue);
}

function getPrimaryTeamCode(agent) {
    return normalizeTeamForDisplay(agent.primaryTeam?.split(' ')[0]?.toUpperCase() || '');
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

// --- Get hours for a date range from planner ---

function getHoursForRange(agent, start, end) {
    let totalHours = 0;
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    while (current <= endDate) {
        const dayIndex = current.getDate() - 1;
        const monthKey = getMonthKey(current);
        const daysArray = getAgentDaysForMonth(agent, monthKey);
        if (dayIndex >= 0 && dayIndex < daysArray.length) {
            totalHours += parseHoursFromDayValue(daysArray[dayIndex]);
        }
        current.setDate(current.getDate() + 1);
    }
    return totalHours;
}

// Get hours for a SPECIFIC team from planner (e.g., from "4RO+4IT" only count RO hours)
function getHoursForTeamInRange(agent, start, end, teamFilter) {
    let totalHours = 0;
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    const filterUpper = normalizeTeamForDisplay(teamFilter.toUpperCase());
    const primaryCode = getPrimaryTeamCode(agent);

    while (current <= endDate) {
        const dayIndex = current.getDate() - 1;
        const monthKey = getMonthKey(current);
        const daysArray = getAgentDaysForMonth(agent, monthKey);
        if (dayIndex >= 0 && dayIndex < daysArray.length) {
            const dayValue = daysArray[dayIndex];
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

// Extract unique team codes from planner day values across a date range
function getTeamsFromPlanner(agent, start, end) {
    const teams = new Set();
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    while (current <= endDate) {
        const dayIndex = current.getDate() - 1;
        const monthKey = getMonthKey(current);
        const daysArray = getAgentDaysForMonth(agent, monthKey);
        if (dayIndex >= 0 && dayIndex < daysArray.length) {
            const dayValue = daysArray[dayIndex];
            for (const entry of parsePlannerDayEntries(dayValue)) {
                if (entry.team) {
                    teams.add(entry.team);
                }
            }
        }
        current.setDate(current.getDate() + 1);
    }

    return [...teams].sort();
}

function getDaysInRange(start, end) {
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(0, 0, 0, 0);
    return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function formatDateKey(date) {
    if (typeof date === 'string') return date;
    // Use local date, not UTC (toISOString is UTC and shifts dates in non-UTC timezones)
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDateDisplay(dateKey) {
    const d = new Date(dateKey + 'T00:00:00');
    return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

// --- Firestore Serialization ---

function serializeAgentMap(map) {
    if (!map) return null;
    const obj = {};
    map.forEach((val, key) => {
        const teams = {};
        if (val.teams) val.teams.forEach((count, team) => { teams[team] = count; });
        obj[key] = { ...val, teams };
    });
    return obj;
}

function deserializeAgentMap(obj, dataField) {
    if (!obj) return null;
    const map = new Map();
    for (const [key, val] of Object.entries(obj)) {
        const teams = new Map();
        if (val.teams) {
            for (const [t, c] of Object.entries(val.teams)) {
                teams.set(t, c);
            }
        }
        map.set(key, { ...val, teams });
    }
    return map.size > 0 ? map : null;
}

async function saveToFirestore(dateKey) {
    const entry = dataByDate.get(dateKey);
    if (!entry) return;
    try {
        const docData = {
            ticketsData: serializeAgentMap(entry.ticketsData),
            callsData: serializeAgentMap(entry.callsData),
            updatedAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'productivity', dateKey), docData);
        console.log(`[Productivity] Saved data for ${dateKey} to Firestore.`);
    } catch (err) {
        console.error('[Productivity] Firestore save error:', err);
        showTemporaryMessage(t('prod-save-error'), 'error');
    }
}

async function deleteFromFirestore(dateKey) {
    try {
        await deleteDoc(doc(db, 'productivity', dateKey));
        console.log(`[Productivity] Deleted data for ${dateKey} from Firestore.`);
    } catch (err) {
        console.error('[Productivity] Firestore delete error:', err);
    }
}

async function loadAllFromFirestore() {
    try {
        const snapshot = await getDocs(collection(db, 'productivity'));
        snapshot.forEach(docSnap => {
            const dateKey = docSnap.id;
            const data = docSnap.data();
            dataByDate.set(dateKey, {
                ticketsData: deserializeAgentMap(data.ticketsData),
                callsData: deserializeAgentMap(data.callsData)
            });
        });
        console.log(`[Productivity] Loaded ${snapshot.size} dates from Firestore.`);
    } catch (err) {
        console.error('[Productivity] Firestore load error:', err);
    }
}

// --- Per-date data helpers ---

function getOrCreateDateEntry(dateKey) {
    if (!dataByDate.has(dateKey)) {
        dataByDate.set(dateKey, { ticketsData: null, callsData: null });
    }
    return dataByDate.get(dateKey);
}

function hasDataForDate(dateKey) {
    const entry = dataByDate.get(dateKey);
    if (!entry) return false;
    const hasTickets = entry.ticketsData && entry.ticketsData.size > 0;
    const hasCalls = entry.callsData && entry.callsData.size > 0;
    return hasTickets || hasCalls;
}

function hasAnyData() {
    for (const [, entry] of dataByDate) {
        if ((entry.ticketsData && entry.ticketsData.size > 0) || (entry.callsData && entry.callsData.size > 0)) return true;
    }
    return false;
}

// --- Merge data across date range for productivity ---

function getMergedDataForRange(start, end) {
    // Collect all date keys that fall within the range
    const mergedTickets = new Map();
    const mergedCalls = new Map();
    let datesWithData = 0;

    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(0, 0, 0, 0);

    while (current <= endDate) {
        const dateKey = formatDateKey(current);
        const entry = dataByDate.get(dateKey);
        if (entry) {
            if (entry.ticketsData || entry.callsData) datesWithData++;

            if (entry.ticketsData) {
                entry.ticketsData.forEach((val, key) => {
                    if (!mergedTickets.has(key)) {
                        mergedTickets.set(key, { originalName: val.originalName, tickets: 0, teams: new Map() });
                    }
                    const m = mergedTickets.get(key);
                    m.tickets += val.tickets;
                    val.teams.forEach((count, team) => {
                        m.teams.set(team, (m.teams.get(team) || 0) + count);
                    });
                });
            }

            if (entry.callsData) {
                entry.callsData.forEach((val, key) => {
                    if (!mergedCalls.has(key)) {
                        mergedCalls.set(key, { originalName: val.originalName, calls: 0, teams: new Map() });
                    }
                    const m = mergedCalls.get(key);
                    m.calls += val.calls;
                    val.teams.forEach((count, team) => {
                        m.teams.set(team, (m.teams.get(team) || 0) + count);
                    });
                });
            }
        }
        current.setDate(current.getDate() + 1);
    }

    return { mergedTickets, mergedCalls, datesWithData };
}

// --- Productivity Calculation ---

function calculateProductivity() {
    if (!hasAnyData()) return [];

    const { mergedTickets, mergedCalls, datesWithData } = getMergedDataForRange(dateStart, dateEnd);
    if (mergedTickets.size === 0 && mergedCalls.size === 0) return [];

    const results = [];
    const allNames = new Set();
    mergedTickets.forEach((_, k) => allNames.add(k));
    mergedCalls.forEach((_, k) => allNames.add(k));

    allNames.forEach(normalizedName => {
        const tEntry = mergedTickets.get(normalizedName);
        const cEntry = mergedCalls.get(normalizedName);
        const originalName = tEntry?.originalName || cEntry?.originalName || normalizedName;

        const agent = matchAgent(originalName);
        if (!agent) return;

        // Build full team breakdown from uploaded files
        const MAIN_TEAMS = PRODUCTIVITY_TEAMS;
        const ticketsByTeam = new Map();
        const callsByTeam = new Map();
        if (tEntry?.teams) {
            tEntry.teams.forEach((count, team) => {
                const normalized = normalizeTeamForDisplay(team);
                ticketsByTeam.set(normalized, (ticketsByTeam.get(normalized) || 0) + count);
            });
        }
        if (cEntry?.teams) {
            cEntry.teams.forEach((count, team) => {
                const normalized = normalizeTeamForDisplay(team);
                callsByTeam.set(normalized, (callsByTeam.get(normalized) || 0) + count);
            });
        }

        // When team filter is active, show only that team's data
        let tickets, calls, hours;
        if (currentTeamFilter !== 'all') {
            tickets = ticketsByTeam.get(currentTeamFilter) || 0;
            calls = callsByTeam.get(currentTeamFilter) || 0;
            // Only include agent if they have data for this team
            if (tickets === 0 && calls === 0) return;
            hours = getHoursForTeamInRange(agent, dateStart, dateEnd, currentTeamFilter);
        } else {
            tickets = tEntry?.tickets || 0;
            calls = cEntry?.calls || 0;
            hours = getHoursForRange(agent, dateStart, dateEnd);
        }
        const total = tickets + calls;

        // Teams display: uploaded file data takes priority, planner as fallback
        const teamBreakdown = new Map();
        ticketsByTeam.forEach((count, team) => teamBreakdown.set(team, (teamBreakdown.get(team) || 0) + count));
        callsByTeam.forEach((count, team) => teamBreakdown.set(team, (teamBreakdown.get(team) || 0) + count));
        const fileTeams = [...teamBreakdown.keys()].filter(t => MAIN_TEAMS.includes(t)).sort();

        let teamsDisplay;
        if (currentTeamFilter !== 'all') {
            teamsDisplay = currentTeamFilter;
        } else if (fileTeams.length > 0) {
            teamsDisplay = fileTeams.join('/');
        } else {
            const plannerTeams = getTeamsFromPlanner(agent, dateStart, dateEnd);
            teamsDisplay = plannerTeams.length > 0 ? plannerTeams.join('/') : (agent.primaryTeam?.split(' ')[0] || '-');
        }

        const productivity = hours > 0 ? (total / hours) : 0;

        results.push({
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

    return results.sort((a, b) => b.productivity - a.productivity);
}

// --- Rendering ---

function renderProductivity() {
    const container = document.getElementById('productivityTableContainer');
    if (!container) return;

    if (!hasAnyData()) {
        container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 3rem;">${t('prod-upload-to-see')}</p>`;
        const statsContainer = document.getElementById('productivityStats');
        if (statsContainer) statsContainer.innerHTML = '';
        return;
    }

    const results = calculateProductivity();
    const filtered = results; // filtering is now done inside calculateProductivity

    const statsContainer = document.getElementById('productivityStats');
    if (statsContainer) {
        const totalAgents = filtered.length;
        const totalTickets = filtered.reduce((s, r) => s + r.tickets, 0);
        const totalCalls = filtered.reduce((s, r) => s + r.calls, 0);
        const totalAll = filtered.reduce((s, r) => s + r.total, 0);
        const totalHours = filtered.reduce((s, r) => s + r.hours, 0);
        const avgProd = totalHours > 0 ? (totalAll / totalHours).toFixed(2) : 'N/A';
        const numDays = getDaysInRange(dateStart, dateEnd);
        const { datesWithData } = getMergedDataForRange(dateStart, dateEnd);
        const rangeLabel = numDays === 1 ? `1 ${t('prod-day')}` : `${numDays} ${t('prod-days')}`;

        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">${t('prod-agents-processed')}</div>
                <div class="stat-value">${totalAgents}</div>
                <div class="stat-detail">${rangeLabel} (${datesWithData} ${t('prod-with-data')})</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">${t('prod-tickets-resolved')}</div>
                <div class="stat-value">${totalTickets}</div>
                <div class="stat-detail">${t('prod-from-xlsx')}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">${t('prod-calls-answered')}</div>
                <div class="stat-value">${totalCalls}</div>
                <div class="stat-detail">${t('prod-from-csv')}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">${t('prod-average')}</div>
                <div class="stat-value" style="color: ${avgProd !== 'N/A' && avgProd >= 5 ? 'var(--success)' : avgProd !== 'N/A' && avgProd >= 3 ? 'var(--warning)' : 'var(--error)'}">${avgProd}</div>
                <div class="stat-detail">${t('prod-formula')}</div>
            </div>
        `;
    }

    if (filtered.length === 0) {
        container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">${t('prod-no-agents')}</p>`;
        return;
    }

    let html = `<table>
        <thead>
            <tr>
                <th>#</th>
                <th>${t('th-agent')}</th>
                <th>${t('th-teams')}</th>
                <th>${t('th-tickets')}</th>
                <th>${t('th-calls')}</th>
                <th>${t('th-total')}</th>
                <th>${t('th-hours-worked')}</th>
                <th>${t('th-productivity')}</th>
            </tr>
        </thead>
        <tbody>`;

    filtered.forEach((r, idx) => {
        const prodColor = r.hours === 0 ? 'var(--text-secondary)' : r.productivity >= 5 ? 'var(--success)' : r.productivity >= 3 ? 'var(--warning)' : 'var(--error)';
        const prodDisplay = r.hours > 0 ? r.productivity.toFixed(2) : 'N/A';
        const teamTooltip = [...r.teams.entries()].map(([t, c]) => `${t}: ${c}`).join(', ');

        html += `<tr>
            <td style="color: var(--text-secondary);">${idx + 1}</td>
            <td style="font-weight: 500;">${r.name}</td>
            <td title="${teamTooltip}"><span style="background: rgba(99,102,241,0.15); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; letter-spacing: 0.5px;">${r.teamsDisplay}</span></td>
            <td>${r.tickets}</td>
            <td>${r.calls}</td>
            <td style="font-weight: bold;">${r.total}</td>
            <td>${r.hours}h</td>
            <td style="color: ${prodColor}; font-weight: bold;">${prodDisplay}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// --- Detail View (Per Agent Per Day) ---

function getDataForSingleDate(dateKey, normalizedName) {
    const entry = dataByDate.get(dateKey);
    if (!entry) return { tickets: 0, calls: 0, teams: new Map() };

    let tickets = 0, calls = 0;
    const teams = new Map();

    if (entry.ticketsData) {
        const t = entry.ticketsData.get(normalizedName);
        if (t) {
            tickets = t.tickets || 0;
            if (t.teams) t.teams.forEach((c, tm) => { const n = normalizeTeamForDisplay(tm); teams.set(n, (teams.get(n) || 0) + c); });
        }
    }
    if (entry.callsData) {
        const c = entry.callsData.get(normalizedName);
        if (c) {
            calls = c.calls || 0;
            if (c.teams) c.teams.forEach((cnt, tm) => { const n = normalizeTeamForDisplay(tm); teams.set(n, (teams.get(n) || 0) + cnt); });
        }
    }

    return { tickets, calls, teams };
}

function renderDetailView() {
    const container = document.getElementById('productivityTableContainer');
    const statsContainer = document.getElementById('productivityStats');
    if (!container) return;

    if (!hasAnyData()) {
        container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 3rem;">${t('prod-upload-to-see')}</p>`;
        if (statsContainer) statsContainer.innerHTML = '';
        return;
    }

    if (selectedAgents.size === 0) {
        container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 3rem;">${t('prod-select-agent')}</p>`;
        if (statsContainer) statsContainer.innerHTML = '';
        return;
    }

    const users = getUsersData();
    const MAIN_TEAMS = PRODUCTIVITY_TEAMS;
    const rows = [];

    // Iterate each day in the range
    const current = new Date(dateStart);
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(dateEnd);
    endDate.setHours(0, 0, 0, 0);

    while (current <= endDate) {
        const dateKey = formatDateKey(current);
        const hasData = hasDataForDate(dateKey);
        const dayOfWeek = current.toLocaleDateString('ro-RO', { weekday: 'short' });
        const dateLabel = `${dayOfWeek} ${current.getDate()}.${String(current.getMonth() + 1).padStart(2, '0')}`;
        const isWeekend = current.getDay() === 0 || current.getDay() === 6;

        selectedAgents.forEach(normalizedName => {
            const agent = users.find(u => normalizeName(u.fullName) === normalizedName || normalizeName(u.username) === normalizedName);
            if (!agent) return;

            const dayIndex = current.getDate() - 1;
            const monthKey = getMonthKey(current);
            const daysArray = getAgentDaysForMonth(agent, monthKey);
            const dayValue = daysArray[dayIndex] || '';

            const { tickets: allTickets, calls: allCalls, teams } = hasData ? getDataForSingleDate(dateKey, normalizedName) : { tickets: 0, calls: 0, teams: new Map() };

            // When team filter is active, show only that team's data
            let tickets, calls, hours;
            if (currentTeamFilter !== 'all') {
                tickets = teams.get(currentTeamFilter) || 0; // items tagged to this team
                // Split: tickets from ticketsByTeam, calls from callsByTeam — but we only have combined teams map here
                // We need to get per-source counts from the single-date data
                const singleEntry = hasData ? dataByDate.get(dateKey) : null;
                let teamTickets = 0, teamCalls = 0;
                if (singleEntry?.ticketsData) {
                    const t = singleEntry.ticketsData.get(normalizedName);
                    if (t?.teams) t.teams.forEach((cnt, tm) => {
                        if (normalizeTeamForDisplay(tm) === currentTeamFilter) teamTickets += cnt;
                    });
                }
                if (singleEntry?.callsData) {
                    const c = singleEntry.callsData.get(normalizedName);
                    if (c?.teams) c.teams.forEach((cnt, tm) => {
                        if (normalizeTeamForDisplay(tm) === currentTeamFilter) teamCalls += cnt;
                    });
                }
                tickets = teamTickets;
                calls = teamCalls;
                if (tickets === 0 && calls === 0) return; // skip if no data for this team
                hours = getHoursForTeamInRange(agent, current, current, currentTeamFilter);
            } else {
                tickets = allTickets;
                calls = allCalls;
                hours = parseHoursFromDayValue(dayValue);
            }
            const total = tickets + calls;
            const productivity = hours > 0 ? total / hours : 0;

            // Teams display
            const MAIN_TEAMS_D = PRODUCTIVITY_TEAMS;
            let teamsDisplay;
            if (currentTeamFilter !== 'all') {
                teamsDisplay = currentTeamFilter;
            } else {
                const fileTeamsD = [...teams.keys()].filter(t => MAIN_TEAMS_D.includes(t)).sort();
                if (fileTeamsD.length > 0) {
                    teamsDisplay = fileTeamsD.join('/');
                } else {
                    const dayTeams = getTeamsFromPlanner(agent, current, current);
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
                teams,
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

    // Stats
    if (statsContainer) {
        const daysWithData = new Set(rows.filter(r => r.hasData).map(r => r.dateKey)).size;
        const totalTickets = rows.reduce((s, r) => s + r.tickets, 0);
        const totalCalls = rows.reduce((s, r) => s + r.calls, 0);
        const totalHours = rows.reduce((s, r) => s + r.hours, 0);
        const totalAll = totalTickets + totalCalls;
        const avgProd = totalHours > 0 ? (totalAll / totalHours).toFixed(2) : 'N/A';

        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">${t('prod-agents-selected')}</div>
                <div class="stat-value">${selectedAgents.size}</div>
                <div class="stat-detail">${daysWithData} ${t('prod-days-with-data')}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">${t('prod-total-tickets')}</div>
                <div class="stat-value">${totalTickets}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">${t('prod-total-calls')}</div>
                <div class="stat-value">${totalCalls}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">${t('prod-average')}</div>
                <div class="stat-value" style="color: ${avgProd !== 'N/A' && avgProd >= 5 ? 'var(--success)' : avgProd !== 'N/A' && avgProd >= 3 ? 'var(--warning)' : 'var(--error)'}">${avgProd}</div>
                <div class="stat-detail">${t('prod-formula')}</div>
            </div>
        `;
    }

    if (rows.length === 0) {
        container.innerHTML = `<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">${t('prod-no-results')}</p>`;
        return;
    }

    let html = `<table>
        <thead>
            <tr>
                <th>${t('th-date')}</th>
                <th>${t('th-agent')}</th>
                <th>${t('th-teams')}</th>
                <th>${t('th-tickets')}</th>
                <th>${t('th-calls')}</th>
                <th>${t('th-total')}</th>
                <th>${t('th-schedule')}</th>
                <th>${t('th-hours')}</th>
                <th>${t('th-productivity')}</th>
            </tr>
        </thead>
        <tbody>`;

    let lastDate = '';
    rows.forEach(r => {
        const prodColor = r.hours === 0 ? 'var(--text-secondary)' : r.productivity >= 5 ? 'var(--success)' : r.productivity >= 3 ? 'var(--warning)' : 'var(--error)';
        const prodDisplay = r.hours > 0 ? r.productivity.toFixed(2) : '-';
        const teamTooltip = [...r.teams.entries()].map(([t, c]) => `${t}: ${c}`).join(', ');
        const rowBg = r.isWeekend ? 'background: rgba(255,255,255,0.03);' : '';
        const noDataStyle = !r.hasData ? 'opacity: 0.4;' : '';
        const showDate = r.dateKey !== lastDate;
        lastDate = r.dateKey;

        html += `<tr style="${rowBg}${noDataStyle}">
            <td style="font-weight: ${showDate ? '500' : '300'}; color: ${r.isWeekend ? 'var(--warning)' : 'var(--text-primary)'};">${showDate ? r.dateLabel : ''}</td>
            <td style="font-weight: 500;">${r.name}</td>
            <td title="${teamTooltip}"><span style="background: rgba(99,102,241,0.15); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">${r.teamsDisplay}</span></td>
            <td>${r.tickets || '-'}</td>
            <td>${r.calls || '-'}</td>
            <td style="font-weight: bold;">${r.total || '-'}</td>
            <td style="font-size: 0.85rem; color: var(--text-secondary);">${r.dayValue || '-'}</td>
            <td>${r.hours > 0 ? r.hours + 'h' : '-'}</td>
            <td style="color: ${prodColor}; font-weight: bold;">${prodDisplay}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// --- Agent Chips UI ---

function getFilteredAgents() {
    const agentNames = new Map();
    dataByDate.forEach(entry => {
        const addFromMap = (map) => {
            if (!map) return;
            map.forEach((val, normalizedName) => {
                if (agentNames.has(normalizedName)) return;
                const agent = matchAgent(val.originalName);
                if (agent) {
                    agentNames.set(normalizeName(agent.fullName), { fullName: agent.fullName, primaryTeam: agent.primaryTeam });
                }
            });
        };
        addFromMap(entry.ticketsData);
        addFromMap(entry.callsData);
    });

    getUsersData().forEach(u => {
        const key = normalizeName(u.fullName);
        if (!agentNames.has(key)) {
            agentNames.set(key, { fullName: u.fullName, primaryTeam: u.primaryTeam });
        }
    });

    let agents = [...agentNames.entries()];
    if (currentTeamFilter !== 'all') {
        agents = agents.filter(([, info]) => info.primaryTeam?.includes(currentTeamFilter));
    }
    agents.sort((a, b) => a[1].fullName.localeCompare(b[1].fullName));
    return agents;
}

function renderAgentChips(searchTerm = '') {
    const container = document.getElementById('agentChipsContainer');
    const countEl = document.getElementById('prodAgentCount');
    if (!container) return;

    let agents = getFilteredAgents();

    // Apply search filter
    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        agents = agents.filter(([, info]) => info.fullName.toLowerCase().includes(lower));
    }

    let html = '';
    agents.forEach(([normalizedName, info]) => {
        const isSelected = selectedAgents.has(normalizedName);
        const teamCode = info.primaryTeam?.split(' ')[0] || '';
        html += `<button onclick="window.__toggleAgent('${normalizedName}')" style="
            background: ${isSelected ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)'};
            border: 1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'};
            color: ${isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'};
            padding: 0.3rem 0.7rem; border-radius: 4px; font-size: 0.8rem; cursor: pointer;
            transition: all 0.15s;
        ">${info.fullName} <span style="font-size: 0.7rem; opacity: 0.6;">${teamCode}</span></button>`;
    });

    container.innerHTML = html;
    if (countEl) {
        countEl.textContent = selectedAgents.size > 0 ? `${selectedAgents.size} ${t('prod-selected')}` : '';
    }
}

// Global functions for agent chip clicks
window.__toggleAgent = function(normalizedName) {
    if (selectedAgents.has(normalizedName)) {
        selectedAgents.delete(normalizedName);
    } else {
        selectedAgents.add(normalizedName);
    }
    renderAgentChips();
    renderCurrentView();
};

window.__selectAllAgents = function() {
    getFilteredAgents().forEach(([key]) => selectedAgents.add(key));
    renderAgentChips(document.getElementById('prodAgentSearch')?.value || '');
    renderCurrentView();
};

window.__deselectAllAgents = function() {
    selectedAgents.clear();
    renderAgentChips(document.getElementById('prodAgentSearch')?.value || '');
    renderCurrentView();
};

// --- View Management ---

export function renderCurrentView() {
    if (currentView === 'detail') {
        renderDetailView();
    } else {
        renderProductivity();
    }
}

function setView(view) {
    currentView = view;
    const overviewBtn = document.getElementById('viewOverview');
    const detailBtn = document.getElementById('viewDetail');
    const agentSection = document.getElementById('agentSelectorSection');

    if (overviewBtn) {
        overviewBtn.style.background = view === 'overview' ? 'var(--accent)' : 'var(--primary-dark)';
        overviewBtn.style.color = view === 'overview' ? '#000' : 'var(--text-secondary)';
        overviewBtn.style.fontWeight = view === 'overview' ? '600' : '400';
    }
    if (detailBtn) {
        detailBtn.style.background = view === 'detail' ? 'var(--accent)' : 'var(--primary-dark)';
        detailBtn.style.color = view === 'detail' ? '#000' : 'var(--text-secondary)';
        detailBtn.style.fontWeight = view === 'detail' ? '600' : '400';
    }
    if (agentSection) agentSection.style.display = view === 'detail' ? 'block' : 'none';

    if (view === 'detail') {
        renderAgentChips();
    }
    renderCurrentView();
}

// --- Upload date UI ---

function updateUploadDateStatus() {
    const statusEl = document.getElementById('uploadDateStatus');
    const filesSection = document.getElementById('uploadFilesSection');
    if (!statusEl || !filesSection) return;

    if (!uploadDate) {
        statusEl.style.display = 'none';
        filesSection.style.opacity = '0.4';
        filesSection.style.pointerEvents = 'none';
        return;
    }

    filesSection.style.opacity = '1';
    filesSection.style.pointerEvents = 'auto';

    if (hasDataForDate(uploadDate)) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<div class="alert alert-warning" style="margin: 0; padding: 0.75rem 1rem;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink: 0;">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>${t('prod-data-for')} <strong>${formatDateDisplay(uploadDate)}</strong> ${t('prod-data-exists')}</span>
        </div>`;
    } else {
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<p style="color: var(--success); margin: 0; font-size: 0.9rem;">${t('prod-date-selected')} <strong>${formatDateDisplay(uploadDate)}</strong> — ${t('prod-can-upload')}</p>`;
    }
}

function showUploadSuccess() {
    const statusEl = document.getElementById('uploadDateStatus');
    if (!statusEl) return;
    const entry = dataByDate.get(uploadDate);
    const hasTickets = entry?.ticketsData && entry.ticketsData.size > 0;
    const hasCalls = entry?.callsData && entry.callsData.size > 0;
    const parts = [];
    if (hasTickets) parts.push(`${entry.ticketsData.size} ${t('prod-agents-from-tickets')}`);
    if (hasCalls) parts.push(`${entry.callsData.size} ${t('prod-agents-from-calls')}`);
    statusEl.style.display = 'block';
    statusEl.innerHTML = `<p style="color: var(--success); margin: 0; font-size: 0.9rem;">${t('prod-data-uploaded-for')} <strong>${formatDateDisplay(uploadDate)}</strong>: ${parts.join(', ')}. ${t('prod-can-add-file')}</p>`;
}

function renderLoadedDates() {
    const summaryEl = document.getElementById('loadedDatesSummary');
    const listEl = document.getElementById('loadedDatesList');
    if (!summaryEl || !listEl) return;

    if (dataByDate.size === 0) {
        summaryEl.style.display = 'none';
        return;
    }

    summaryEl.style.display = 'block';
    const sortedDates = [...dataByDate.keys()].sort();

    let html = '<div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">';
    sortedDates.forEach(dateKey => {
        const entry = dataByDate.get(dateKey);
        const hasTickets = entry.ticketsData && entry.ticketsData.size > 0;
        const hasCalls = entry.callsData && entry.callsData.size > 0;
        const parts = [];
        if (hasTickets) parts.push(`${entry.ticketsData.size} ${t('prod-agents-tickets')}`);
        if (hasCalls) parts.push(`${entry.callsData.size} ${t('prod-agents-calls')}`);
        const tooltip = parts.join(', ') || t('prod-no-data-tooltip');

        html += `<div title="${tooltip}" style="
            display: inline-flex; align-items: center; gap: 0.5rem;
            padding: 0.4rem 0.8rem; border-radius: 6px;
            background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25);
            font-size: 0.85rem; color: var(--text-primary);
        ">
            <span>${formatDateDisplay(dateKey)}</span>
            ${hasTickets ? '<span style="color: var(--success); font-size: 0.75rem;">XLSX</span>' : ''}
            ${hasCalls ? '<span style="color: var(--accent); font-size: 0.75rem;">CSV</span>' : ''}
            <button onclick="window.__removeProductivityDate('${dateKey}')" style="
                background: none; border: none; color: var(--text-secondary); cursor: pointer;
                padding: 0 0.2rem; font-size: 1rem; line-height: 1;
            " title="${t('prod-delete-btn')}">&times;</button>
        </div>`;
    });
    html += '</div>';
    listEl.innerHTML = html;
}

// Expose remove function globally for the inline onclick
window.__removeProductivityDate = async function(dateKey) {
    dataByDate.delete(dateKey);
    await deleteFromFirestore(dateKey);
    renderLoadedDates();
    updateUploadDateStatus();
    renderProductivity();
    showTemporaryMessage(t('prod-deleted').replace('{date}', formatDateDisplay(dateKey)), 'success', 2000);
};

// --- Upload Handlers ---

function setupUploadArea(areaId, fileInputId, fileNameId, fileType, onParsed) {
    const area = document.getElementById(areaId);
    const fileInput = document.getElementById(fileInputId);
    const fileNameEl = document.getElementById(fileNameId);
    if (!area || !fileInput) return;

    area.addEventListener('click', (e) => {
        if (e.target !== fileInput) fileInput.click();
    });

    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.style.borderColor = 'var(--accent)';
        area.style.background = 'var(--hover)';
    });
    area.addEventListener('dragleave', () => {
        area.style.borderColor = '';
        area.style.background = '';
    });
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.style.borderColor = '';
        area.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file, fileNameEl, fileType, onParsed);
    });

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file) handleFile(file, fileNameEl, fileType, onParsed);
    });
}

async function handleFile(file, fileNameEl, fileType, onParsed) {
    if (!uploadDate) {
        showTemporaryMessage(t('prod-select-date-first'), 'error');
        return;
    }

    // Check if this specific file type already has data (not just any data for the date)
    const entry = dataByDate.get(uploadDate);
    const wasOverride = entry && (
        (fileType === 'tickets' && entry.ticketsData && entry.ticketsData.size > 0) ||
        (fileType === 'calls' && entry.callsData && entry.callsData.size > 0)
    );

    if (fileNameEl) {
        fileNameEl.textContent = file.name;
        fileNameEl.style.color = 'var(--accent)';
    }
    try {
        await onParsed(file, uploadDate);
        await saveToFirestore(uploadDate);
        if (wasOverride) {
            showTemporaryMessage(t('data-overwritten').replace('{name}', file.name).replace('{date}', formatDateDisplay(uploadDate)), 'success');
        } else {
            showTemporaryMessage(t('file-processed').replace('{name}', file.name).replace('{date}', formatDateDisplay(uploadDate)), 'success');
        }
        renderLoadedDates();
        showUploadSuccess();
        if (currentView === 'detail') renderAgentChips();
        renderCurrentView();
    } catch (err) {
        console.error('File parse error:', err);
        showTemporaryMessage(t('error-generic').replace('{msg}', err.message), 'error');
        if (fileNameEl) {
            fileNameEl.textContent = t('error-file-processing').replace('{name}', file.name);
            fileNameEl.style.color = 'var(--error)';
        }
    }
}

// --- Initialization ---

export async function initializeProductivity() {
    // Load persisted data from Firestore
    await loadAllFromFirestore();

    // Upload date selector — Litepicker calendar
    const dateInput = document.getElementById('uploadDate');
    if (dateInput) {
        const today = new Date();
        const todayKey = today.toISOString().split('T')[0];
        uploadDate = todayKey;
        updateUploadDateStatus();

        const uploadPicker = new Litepicker({
            element: dateInput,
            singleMode: true,
            lang: 'ro-RO',
            startDate: today,
            format: 'DD MMM YYYY',
            dropdowns: { minYear: 2024, maxYear: 2030, months: true, years: true },
            setup: (picker) => {
                picker.on('selected', (date) => {
                    const d = date.dateInstance;
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    uploadDate = `${d.getFullYear()}-${mm}-${dd}`;
                    updateUploadDateStatus();
                    const tf = document.getElementById('ticketsFileName');
                    const cf = document.getElementById('callsFileName');
                    if (tf) tf.textContent = '';
                    if (cf) cf.textContent = '';
                });
            }
        });
    }

    // Setup uploads
    setupUploadArea('uploadTickets', 'ticketsFileInput', 'ticketsFileName', 'tickets', async (file, dateKey) => {
        const ticketsData = await parseTicketsXLSX(file);
        const entry = getOrCreateDateEntry(dateKey);
        entry.ticketsData = ticketsData;
        console.log(`[Productivity] Parsed ${ticketsData.size} agents from tickets file for ${dateKey}.`);
    });

    setupUploadArea('uploadCalls', 'callsFileInput', 'callsFileName', 'calls', async (file, dateKey) => {
        const text = await file.text();
        const callsData = parseCallsCSV(text);
        const entry = getOrCreateDateEntry(dateKey);
        entry.callsData = callsData;
        console.log(`[Productivity] Parsed ${callsData.size} agents from calls file for ${dateKey}.`);
    });

    // Date range picker for productivity view
    const pickerInput = document.getElementById('productivityDateRange');
    if (pickerInput) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dateStart = new Date(today);
        dateEnd = new Date(today);

        productivityPicker = new Litepicker({
            element: pickerInput,
            singleMode: false,
            allowRepick: true,
            lang: 'ro-RO',
            startDate: dateStart,
            endDate: dateEnd,
            format: 'DD MMM YYYY',
            numberOfMonths: 2,
            numberOfColumns: 2,
            setup: (picker) => {
                picker.on('selected', (date1, date2) => {
                    dateStart = date1.dateInstance;
                    dateEnd = date2.dateInstance;
                    if (hasAnyData()) renderCurrentView();
                });
            }
        });
    }

    // View toggle - bind directly to buttons
    document.getElementById('viewOverview')?.addEventListener('click', () => {
        console.log('[Productivity] Switching to Sumar view');
        setView('overview');
    });
    document.getElementById('viewDetail')?.addEventListener('click', () => {
        console.log('[Productivity] Switching to Per Agent view');
        setView('detail');
    });

    // Agent search
    const agentSearch = document.getElementById('prodAgentSearch');
    if (agentSearch) {
        agentSearch.addEventListener('input', () => renderAgentChips(agentSearch.value));
    }
    const selectAllBtn = document.getElementById('prodSelectAll');
    if (selectAllBtn) selectAllBtn.addEventListener('click', () => window.__selectAllAgents());
    const deselectAllBtn = document.getElementById('prodDeselectAll');
    if (deselectAllBtn) deselectAllBtn.addEventListener('click', () => window.__deselectAllAgents());

    // Team filter
    const teamFilter = document.getElementById('productivityTeamFilter');
    if (teamFilter) {
        teamFilter.addEventListener('change', () => {
            currentTeamFilter = teamFilter.value;
            if (currentView === 'detail') renderAgentChips();
            if (hasAnyData()) renderCurrentView();
        });
    }

    renderLoadedDates();
    updateUploadDateStatus();
    if (hasAnyData()) renderCurrentView();
}

export function cleanupProductivity() {
    dataByDate.clear();
}

/**
 * Returns productivity trend data for the dashboard chart.
 * Groups agents by primaryTeam, calculates per-team productivity per day.
 * Returns { dates: string[], teams: { teamDisplayName: number[] } }
 */
/**
 * Returns the average productivity (items/hour) across all teams for the last 7 days with data.
 * Returns { average: number|null, days: number }
 */
export function getAverageProductivity() {
    const agents = getPlannerData();
    if (!hasAnyData() || agents.length === 0) return { average: null, days: 0 };

    // Get the last 7 days with actual uploaded data
    const sortedDates = [...dataByDate.keys()]
        .filter(dk => {
            const e = dataByDate.get(dk);
            return (e.ticketsData && e.ticketsData.size > 0) || (e.callsData && e.callsData.size > 0);
        })
        .sort()
        .slice(-7);

    if (sortedDates.length === 0) return { average: null, days: 0 };

    let totalItems = 0;
    let totalHours = 0;

    for (const dateKey of sortedDates) {
        const entry = dataByDate.get(dateKey);
        const dateParts = dateKey.split('-');
        const dayIndex = parseInt(dateParts[2], 10) - 1;
        const monthKeyFromDate = `${dateParts[0]}-${dateParts[1]}`;

        for (const agent of agents) {
            if (agent.isActive === false) continue;

            const normalizedName = normalizeName(agent.fullName || agent.username || '');

            let items = 0;
            if (entry.ticketsData) {
                const t = entry.ticketsData.get(normalizedName);
                if (t) items += t.tickets || 0;
            }
            if (entry.callsData) {
                const c = entry.callsData.get(normalizedName);
                if (c) items += c.calls || 0;
            }

            const daysArray = getAgentDaysForMonth(agent, monthKeyFromDate);
            const dayValue = daysArray[dayIndex] || '';
            const hours = extractHoursFromDay(dayValue);

            totalItems += items;
            totalHours += hours;
        }
    }

    return {
        average: totalHours > 0 ? totalItems / totalHours : null,
        days: sortedDates.length
    };
}

export function getProductivityTrendData(targetYear, targetMonth) {
    const agents = getPlannerData();
    const datesWithData = new Set(
        [...dataByDate.keys()].filter(dk => {
            const e = dataByDate.get(dk);
            return (e.ticketsData && e.ticketsData.size > 0) || (e.callsData && e.callsData.size > 0);
        })
    );

    if (datesWithData.size === 0) return null;

    // Build full month range (use target month if provided, else current)
    const now = new Date();
    const year = targetYear != null ? targetYear : now.getFullYear();
    const month = targetMonth != null ? targetMonth : now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const allDates = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        allDates.push(`${year}-${mm}-${dd}`);
    }

    // Discover all teams from agents
    const teamSet = new Set();
    for (const agent of agents) {
        if (agent.primaryTeam) teamSet.add(agent.primaryTeam);
    }
    const teamNames = [...teamSet].sort();

    // Per-team series: { teamName: number[] }
    const teamSeries = {};
    teamNames.forEach(t => { teamSeries[t] = []; });

    for (const dateKey of allDates) {
        if (!datesWithData.has(dateKey)) {
            teamNames.forEach(t => teamSeries[t].push(null));
            continue;
        }

        const entry = dataByDate.get(dateKey);
        const datePartsChart = dateKey.split('-');
        const dayIndex = parseInt(datePartsChart[2], 10) - 1;
        const monthKeyChart = `${datePartsChart[0]}-${datePartsChart[1]}`;

        // Aggregate items and hours per team (grouped by agent's primaryTeam)
        const teamItems = {};
        const teamHours = {};
        teamNames.forEach(t => { teamItems[t] = 0; teamHours[t] = 0; });

        for (const agent of agents) {
            if (agent.isActive === false) continue;
            const team = agent.primaryTeam;
            if (!team) continue;

            const normalizedName = normalizeName(agent.fullName || agent.username || '');

            // Items: all tickets + calls for this agent go to their primaryTeam
            let items = 0;
            if (entry.ticketsData) {
                const t = entry.ticketsData.get(normalizedName);
                if (t) items += t.tickets || 0;
            }
            if (entry.callsData) {
                const c = entry.callsData.get(normalizedName);
                if (c) items += c.calls || 0;
            }

            // Hours from planner
            const daysArrayChart = getAgentDaysForMonth(agent, monthKeyChart);
            const dayValue = daysArrayChart[dayIndex] || '';
            const hours = extractHoursFromDay(dayValue);

            teamItems[team] += items;
            teamHours[team] += hours;
        }

        // Calculate productivity per team
        for (const team of teamNames) {
            const prod = teamHours[team] > 0 && teamItems[team] > 0
                ? teamItems[team] / teamHours[team]
                : null;
            teamSeries[team].push(prod);
        }
    }

    // Filter out teams with no data at all
    const activeTeams = {};
    for (const team of teamNames) {
        if (teamSeries[team].some(v => v !== null)) {
            activeTeams[team] = teamSeries[team];
        }
    }

    return { dates: allDates, teams: activeTeams };
}
