// js/ui.js

// === THEME AND LANGUAGE FUNCTIONALITY ===
import { languageConfig, translations, PLANNER_TEAMS, TEAM_DISPLAY_NAMES, extractHoursFromDay, formatPlannerHoursValue, getMonthKey, getAgentNotesForMonth, isValidPlannerHoursValue } from './config.js';
function getLang() { return localStorage.getItem('language') || 'ro'; }
export function t(key) { const l = getLang(); return (translations[l] && translations[l][key]) || key; }
// Import the new Firestore functions from planner.js
import { addAgent, applyChangesToSelectedCells, renderPlannerTable, clearSelection } from './planner.js';
import { updateDashboard, updateAverageProductivityCard } from './dashboard.js';
import { initializeCharts } from './charts.js?v=2026.07.15.6';
import { getPlannerData } from './planner.js';
import { renderLogsSection } from './logs.js';
import { renderCurrentView as rerenderProductivity } from './productivity.js';
import { renderUsersTable } from './users.js';
import {
    getNextTheme,
    getThemeMeta,
    getThemeRevealRadius,
    normalizeThemePreference,
    resolveThemePreference
} from './theme-system.js?v=2026.07.15.6';

// Theme and language state
let currentThemePreference = normalizeThemePreference(localStorage.getItem('theme'));
let currentTheme = resolveThemePreference(currentThemePreference, prefersDarkScheme());
let currentLanguage = localStorage.getItem('language') || 'ro';
let systemThemeListenerBound = false;

function prefersDarkScheme() {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function notifyInterface(eventName, detail = {}) {
    if (typeof window.CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function applyThemeState(themePreference, shouldRefreshCharts = false) {
    currentThemePreference = normalizeThemePreference(themePreference);
    currentTheme = resolveThemePreference(currentThemePreference, prefersDarkScheme());
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.documentElement.setAttribute('data-theme-preference', currentThemePreference);
    localStorage.setItem('theme', currentThemePreference);

    const themeMeta = getThemeMeta(currentTheme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeMeta.metaColor);
    updateThemeIcon();

    if (shouldRefreshCharts && globalThis.Chart) {
        requestAnimationFrame(() => {
            try { initializeCharts(); } catch (_) { /* Charts may not be initialized yet. */ }
        });
    }
    notifyInterface('sherpa-theme-changed', { theme: currentTheme, preference: currentThemePreference });
}

export function setTheme(theme, origin = {}) {
    const nextPreference = normalizeThemePreference(theme);
    const nextTheme = resolveThemePreference(nextPreference, prefersDarkScheme());
    const shouldRefreshCharts = nextTheme !== currentTheme;
    const shouldUpdatePreference = nextPreference !== currentThemePreference;
    const commit = () => applyThemeState(nextPreference, shouldRefreshCharts);

    if ((!shouldRefreshCharts && !shouldUpdatePreference) || prefersReducedMotion() || typeof document.startViewTransition !== 'function') {
        commit();
        return;
    }

    document.documentElement.dataset.transitionKind = 'theme';
    const transition = document.startViewTransition(commit);
    transition.ready.then(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const x = Number.isFinite(origin.x) ? origin.x : width - 64;
        const y = Number.isFinite(origin.y) ? origin.y : 40;
        const radius = getThemeRevealRadius({ x, y, width, height });

        document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            {
                duration: 560,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                pseudoElement: '::view-transition-new(root)'
            }
        );
    }).catch(() => {});
    const clearThemeTransition = () => { delete document.documentElement.dataset.transitionKind; };
    transition.finished.then(clearThemeTransition, clearThemeTransition);
}

// Language Management
export function updateLanguageUI(langCode) {
    currentLanguage = langCode;
    localStorage.setItem('language', langCode);
    updateLanguageDisplay(langCode);
    translatePage(langCode);

    document.querySelectorAll('.language-option').forEach(option => {
        option.classList.remove('active');
        option.setAttribute('aria-checked', 'false');
    });
    const activeOption = document.querySelector(`[data-lang="${langCode}"]`);
    if (activeOption) {
        activeOption.classList.add('active');
        activeOption.setAttribute('aria-checked', 'true');
    }

    // Re-render ALL dynamic content with new language
    try {
        const plannerData = getPlannerData();
        if (plannerData && plannerData.length > 0) {
            updateDashboard(plannerData);
        }
        initializeCharts();
        renderPlannerTable();
        rerenderProductivity();
        renderUsersTable();
        renderLogsSection();
    } catch (e) {
        // Modules may not be initialized yet on first load
    }
}

// --- Landscape overlay for Planner on mobile ---
let currentSectionId = 'dashboard';

function checkPlannerLandscape() {
    const overlay = document.getElementById('rotateLandscapeOverlay');
    if (!overlay) return;

    const isMobilePortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
    const isPlanner = currentSectionId === 'planner';

    if (isPlanner && isMobilePortrait) {
        overlay.classList.add('visible');
    } else {
        overlay.classList.remove('visible');
    }
}

// Listen for orientation/resize changes
window.addEventListener('resize', checkPlannerLandscape);
window.addEventListener('orientationchange', () => {
    setTimeout(checkPlannerLandscape, 100);
});

// Navigation
export function showSection(sectionId, clickedElement) {
    const targetSection = document.getElementById(sectionId);
    if (!targetSection) return;

    const previousSectionId = currentSectionId;
    const applySectionState = () => {
        currentSectionId = sectionId;
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            item.removeAttribute('aria-current');
        });
        const activeNavItem = clickedElement || document.querySelector(`.nav-item[data-tooltip="${sectionId}"]`);
        activeNavItem?.classList.add('active');
        activeNavItem?.setAttribute('aria-current', 'page');

        document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
        targetSection.classList.add('active');
    };

    const finishSectionChange = () => {
        checkPlannerLandscape();
        if (sectionId === 'planner') {
            setTimeout(renderPlannerTable, 10);
        }
        if (sectionId === 'logs') {
            renderLogsSection();
        }
        notifyInterface('sherpa:navigation', { sectionId, previousSectionId });
    };

    if (sectionId !== previousSectionId && !prefersReducedMotion() && typeof document.startViewTransition === 'function') {
        document.documentElement.dataset.transitionKind = 'section';
        const transition = document.startViewTransition(applySectionState);
        transition.updateCallbackDone.then(finishSectionChange).catch(finishSectionChange);
        const clearSectionTransition = () => { delete document.documentElement.dataset.transitionKind; };
        transition.finished.then(clearSectionTransition, clearSectionTransition);
    } else {
        applySectionState();
        finishSectionChange();
    }
}


// Initialize theme and language from localStorage
export function initializeThemeAndLanguage() {
    applyThemeState(currentThemePreference, false);
    if (!systemThemeListenerBound) {
        const colorSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
        colorSchemeQuery?.addEventListener?.('change', () => {
            if (currentThemePreference === 'system') applyThemeState('system', true);
        });
        systemThemeListenerBound = true;
    }
    
    // Set language
    updateLanguageDisplay(currentLanguage);
    translatePage(currentLanguage);
    
    // Initialize the new user form
    initializeNewUserForm();
}

// Theme Management
export function toggleTheme() {
    setTheme(getNextTheme(currentThemePreference));
}

export function updateThemeIcon() {
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.innerHTML = `<circle cx="13.5" cy="6.5" r="1.25"/><circle cx="17.5" cy="10.5" r="1.25"/><circle cx="8.5" cy="7.5" r="1.25"/><circle cx="6.5" cy="12.5" r="1.25"/><path d="M12 3a9 9 0 0 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a1.5 1.5 0 0 1 0-3h2a7 7 0 0 0-2-10Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    const themeMeta = getThemeMeta(currentTheme);
    const themeLabel = currentThemePreference === 'system'
        ? `System (${themeMeta.name})`
        : themeMeta.name;
    const toggle = document.getElementById('themeToggle');
    toggle?.setAttribute('aria-label', `Theme: ${themeLabel}`);
    toggle?.setAttribute('title', `Theme: ${themeLabel}`);

    document.querySelectorAll('.theme-option').forEach(option => {
        const active = option.dataset.themeChoice === currentThemePreference;
        option.classList.toggle('active', active);
        option.setAttribute('aria-checked', String(active));
    });
}

export function updateLanguageDisplay(langCode) {
    const config = languageConfig[langCode];
    const currentFlag = document.getElementById('currentFlag');
    const currentLanguage = document.getElementById('currentLanguage');
    
    if (currentFlag) currentFlag.textContent = config.flag;
    if (currentLanguage) currentLanguage.textContent = config.name;
    const languageToggle = document.getElementById('languageToggle');
    languageToggle?.setAttribute('aria-label', `Language: ${config.name}`);
    languageToggle?.setAttribute('title', `Language: ${config.name}`);
}

export function translatePage(langCode) {
    const dict = translations[langCode];
    if (!dict) return;

    const elements = document.querySelectorAll('[data-translate]');
    elements.forEach(element => {
        const key = element.getAttribute('data-translate');
        if (dict[key]) {
            // Handle placeholder for input/textarea elements
            if ((element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') && element.hasAttribute('placeholder')) {
                element.placeholder = dict[key];
            } else {
                element.textContent = dict[key];
            }
        }
    });

    // Translate nav item spans (those without data-translate on the span itself)
    const navTranslations = {
        'dashboard': dict['nav-dashboard'],
        'users': dict['nav-users'],
        'planner': dict['nav-planner'],
        'productivity': dict['nav-productivity'],
        'upload': dict['nav-upload'],
        'reports': dict['nav-reports'],
        'info': dict['nav-info']
    };

    document.querySelectorAll('.nav-item').forEach(item => {
        const tooltip = item.getAttribute('data-tooltip');
        const span = item.querySelector('span:not([data-translate])');
        if (span && navTranslations[tooltip]) {
            span.textContent = navTranslations[tooltip];
        }
    });

    // Translate title attributes
    document.querySelectorAll('[data-translate-title]').forEach(element => {
        const key = element.getAttribute('data-translate-title');
        if (dict[key]) {
            element.title = dict[key];
            if (element.hasAttribute('aria-label')) {
                element.setAttribute('aria-label', dict[key]);
            }
        }
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && dict['logout']) logoutBtn.title = dict['logout'];
}

// Sidebar toggle functionality
export function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const headers = document.querySelectorAll('.main-content .header');

    sidebar.classList.toggle('collapsed');
    const isExpanded = !sidebar.classList.contains('collapsed');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    sidebarToggle?.setAttribute('aria-expanded', String(isExpanded));
    sidebarToggle?.setAttribute('aria-label', isExpanded ? 'Collapse navigation' : 'Expand navigation');
    
    headers.forEach(header => {
        if (header) {
            header.classList.toggle('collapsed');
        }
    });

    // FIX: Re-render the planner table to prevent cell misalignment
    // when the sidebar width changes (e.g., collapse/expand).
    // This only affects the active planner section, as the render
    // function safely exits if the planner is not visible.
    renderPlannerTable();
}

// Function to toggle the header visibility
export function toggleHeader() {
    const header = document.querySelector('.main-content .header');
    if (header) {
        header.classList.toggle('collapsed');
    }
}

// Day Toggle Functionality for Dashboard
const plannedHoursData = {
    today: {
        hours: 336,
        agents: 42
    },
    tomorrow: {
        hours: 312,
        agents: 39
    }
};

export function toggleDay(selectedDay) {
    // Update button states
    document.getElementById('todayBtn').classList.toggle('active', selectedDay === 'today');
    document.getElementById('tomorrowBtn').classList.toggle('active', selectedDay === 'tomorrow');
    
    // Update displayed data
    const data = plannedHoursData[selectedDay];
    document.getElementById('plannedHoursValue').textContent = data.hours;
    document.getElementById('plannedHoursDetail').textContent = data.detail;
    
    // Add a subtle animation effect
    const valueElement = document.getElementById('plannedHoursValue');
    valueElement.style.transform = 'scale(1.05)';
    setTimeout(() => {
        valueElement.style.transform = 'scale(1)';
    }, 200);
}

// --- Modal Functions (Refactored for Firestore) ---

export function openEditModal() {
    const selectedCells = document.querySelectorAll('.planner-cell.selected');
    if (selectedCells.length === 0) {
        alert(t('edit-select-cells'));
        return;
    }
    populateSelectionInfo();
    document.getElementById('editModal').classList.add('active');
    // Hide selection counter while modal is open
    const counter = document.getElementById('selectionCounter');
    if (counter) counter.classList.add('modal-open');
    resetEditModal();

    // Pre-populate note if exactly one cell is selected
    const noteInput = document.getElementById('cellNoteInput');
    if (noteInput && selectedCells.length === 1) {
        const cell = selectedCells[0];
        const agentId = cell.dataset.agentId;
        const dayIndex = cell.dataset.day;
        const monthKey = cell.dataset.month || getMonthKey(new Date());
        const plannerData = getPlannerData();
        const agent = plannerData.find(a => a.id === agentId);
        if (agent) {
            const notesForMonth = getAgentNotesForMonth(agent, monthKey);
            if (notesForMonth[dayIndex]) {
                noteInput.value = notesForMonth[dayIndex];
            }
        }
    }
}

export function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    // Show selection counter again
    const counter = document.getElementById('selectionCounter');
    if (counter) counter.classList.remove('modal-open');
    resetEditModal();
}

export function resetEditModal() {
    // Reset edit type selection
    document.querySelectorAll('.edit-option').forEach(option => {
        option.classList.remove('selected');
    });

    // Hide all edit sections
    const workingSection = document.getElementById('workingHoursSection');
    const cellNoteSection = document.getElementById('cellNoteSection');
    const editMessage = document.getElementById('editMessage');

    if (workingSection) workingSection.style.display = 'none';
    if (cellNoteSection) {
        cellNoteSection.style.display = 'none';
        const noteInput = document.getElementById('cellNoteInput');
        if (noteInput) noteInput.value = '';
    }
    if (editMessage) editMessage.style.display = 'none';
}

export function populateSelectionInfo() {
    const details = document.getElementById('selectionDetails');
    const selectedCells = document.querySelectorAll('.planner-cell.selected');
    
    if (details) {
        // Calculate total hours from selected cells
        const totalHours = calculateSelectedCellsTotal(selectedCells);
        
        details.innerHTML = `
            <strong>${t('edit-selection')}</strong> ${selectedCells.length} ${t('edit-cells-selected')}<br>
            <strong>${t('edit-total-hours')}</strong> ${formatPlannerHoursValue(totalHours)}h
        `;
    }
}

// Helper function to calculate total hours from selected cells
function calculateSelectedCellsTotal(selectedCells) {
    let totalHours = 0;
    
    selectedCells.forEach(cell => {
        const rawValue = cell.dataset.rawValue || (cell.textContent || cell.innerText || '').replace(/\s+/g, '').replace(/\n/g, '+');
        totalHours += extractHoursFromDay(rawValue);
    });
    
    return totalHours;
}

export function selectEditType(type) {
    // Clear previous selection
    document.querySelectorAll('.edit-option').forEach(option => {
        option.classList.remove('selected');
    });

    // Select current option
    const selectedOption = document.querySelector(`.edit-option[data-type="${type}"]`);
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }

    // Hide working hours section first
    const workingSection = document.getElementById('workingHoursSection');
    if (workingSection) workingSection.style.display = 'none';

    // Show appropriate section
    if (type === 'working') {
        showWorkingHoursSection();
    }

    // Always show notes section for any edit type
    const cellNoteSection = document.getElementById('cellNoteSection');
    if (cellNoteSection) cellNoteSection.style.display = 'block';
}

export function showWorkingHoursSection() {
    const workingSection = document.getElementById('workingHoursSection');
    const teamAllocation = document.getElementById('teamAllocation');
    
    if (!workingSection || !teamAllocation) return;
    
    // Show the section
    workingSection.style.display = 'block';
    
    // Create team input fields
    const teams = PLANNER_TEAMS;
    teamAllocation.innerHTML = teams.map(team => `
        <div class="team-input-group">
            <label for="${team.toLowerCase()}Hours">${TEAM_DISPLAY_NAMES[team] || team + ' zooplus'}</label>
            <input type="number" 
                   id="${team.toLowerCase()}Hours" 
                   class="team-input" 
                   data-team="${team}" 
                   min="0" 
                   max="12" 
                   step="0.5"
                   value="0">
        </div>
    `).join('');
    
    // Update total hours display
    updateTotalHours();
    // Add input listeners
    const teamInputs = document.querySelectorAll('.team-input');
    teamInputs.forEach(input => {
        input.addEventListener('input', updateTotalHours);
    });
}

export function updateTotalHours() {
    const teamInputs = document.querySelectorAll('.team-input');
    let totalHours = 0;
    let hasInvalidStep = false;
    
    teamInputs.forEach(input => {
        const rawValue = input.value.trim();
        if (!rawValue) return;

        const hours = parseFloat(rawValue);
        if (!Number.isFinite(hours) || !isValidPlannerHoursValue(hours)) {
            hasInvalidStep = true;
            return;
        }

        totalHours += hours;
    });
    
    const totalDisplay = document.getElementById('totalHoursDisplay');
    if (totalDisplay) {
        totalDisplay.textContent = `${t('edit-total')} ${formatPlannerHoursValue(totalHours)} ${t('edit-hours-unit')}`;

        if (hasInvalidStep) {
            totalDisplay.style.color = 'var(--error)';
            totalDisplay.textContent += ` (${t('edit-half-hour-only')})`;
            return;
        }

        // Add warning if over 12 hours
        if (totalHours > 12) {
            totalDisplay.style.color = 'var(--error)';
            totalDisplay.textContent += ` (${t('edit-over-limit')})`;
        } else {
            totalDisplay.style.color = 'var(--text-primary)';
        }
    }
}

export function showEditMessage(message, type) {
    const messageElement = document.getElementById('editMessage');
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.className = `edit-message ${type}`;
        messageElement.style.display = 'block';
    }
}

export function hideEditMessage() {
    const messageElement = document.getElementById('editMessage');
    if (messageElement) {
        messageElement.style.display = 'none';
    }
}

export function saveModalChanges() {
    const selectedOption = document.querySelector('.edit-option.selected');
    if (!selectedOption) {
        alert(t('edit-select-type'));
        return;
    }

    const type = selectedOption.dataset.type;
    let newValue = '';

    if (type === 'working') {
        const teamInputs = document.querySelectorAll('.team-input');
        let totalHours = 0;
        const allocations = [];
        let hasInvalidInput = false;
        teamInputs.forEach(input => {
            const rawValue = input.value.trim();
            if (!rawValue) return;

            const hours = parseFloat(rawValue);
            if (!Number.isFinite(hours) || !isValidPlannerHoursValue(hours) || hours < 0 || hours > 12) {
                hasInvalidInput = true;
                return;
            }

            if (hours > 0) {
                totalHours += hours;
                allocations.push(`${formatPlannerHoursValue(hours)}${input.dataset.team}`);
            }
        });

        if (hasInvalidInput) {
            alert(t('edit-half-hour-only'));
            return;
        }

        if (totalHours > 12) {
            alert(t('edit-over-12'));
            return;
        }
        newValue = allocations.join('+');
    } else {
        const values = { holiday: 'Co', sick: 'CM', dayoff: 'LB', 'legal-holiday': 'SL', maternity: 'MA', donation: 'DO', bereavement: 'DC' };
        newValue = values[type];
    }

    // Get the keys of all selected cells
    const selectedCellKeys = new Set();
    document.querySelectorAll('.planner-cell.selected').forEach(cell => {
        const cellKey = `${cell.dataset.agentId}|${cell.dataset.month}|${cell.dataset.day}`;
        selectedCellKeys.add(cellKey);
    });

    // Get the note text
    const noteInput = document.getElementById('cellNoteInput');
    const noteText = noteInput ? noteInput.value.trim() : '';

    // Call the refactored function in planner.js to handle the database update
    if (selectedCellKeys.size > 0) {
        applyChangesToSelectedCells(selectedCellKeys, newValue, noteText);
    }

    closeEditModal();
    // Clear selection after saving so counter disappears
    clearSelection();
}

// --- New User Form Logic ---

/**
 * Attaches an event listener to the "Create Agent" button.
 */
function initializeNewUserForm() {
    // Now uses the specific button ID
    const createAgentBtn = document.getElementById('createAgentBtn');
    if (createAgentBtn) {
        createAgentBtn.addEventListener('click', handleCreateAgent);
    }
}

/**
 * Handles the click event for creating a new agent.
 * Gathers form data, validates it, and calls the addAgent Firestore function.
 */
async function handleCreateAgent() {
    // Gather data from form fields using their new, reliable IDs
    const fullName = document.getElementById('newAgentFullName').value;
    const username = document.getElementById('newAgentUsername').value;
    const contractHours = document.getElementById('newAgentContractHours').value;
    const contractType = document.getElementById('newAgentContractType').value;
    const primaryTeam = document.getElementById('newAgentPrimaryTeam').value;
    const hireDate = document.getElementById('newAgentHireDate').value;

    // Basic Validation
    if (!fullName || !username || !hireDate) {
        showTemporaryMessage(t('fill-required-fields'), "error");
        return;
    }
    // No .fsp validation needed

    // Construct the new agent object
    const monthKey = getMonthKey(new Date());
    const newAgent = {
        fullName: fullName,
        username: username,
        contractHours: parseInt(contractHours) || 8,
        contractType: contractType,
        primaryTeam: primaryTeam,
        teams: [primaryTeam.split(' ')[0]], // e.g., "RO zooplus" -> "RO"
        hireDate: new Date(hireDate),
        isActive: true,
        monthlyDays: { [monthKey]: Array(31).fill('') },
        monthlyNotes: {},
    };

    // Call the Firestore function from planner.js
    await addAgent(newAgent);

    // Clear the form for the next entry
    document.getElementById('newUserForm').reset();
}

// --- Utility Functions ---

export function showTemporaryMessage(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `temporary-message ${type}`;
    messageDiv.textContent = message;
    
    // Style the message
    messageDiv.style.cssText = `
        position: fixed;
        top: 2rem;
        right: 2rem;
        padding: 1rem 2rem;
        border-radius: 8px;
        font-weight: 600;
        z-index: 2000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s ease-out;
    `;
    
    // Set colors based on type
    if (type === 'success') {
        messageDiv.style.background = 'rgba(76, 175, 80, 0.9)';
        messageDiv.style.color = 'white';
    } else if (type === 'error') {
        messageDiv.style.background = 'rgba(244, 67, 54, 0.9)';
        messageDiv.style.color = 'white';
    } else if (type === 'info') {
        messageDiv.style.background = 'rgba(33, 150, 243, 0.9)';
        messageDiv.style.color = 'white';
    }
    
    document.body.appendChild(messageDiv);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 300);
        }
    }, 3000);
}

// Add CSS animations for the temporary messages
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Event Listeners
document.addEventListener('click', function(event) {
    // Close language menu when clicking outside
    if (!event.target.closest('.language-selector')) {
        const menu = document.getElementById('languageMenu');
        const dropdown = document.querySelector('.language-dropdown');
        if (menu) menu.classList.remove('open');
        if (dropdown) dropdown.classList.remove('open');
    }
    
    // Close calendar when clicking outside
    if (!event.target.closest('.date-input-with-calendar')) {
        document.querySelectorAll('.calendar-widget').forEach(cal => {
            cal.classList.remove('active');
        });
    }
});
