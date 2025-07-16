// js/dashboard.js

/**
 * Updates all dashboard components with fresh data from the planner.
 * @param {Array<object>} plannerData - The live array of agent objects from Firestore.
 */
export function updateDashboard(plannerData) {
    if (!plannerData) return;

    // Get today's date for filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Update the main header title with today's date
    updateDashboardTitle(today);

    // --- Card 1: Total Active Agents ---
    updateActiveAgentsCard(plannerData);

    // --- Card 2 & Team Table: Planned Hours & Team Breakdown for Today ---
    const dailyStats = calculateDailyStats(plannerData, today);
    updatePlannedHoursCard(dailyStats);
    updateTeamHoursTable(dailyStats);
}

/**
 * Updates the dashboard's main title with the current date.
 * @param {Date} date - The date to display.
 */
function updateDashboardTitle(date) {
    const titleEl = document.getElementById('dashboardTitle');
    if (titleEl) {
        const dateString = date.toLocaleDateString('ro-RO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        titleEl.textContent = `Dashboard - ${dateString}`;
    }
}

/**
 * Updates the 'Total Active Agents' card.
 * @param {Array<object>} plannerData - The live array of agent objects.
 */
function updateActiveAgentsCard(plannerData) {
    const valueEl = document.getElementById('totalActiveAgentsValue');
    const detailEl = document.getElementById('totalActiveAgentsDetail');

    if (valueEl) {
        valueEl.textContent = plannerData.length;
    }
    if (detailEl) {
        // This is a placeholder as we don't have historical data yet.
        detailEl.textContent = "Agenți în baza de date*";
    }
}

/**
 * Calculates planned hours and a breakdown by team for a specific day.
 * @param {Array<object>} plannerData - The array of agent objects.
 * @param {Date} date - The date to calculate stats for.
 * @returns {object} An object containing total hours and team-specific stats.
 */
function calculateDailyStats(plannerData, date) {
    const dayIndex = date.getDate() - 1; // agent.days is 0-indexed for the month
    const teamStats = {}; // { RO: { hours: 8, agents: Set('agentId1') }, ... }
    let totalHoursToday = 0;

    plannerData.forEach(agent => {
        const dayValue = agent.days?.[dayIndex];
        if (!dayValue || typeof dayValue !== 'string') {
            return; // No schedule for this agent today
        }

        // Parse entries like "8 RO" or "4 RO + 4 HU"
        const entries = dayValue.split('+');
        entries.forEach(entry => {
            const trimmedEntry = entry.trim();
            // Regex to capture hours (number) and team code (letters)
            const match = trimmedEntry.match(/(\d+)\s*([a-zA-Z]+)/);

            if (match) {
                const hours = parseInt(match[1], 10);
                const teamCode = match[2].toUpperCase();

                totalHoursToday += hours;

                // Initialize team stats if not present
                if (!teamStats[teamCode]) {
                    teamStats[teamCode] = { hours: 0, agentIds: new Set() };
                }

                // Aggregate stats
                teamStats[teamCode].hours += hours;
                teamStats[teamCode].agentIds.add(agent.id);
            }
        });
    });
    
    return {
        totalHours: totalHoursToday,
        teams: teamStats,
        totalAgents: plannerData.length
    };
}

/**
 * Updates the 'Planned Hours' card with today's stats.
 * @param {object} dailyStats - The stats object from calculateDailyStats.
 */
function updatePlannedHoursCard(dailyStats) {
    const valueEl = document.getElementById('plannedHoursValue');
    const detailEl = document.getElementById('plannedHoursDetail');
    const toggleToday = document.getElementById('todayBtn');
    const toggleTomorrow = document.getElementById('tomorrowBtn');

    if (valueEl) {
        valueEl.textContent = dailyStats.totalHours;
    }
    if (detailEl) {
        detailEl.textContent = `Pentru ${dailyStats.totalAgents} agenți`;
    }
    
    // Logic for the today/tomorrow toggle (placeholder for now)
    if (toggleToday && toggleTomorrow) {
        toggleToday.classList.add('active');
        toggleTomorrow.classList.remove('active');
        // Note: Tomorrow's data functionality is not yet implemented.
        toggleTomorrow.title = "Funcționalitate în curând*";
    }
}

/**
 * Renders the 'Hours by Team' table for today.
 * @param {object} dailyStats - The stats object from calculateDailyStats.
 */
function updateTeamHoursTable(dailyStats) {
    const tableBody = document.getElementById('teamHoursTableBody');
    const titleEl = document.getElementById('hoursByTeamTitle');
    
    if (titleEl) {
        titleEl.textContent = "Ore Alocate pe Echipe - Azi";
    }

    if (!tableBody) return;

    tableBody.innerHTML = ''; // Clear previous data

    const sortedTeams = Object.keys(dailyStats.teams).sort();

    if (sortedTeams.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3">Nu sunt ore planificate pentru astăzi.</td></tr>`;
        return;
    }

    sortedTeams.forEach(teamCode => {
        const teamData = dailyStats.teams[teamCode];
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${teamCode} zooplus</td>
            <td>${teamData.agentIds.size}</td>
            <td>${teamData.hours}</td>
        `;
        tableBody.appendChild(row);
    });
} 