// js/reports.js
import { getPlannerData } from './planner.js';
import { getUsersData } from './users.js';

let reportsPicker = null;
let reportStart = null;
let reportEnd = null;

// --- Parse day value into per-team hours ---
// e.g. "4RO+4HU" => { RO: 4, HU: 4 }
// e.g. "8RO" => { RO: 8 }
// e.g. "8" => { _unknown: 8 }
// e.g. "Co", "CM", "SL", "LB", "" => {}
function parseTeamHours(dayValue) {
    const result = {};
    if (!dayValue || typeof dayValue !== 'string') return result;
    const trimmed = dayValue.trim();
    if (['Co', 'CM', 'LB', 'SL', ''].includes(trimmed)) return result;

    const parts = trimmed.split('+');
    for (const part of parts) {
        const p = part.trim();
        const match = p.match(/^(\d+)\s*([A-Za-z-]+)?$/);
        if (match) {
            const hours = parseInt(match[1], 10);
            const team = match[2] ? match[2].toUpperCase() : null;
            if (team) {
                result[team] = (result[team] || 0) + hours;
            } else {
                // Just a number like "8" — use agent's primary team
                result['_noTeam'] = (result['_noTeam'] || 0) + hours;
            }
        }
    }
    return result;
}

// Team code to display name
const TEAM_DISPLAY = {
    'RO': 'RO zooplus', 'HU': 'HU zooplus', 'IT': 'IT zooplus',
    'NL': 'NL zooplus', 'CS': 'CS zooplus', 'SK': 'SK zooplus',
    'SV-SE': 'SV-SE zooplus', 'DE': 'DE zooplus',
    'BRO': 'BRO', 'BDE': 'BDE',
};

function teamCodeFromPrimaryTeam(primaryTeam) {
    if (!primaryTeam) return 'OTHER';
    return primaryTeam.split(' ')[0].toUpperCase();
}

// --- Calculate report data for date range ---
function calculateReportData(start, end) {
    const agents = getPlannerData();
    if (!agents || agents.length === 0) return null;

    // Per-shop aggregation: { teamDisplayName: { totalHours, agents: Map<agentName, hours> } }
    const shopData = {};

    for (const agent of agents) {
        if (!agent.days || !Array.isArray(agent.days)) continue;
        if (agent.isActive === false) continue;

        const agentPrimaryTeamCode = teamCodeFromPrimaryTeam(agent.primaryTeam);
        const agentName = agent.fullName || agent.username || 'Unknown';

        const current = new Date(start);
        current.setHours(0, 0, 0, 0);
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);

        while (current <= endDate) {
            const dayIndex = current.getDate() - 1;
            if (dayIndex >= 0 && dayIndex < agent.days.length) {
                const dayValue = agent.days[dayIndex];
                const teamHours = parseTeamHours(dayValue);

                for (const [teamCode, hours] of Object.entries(teamHours)) {
                    let resolvedCode = teamCode;
                    if (teamCode === '_noTeam') {
                        // Assign to agent's primary team
                        resolvedCode = agentPrimaryTeamCode;
                    }

                    const displayName = TEAM_DISPLAY[resolvedCode] || resolvedCode;
                    if (!shopData[displayName]) {
                        shopData[displayName] = { totalHours: 0, agents: new Map() };
                    }
                    shopData[displayName].totalHours += hours;
                    const prev = shopData[displayName].agents.get(agentName) || 0;
                    shopData[displayName].agents.set(agentName, prev + hours);
                }
            }
            current.setDate(current.getDate() + 1);
        }
    }

    return shopData;
}

// --- Render ---
function renderReports() {
    const container = document.getElementById('reportsContent');
    if (!container) return;

    if (!reportStart || !reportEnd) {
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
            Selectează un interval de date pentru a genera rapoartele.
        </div>`;
        return;
    }

    const shopData = calculateReportData(reportStart, reportEnd);
    if (!shopData || Object.keys(shopData).length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
            Nu există date planificate pentru intervalul selectat.
        </div>`;
        return;
    }

    // Sort shops by total hours descending
    const sortedShops = Object.entries(shopData).sort((a, b) => b[1].totalHours - a[1].totalHours);

    // Format date range for title
    const fmt = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${day}.${m}.${y}`;
    };
    const rangeLabel = fmt(reportStart) + ' - ' + fmt(reportEnd);

    // --- Hours by Shop Table ---
    let hoursTableRows = '';
    let grandTotal = 0;
    for (const [shopName, data] of sortedShops) {
        const agentCount = data.agents.size;
        grandTotal += data.totalHours;
        hoursTableRows += `
            <tr>
                <td>${shopName}</td>
                <td style="color: var(--accent); font-weight: bold;">${data.totalHours.toLocaleString()}</td>
                <td>${agentCount}</td>
            </tr>`;
    }
    hoursTableRows += `
        <tr style="border-top: 2px solid var(--border); font-weight: bold;">
            <td>TOTAL</td>
            <td style="color: var(--accent);">${grandTotal.toLocaleString()}</td>
            <td></td>
        </tr>`;

    // --- Agent Distribution Cards ---
    let agentCards = '';
    for (const [shopName, data] of sortedShops) {
        const sortedAgents = [...data.agents.entries()].sort((a, b) => b[1] - a[1]);
        let agentRows = '';
        for (const [name, hours] of sortedAgents) {
            agentRows += `
                <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                    <span>${name}</span>
                    <span style="color: var(--text-secondary)">${hours}h</span>
                </div>`;
        }
        agentCards += `
            <div class="stat-card">
                <h4 style="color: var(--accent); margin-bottom: 0.5rem;">${shopName}</h4>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                    ${data.agents.size} agenți · ${data.totalHours} ore
                </div>
                <div style="max-height: 250px; overflow-y: auto; padding-right: 0.75rem;">
                    ${agentRows}
                </div>
            </div>`;
    }

    container.innerHTML = `
        <div class="chart-container">
            <h3 class="chart-title">Ore Planificate per Shop — ${rangeLabel}</h3>
            <table style="margin-top: 1rem;">
                <thead>
                    <tr>
                        <th>Shop</th>
                        <th>Total Ore</th>
                        <th>Nr. Agenți</th>
                    </tr>
                </thead>
                <tbody>${hoursTableRows}</tbody>
            </table>
        </div>

        <div class="chart-container" style="margin-top: 1.5rem;">
            <h3 class="chart-title">Distribuție Agenți per Shop — ${rangeLabel}</h3>
            <div class="dashboard-grid" style="margin-top: 1rem;">
                ${agentCards}
            </div>
        </div>`;
}

// --- Initialize ---
export function initializeReports() {
    const input = document.getElementById('reportsDateRange');
    if (!input) return;

    // Default to current month
    const now = new Date();
    reportStart = new Date(now.getFullYear(), now.getMonth(), 1);
    reportEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month

    reportsPicker = new Litepicker({
        element: input,
        singleMode: false,
        numberOfMonths: 2,
        numberOfColumns: 2,
        format: 'DD.MM.YYYY',
        startDate: reportStart,
        endDate: reportEnd,
        setup: (picker) => {
            picker.on('selected', (date1, date2) => {
                reportStart = date1.dateInstance;
                reportEnd = date2.dateInstance;
                renderReports();
            });
        }
    });

    // Initial render with default range
    renderReports();
}

export function cleanupReports() {
    if (reportsPicker) {
        reportsPicker.destroy();
        reportsPicker = null;
    }
}
