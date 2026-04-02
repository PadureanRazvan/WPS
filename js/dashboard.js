// js/dashboard.js
import { getAverageProductivity } from './productivity.js';
import { translations, isNonWorkingCode, normalizeTeamForDisplay, parseShiftEntry, getMonthKey, getAgentDaysForMonth } from './config.js';

let cachedPlannerData = null;
let currentSelectedDate = null; // null means "today"

function getLang() {
    return localStorage.getItem('language') || 'ro';
}

function t(key) {
    const lang = getLang();
    return (translations[lang] && translations[lang][key]) || key;
}

/**
 * Returns the locale string for date formatting based on current language
 */
function getLocale() {
    const lang = getLang();
    const locales = { ro: 'ro-RO', en: 'en-US', it: 'it-IT' };
    return locales[lang] || 'ro-RO';
}

/**
 * Updates all dashboard components with fresh data from the planner.
 */
export function updateDashboard(plannerData) {
    if (!plannerData) return;

    cachedPlannerData = plannerData;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    updateDashboardTitle(today);
    updateActiveAgentsCard(plannerData);

    // Show stats for currently selected date (today by default)
    const dateToShow = currentSelectedDate || today;
    const dailyStats = calculateDailyStats(plannerData, dateToShow);
    const label = currentSelectedDate ? formatDateLabel(currentSelectedDate) : t('today');
    updatePlannedHoursCard(dailyStats);
    updateTeamHoursTable(dailyStats, label);

    // Update average productivity card
    updateAverageProductivityCard();

    setupDayToggle();
}

let toggleSetup = false;
function setupDayToggle() {
    if (toggleSetup) return;
    toggleSetup = true;

    const todayBtn = document.getElementById('todayBtn');
    const datePicker = document.getElementById('plannedDatePicker');
    const wrapper = document.getElementById('datePickerWrapper');
    const calendarLabel = document.getElementById('calendarLabel');
    if (!todayBtn || !datePicker) return;

    todayBtn.addEventListener('click', () => {
        currentSelectedDate = null;
        todayBtn.classList.add('active');
        datePicker.value = '';
        if (wrapper) wrapper.classList.remove('has-value');
        if (calendarLabel) calendarLabel.textContent = '\u{1F4C5}';
        if (cachedPlannerData) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const stats = calculateDailyStats(cachedPlannerData, today);
            updatePlannedHoursCard(stats);
            updateTeamHoursTable(stats, t('today'));
        }
    });

    datePicker.addEventListener('change', () => {
        if (!datePicker.value) return;
        const parts = datePicker.value.split('-');
        const selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        selectedDate.setHours(0, 0, 0, 0);
        currentSelectedDate = selectedDate;
        todayBtn.classList.remove('active');
        if (wrapper) wrapper.classList.add('has-value');
        const label = formatDateLabel(selectedDate);
        if (calendarLabel) calendarLabel.textContent = label;

        if (cachedPlannerData) {
            const stats = calculateDailyStats(cachedPlannerData, selectedDate);
            updatePlannedHoursCard(stats);
            updateTeamHoursTable(stats, label);
        }
    });
}

function formatDateLabel(date) {
    return date.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });
}

function updateDashboardTitle(date) {
    const titleEl = document.getElementById('dashboardTitle');
    if (titleEl) {
        const dateString = date.toLocaleDateString(getLocale(), {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        titleEl.textContent = `${t('dashboard-title')} - ${dateString}`;
    }
}

function updateActiveAgentsCard(plannerData) {
    const valueEl = document.getElementById('totalActiveAgentsValue');
    const detailEl = document.getElementById('totalActiveAgentsDetail');

    if (valueEl) valueEl.textContent = plannerData.length;
    if (detailEl) detailEl.textContent = t('agents-in-db');
}

function calculateDailyStats(plannerData, date) {
    const dayIndex = date.getDate() - 1;
    const monthKey = getMonthKey(date);
    const teamStats = {};
    let totalHours = 0;
    let scheduledAgents = 0;

    plannerData.forEach(agent => {
        const daysArray = getAgentDaysForMonth(agent, monthKey);
        const dayValue = daysArray[dayIndex];
        if (!dayValue || typeof dayValue !== 'string') return;

        const trimmed = dayValue.trim();
        if (isNonWorkingCode(trimmed)) return;

        let agentHours = 0;
        const entries = trimmed.split('+');
        entries.forEach(entry => {
            const parsed = parseShiftEntry(entry);
            if (parsed && parsed.team) {
                const hours = parsed.hours;
                let teamCode = normalizeTeamForDisplay(parsed.team);
                totalHours += hours;
                agentHours += hours;

                if (!teamStats[teamCode]) {
                    teamStats[teamCode] = { hours: 0, agentIds: new Set() };
                }
                teamStats[teamCode].hours += hours;
                teamStats[teamCode].agentIds.add(agent.id);
            }
        });

        if (agentHours > 0) scheduledAgents++;
    });

    return {
        totalHours,
        teams: teamStats,
        totalAgents: plannerData.length,
        scheduledAgents
    };
}

function updatePlannedHoursCard(dailyStats) {
    const valueEl = document.getElementById('plannedHoursValue');
    const detailEl = document.getElementById('plannedHoursDetail');

    if (valueEl) {
        valueEl.textContent = dailyStats.totalHours;
        valueEl.style.transform = 'scale(1.05)';
        setTimeout(() => { valueEl.style.transform = 'scale(1)'; }, 200);
    }
    if (detailEl) {
        detailEl.textContent = `${dailyStats.scheduledAgents} ${t('agents-planned')}`;
    }
}

function updateTeamHoursTable(dailyStats, dateLabel) {
    const tableBody = document.getElementById('teamHoursTableBody');
    const titleEl = document.getElementById('hoursByTeamTitle');

    if (titleEl) {
        titleEl.textContent = `${t('hours-by-team')} - ${dateLabel}`;
    }

    if (!tableBody) return;
    tableBody.innerHTML = '';

    const sortedTeams = Object.keys(dailyStats.teams).sort();

    if (sortedTeams.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3">${t('no-hours-planned')}</td></tr>`;
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

export function updateAverageProductivityCard() {
    const valueEl = document.getElementById('averageProductivityValue');
    const detailEl = document.getElementById('averageProductivityDetail');
    if (!valueEl) return;

    const { average, days } = getAverageProductivity();

    if (average !== null) {
        valueEl.textContent = average.toFixed(2) + ' t/h';
        valueEl.style.color = average >= 5 ? 'var(--success)' : average >= 3 ? 'var(--warning)' : 'var(--error)';
        if (detailEl) {
            detailEl.textContent = t('avg-prod-last-days').replace('{n}', days);
        }
    } else {
        valueEl.textContent = 'N/A';
        valueEl.style.color = '';
        if (detailEl) {
            detailEl.textContent = t('avg-prod-no-data');
        }
    }
}
