// js/planner.js

// --- Firestore & Application Imports ---
import { db } from './firebase-config.js';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { showTemporaryMessage } from './ui.js';
import { updateDashboard } from './dashboard.js';
import { translations, getMonthKey } from './config.js';
import { logActivity } from './logs.js';
import { buildPlannerEditCommand } from './planner-edit-command.js';
import { buildPlannerReadModel, filterPlannerAgents } from './planner-read-model.js';
function getLang() { return localStorage.getItem('language') || 'ro'; }
function t(key) { const l = getLang(); return (translations[l] && translations[l][key]) || key; }

// --- Local State Management ---
// This will hold the live data from Firestore. It's our local, in-memory copy.
let plannerData = [];

// --- Undo Stack ---
const undoStack = [];
const MAX_UNDO = 3;
let undoConfirmedThisSession = false; // After first confirmation, skip asking

export function getPlannerData() { return plannerData; } 
// This holds the unsubscribe function for our real-time listener.
let unsubscribeFromAgents; 

// --- Core Firestore Integration ---

/**
 * [REAL-TIME] Sets up a listener to the 'agents' collection in Firestore.
 * This function is the new heart of the planner. It automatically receives updates
 * when data changes in the database and re-renders the planner.
 */
// Track which agents have already been migrated this session (to avoid redundant writes)
const migratedAgentIds = new Set();

export function initializePlanner() {
    console.log("Setting up real-time listener for agents...");
    const agentsCollection = collection(db, 'agents');

    // onSnapshot returns an 'unsubscribe' function which we can call to detach the listener
    unsubscribeFromAgents = onSnapshot(agentsCollection, (querySnapshot) => {
        console.log(`%c[Firestore] Received update. Found ${querySnapshot.size} agents.`, 'color: #4caf50; font-weight: bold;');

        // Clear the old local data
        plannerData = [];

        querySnapshot.forEach((doc) => {
            const agentData = doc.data();
            // Convert Firestore Timestamps to JS Date objects if they exist
            if (agentData.hireDate && agentData.hireDate.toDate) {
                agentData.hireDate = agentData.hireDate.toDate();
            }
            // Add the Firestore document ID to our local object. This is CRITICAL for updates/deletes.
            plannerData.push({ id: doc.id, ...agentData });
        });

        // Sort agents by name for consistent display
        plannerData.sort((a, b) => a.fullName.localeCompare(b.fullName));

        // Auto-migrate legacy data only. Opening the planner must never rewrite month data.
        migrateUnmigratedAgents();

        // Now that we have the latest data, re-render the entire UI that depends on it.
        // This ensures the UI is always in sync with the database.
        initializeMonthGrid();
        initializeTeamChips();
        renderPlannerIfActive();
        updateDashboard(plannerData); // <-- Add this call
        console.log("[Planner] UI re-rendered with fresh data.");

    }, (error) => {
        // This function is called if the listener fails
        console.error("❌ Firebase onSnapshot Error: ", error);
        showTemporaryMessage("Error connecting to the database. Data may be stale.", "error");
    });
}

/**
 * One-time migration: copies legacy flat `days`/`dayNotes` into
 * `monthlyDays[currentMonth]`/`monthlyNotes[currentMonth]` for agents
 * that haven't been migrated yet. Runs once per agent per session.
 */
async function migrateUnmigratedAgents() {
    const currentMonthKey = getMonthKey(new Date());
    const toMigrate = plannerData.filter(a =>
        !a.monthlyDays && a.days && Array.isArray(a.days) && !migratedAgentIds.has(a.id)
    );

    if (toMigrate.length === 0) return;

    console.log(`[Migration] Migrating ${toMigrate.length} agents: days → monthlyDays.${currentMonthKey}`);

    for (const agent of toMigrate) {
        migratedAgentIds.add(agent.id);
        const updateData = {
            [`monthlyDays.${currentMonthKey}`]: [...agent.days]
        };
        if (agent.dayNotes && Object.keys(agent.dayNotes).length > 0) {
            updateData[`monthlyNotes.${currentMonthKey}`] = { ...agent.dayNotes };
        }
        try {
            await updateAgent(agent.id, updateData);
        } catch (error) {
            console.error(`[Migration] Failed for ${agent.fullName}:`, error);
            migratedAgentIds.delete(agent.id); // allow retry
        }
    }
    console.log(`[Migration] Complete.`);
}

/**
 * Detaches the real-time listener when it's no longer needed (e.g., user logs out).
 * This is good practice to prevent memory leaks.
 */
export function cleanupPlanner() {
    if (unsubscribeFromAgents) {
        console.log("Detaching Firestore listener.");
        unsubscribeFromAgents();
    }
}


// --- CRUD (Create, Read, Update, Delete) Operations ---

/**
 * [CREATE] Adds a new agent document to the 'agents' collection in Firestore.
 * @param {object} agentObject - The agent data to add.
 * @returns {Promise<void>}
 */
export async function addAgent(agentObject) {
    console.log("[Firestore] Attempting to add new agent:", agentObject);
    try {
        // Convert JS Date back to Firestore Timestamp for consistency
        if(agentObject.hireDate) {
            agentObject.hireDate = Timestamp.fromDate(agentObject.hireDate);
        }
        const docRef = await addDoc(collection(db, "agents"), agentObject);
        console.log("✅ Agent added successfully with ID:", docRef.id);
        logActivity('portal', 'add_agent', { name: agentObject.fullName, team: agentObject.primaryTeam });
        showTemporaryMessage("Agent created successfully!", "success");
    } catch (error) {
        console.error("❌ Error adding agent: ", error);
        showTemporaryMessage("Failed to create agent. Check console for details.", "error");
    }
}

/**
 * [UPDATE] Updates specific fields of an agent document in Firestore.
 * @param {string} agentId - The Firestore document ID of the agent to update.
 * @param {object} updatedData - An object containing the fields to change.
 * @returns {Promise<void>}
 */
export async function updateAgent(agentId, updatedData) {
    if (!agentId) {
        console.error("❌ updateAgent failed: agentId is missing.");
        return;
    }
    console.log(`[Firestore] Attempting to update agent ${agentId} with:`, updatedData);
    const agentRef = doc(db, "agents", agentId);
    try {
        await updateDoc(agentRef, updatedData);
        console.log(`✅ Agent ${agentId} updated successfully.`);
        // Log the update (summarize what changed)
        const fields = Object.keys(updatedData).filter(k => k !== 'days').join(', ');
        const detail = fields || 'schedule updated';
        logActivity('portal', 'update_agent', `Agent ${agentId}: ${detail}`);
        // No success message here to avoid spamming on every cell change.
    } catch (error) {
        console.error(`❌ Error updating agent ${agentId}:`, error);
        showTemporaryMessage(`Failed to update agent ${agentId}.`, "error");
    }
}

/**
 * [DELETE] Deletes an agent document from Firestore.
 * @param {string} agentId - The Firestore document ID of the agent to delete.
 * @returns {Promise<void>}
 */
export async function deleteAgent(agentId) {
     if (!agentId) {
        console.error("❌ deleteAgent failed: agentId is missing.");
        return;
    }
    console.log(`[Firestore] Attempting to delete agent ${agentId}...`);
    try {
        await deleteDoc(doc(db, "agents", agentId));
        const deletedAgent = plannerData.find(a => a.id === agentId);
        console.log(`✅ Agent ${agentId} deleted successfully.`);
        logActivity('portal', 'delete_agent', { name: deletedAgent?.fullName || agentId });
        showTemporaryMessage("Agent deleted.", "success");
    } catch (error) {
        console.error(`❌ Error deleting agent ${agentId}:`, error);
        showTemporaryMessage("Failed to delete agent.", "error");
    }
}

// --- Data Modification Logic ---
/**
 * This is a critical function that takes a list of selected cells and a new value,
 * then orchestrates the update to Firestore.
 * @param {Set<string>} selectedCellKeys - A Set of keys like 'agentId|monthKey|dayIndex'.
 * @param {string} newValue - The new value for the day (e.g., '8 RO', 'SL').
 * @param {string} noteText - Optional note/reason for the change.
 */
export async function applyChangesToSelectedCells(selectedCellKeys, newValue, noteText = '') {
    const editCommand = buildPlannerEditCommand(plannerData, selectedCellKeys, newValue, noteText);
    console.log(`Applying value "${newValue}" to ${editCommand.cellCount} cells.`);

    editCommand.missingAgentIds.forEach(agentId => {
        console.error(`Could not find agent with ID ${agentId} in local data.`);
    });

    for (const update of editCommand.updates) {
        await updateAgent(update.agentId, update.updateData);
    }

    if (editCommand.snapshots.length > 0) {
        undoStack.push(editCommand.snapshots);
        if (undoStack.length > MAX_UNDO) undoStack.shift();
    }

    logActivity('portal', 'edit_cells', {
        agents: editCommand.activity.agentNames.join(', '),
        cells: editCommand.activity.cells,
        value: editCommand.activity.value
    });
    showTemporaryMessage("Changes saved to database!", "success");
}

/**
 * Undo the last planner edit by restoring the previous state from the undo stack.
 */
export async function undoLastChange() {
    if (undoStack.length === 0) {
        showTemporaryMessage(t('undo-nothing'), "info");
        return;
    }

    // Ask for confirmation on first undo only
    if (!undoConfirmedThisSession) {
        if (!confirm(t('undo-confirm'))) return;
        undoConfirmedThisSession = true;
    }

    const snapshot = undoStack.pop();
    for (const entry of snapshot) {
        await updateAgent(entry.agentId, {
            [`monthlyDays.${entry.monthKey}`]: entry.previousDays,
            [`monthlyNotes.${entry.monthKey}`]: entry.previousDayNotes
        });
    }
    logActivity('portal', 'undo', { agents: snapshot.length });
    showTemporaryMessage(t('undo-success'), "success");
}


// --- Existing Planner Logic (Refactored to use live `plannerData`) ---
// NOTE: Most of the functions below this point are the same as before, but now
// they operate on the `plannerData` array which is kept in sync by Firestore.

// --- Date Range Display Function ---
function updatePlannerHeader() {
    const dateRangeEl = document.getElementById('plannerDateRange');
    if (!dateRangeEl) return;

    const { start, end } = plannerState.dateRange;
    if (!start || !end) {
        dateRangeEl.textContent = '';
        return;
    }

    const locales = { ro: 'ro-RO', en: 'en-US', it: 'it-IT' };
    const locale = locales[getLang()] || 'ro-RO';
    const startMonth = start.toLocaleDateString(locale, { month: 'long' });
    const endMonth = end.toLocaleDateString(locale, { month: 'long' });
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    if (startMonth === endMonth && startYear === endYear) {
        dateRangeEl.textContent = `${startMonth.charAt(0).toUpperCase() + startMonth.slice(1)} ${startYear}`;
    } else {
        dateRangeEl.textContent = `${start.toLocaleDateString(locale)} - ${end.toLocaleDateString(locale)}`;
    }
}

// Enhanced Planner State
let plannerState = {
    selectedMonths: [],
    selectedTeams: ['all'],
    selectedAgents: [],
    dateRange: { start: null, end: null },
    rangeType: 'preset',
    presetRange: 'current-month',
    agentSearchTerm: '',
    viewOptions: {
        showWeekTotals: false,
        highlightWeekends: true,
        compactView: false
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initializeDatepicker();
    initializeAgentFilter();
    initializeFilterControls();
});

function initializeFilterControls() {
    const filterTypeButtons = document.querySelectorAll('.filter-type-btn');
    const searchInput = document.getElementById('agentSearchInput');

    filterTypeButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update state
            plannerState.filterType = button.dataset.filterType;

            // Update UI
            filterTypeButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Update placeholder
            if (plannerState.filterType === 'team') {
                searchInput.placeholder = t('planner-search-team');
            } else {
                searchInput.placeholder = t('planner-search-agent');
            }

            // Re-populate the list
            populateAgentFilter();
        });
    });
}

function initializeDatepicker() {
    const pickerInput = document.getElementById('dateRangePickerInput');
    if (!pickerInput) {
        console.warn("Date range picker input not found, skipping initialization.");
        return;
    }

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Set initial state
    plannerState.dateRange.start = startOfMonth;
    plannerState.dateRange.end = endOfMonth;

    const todayForHighlight = new Date();
    todayForHighlight.setHours(0, 0, 0, 0);

    const picker = new Litepicker({
        element: pickerInput,
        singleMode: false,
        allowRepick: true,
        lang: ({ ro: 'ro-RO', en: 'en-US', it: 'it-IT' })[getLang()] || 'ro-RO',
        startDate: plannerState.dateRange.start,
        endDate: plannerState.dateRange.end,
        format: 'DD MMM, YYYY',
        highlightedDays: [todayForHighlight],
        setup: (picker) => {
            picker.on('selected', (date1, date2) => {
                plannerState.dateRange.start = date1.dateInstance;
                plannerState.dateRange.end = date2.dateInstance;
                renderPlannerIfActive();
                updatePlannerHeader();
            });
        }
    });

    // Store picker reference for month navigation
    plannerState._picker = picker;

    // Prev/Next month arrow buttons
    document.getElementById('prevMonthBtn')?.addEventListener('click', () => navigateMonth(picker, -1));
    document.getElementById('nextMonthBtn')?.addEventListener('click', () => navigateMonth(picker, 1));

    // Initial render
    renderPlannerIfActive();
    updatePlannerHeader();
}

function navigateMonth(picker, offset) {
    const current = plannerState.dateRange.start || new Date();
    const newMonth = new Date(current.getFullYear(), current.getMonth() + offset, 1);
    const endOfNewMonth = new Date(newMonth.getFullYear(), newMonth.getMonth() + 1, 0);
    plannerState.dateRange.start = newMonth;
    plannerState.dateRange.end = endOfNewMonth;
    try { picker.setDateRange(newMonth, endOfNewMonth); } catch (e) { /* picker may not support setDateRange */ }
    applyFiltersAndRender();
    updatePlannerHeader();
}

function populateAgentFilter() {
    const agentList = document.getElementById('agentList');
    const searchInput = document.getElementById('agentSearchInput');
    if (!agentList) return;

    agentList.innerHTML = ''; // Clear existing items

    if (plannerState.filterType === 'team') {
        const teams = getAllTeams();
        const searchTerm = searchInput.value.toLowerCase();

        teams
            .filter(team => team.toLowerCase().includes(searchTerm))
            .forEach(team => {
                const item = document.createElement('div');
                item.className = 'agent-list-item';
                item.innerHTML = `
                    <input type="checkbox" id="team-${team}" value="${team}" ${plannerState.selectedTeams.includes(team) ? 'checked' : ''}>
                    <label for="team-${team}">${team}</label>
                `;
                agentList.appendChild(item);
            });

    } else { // 'agent'
        const searchTerm = searchInput.value.toLowerCase();
        const filteredAgents = filterPlannerAgents(plannerData, plannerState); // Get agents based on selected teams

        filteredAgents
            .filter(agent => agent.fullName.toLowerCase().includes(searchTerm))
            .forEach(agent => {
                const item = document.createElement('div');
                item.className = 'agent-list-item';
                item.innerHTML = `
                    <input type="checkbox" id="agent-${agent.id}" value="${agent.id}" ${plannerState.selectedAgents.includes(agent.id) ? 'checked' : ''}>
                    <label for="agent-${agent.id}">${agent.fullName}</label>
                `;
                agentList.appendChild(item);
            });
    }
}

function initializeAgentFilter() {
    const agentFilterButton = document.getElementById('agentFilterButton');
    const dropdown = document.getElementById('agentFilterDropdown');
    const searchInput = document.getElementById('agentSearchInput');
    const agentList = document.getElementById('agentList');

    if (!agentFilterButton || !dropdown || !searchInput || !agentList) {
        console.warn("Agent filter elements not found, skipping initialization.");
        return;
    }

    // Toggle dropdown
    agentFilterButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = dropdown.classList.toggle('visible');
        if (isVisible) {
            populateAgentFilter(); // Populate when opening
            searchInput.focus();
        }
    });

    // Stop propagation inside dropdown
    dropdown.addEventListener('click', e => e.stopPropagation());

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== agentFilterButton) {
            dropdown.classList.remove('visible');
        }
    });

    // Handle search input
    searchInput.addEventListener('input', () => {
        populateAgentFilter();
    });

    // Handle checkbox changes via event delegation
    agentList.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            const value = e.target.value;
            if (plannerState.filterType === 'team') {
                // When a team is selected, 'all' should be removed.
                if (e.target.checked) {
                    plannerState.selectedTeams = plannerState.selectedTeams.filter(t => t !== 'all');
                    plannerState.selectedTeams.push(value);
                } else {
                    plannerState.selectedTeams = plannerState.selectedTeams.filter(t => t !== value);
                    // If no teams are selected, default back to 'all'.
                    if (plannerState.selectedTeams.length === 0) {
                        plannerState.selectedTeams.push('all');
                    }
                }
            } else { // agent
                if (e.target.checked) {
                    plannerState.selectedAgents.push(value);
                } else {
                    plannerState.selectedAgents = plannerState.selectedAgents.filter(id => id !== value);
                }
            }
            renderPlannerIfActive();
        }
    });
    
    // Allow clicking on the label to toggle the checkbox
    agentList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LABEL' || e.target.tagName === 'SPAN') {
            const label = e.target.closest('label');
            if (label) {
                const checkbox = label.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    // Manually trigger change event
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
    });

    // Handle the new "Clear Selections" button
    const clearButton = document.getElementById('clearAgentFilter');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            clearAgentAndTeamSelections();
        });
    }
}

function clearAgentAndTeamSelections() {
    // Reset selected agents and teams
    plannerState.selectedAgents = [];
    plannerState.selectedTeams = ['all']; // Default to 'all'

    // Clear any active search term
    const searchInput = document.getElementById('agentSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }

    // Uncheck all checkboxes in the dropdown
    const dropdown = document.getElementById('agentFilterDropdown');
    if (dropdown) {
        const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
    }
    
    // Repopulate the filter to reflect the cleared state
    populateAgentFilter();
    
    // Re-render the planner
    renderPlannerIfActive();

    // Optionally, update the main team chips display
    updateTeamDisplay();
}

// Selection state for cell editing
const selectionState = {
    selectedCells: new Set(),
    selectionStarted: false,
    currentEditType: null,
    bulkEditMode: false
};

// Month Grid Management
function initializeMonthGrid() {
    const monthGrid = document.getElementById('monthGrid');
    if (!monthGrid) return;
    
    const currentDate = new Date();
    const months = [];
    
    // Generate 24 months (12 past + current + 11 future)
    for (let i = -12; i <= 11; i++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
        months.push({
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            name: date.toLocaleDateString(({ ro: 'ro-RO', en: 'en-US', it: 'it-IT' })[getLang()] || 'ro-RO', { month: 'short' }),
            fullName: date.toLocaleDateString(({ ro: 'ro-RO', en: 'en-US', it: 'it-IT' })[getLang()] || 'ro-RO', { month: 'long', year: 'numeric' }),
            key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        });
    }

    monthGrid.innerHTML = months.map(month => `
        <div class="month-card" data-month="${month.key}">
            <div class="month-name">${month.name}</div>
            <div class="month-year">${month.year}</div>
        </div>
    `).join('');
    
    // Add event listeners to month cards
    monthGrid.querySelectorAll('.month-card').forEach(card => {
        card.addEventListener('click', () => toggleMonth(card.dataset.month));
    });
}

export function toggleMonth(monthKey) {
    const index = plannerState.selectedMonths.indexOf(monthKey);
    if (index > -1) {
        plannerState.selectedMonths.splice(index, 1);
    } else {
        plannerState.selectedMonths.push(monthKey);
    }
    updateMonthDisplay();
}

export function selectAllMonths() {
    const monthCards = document.querySelectorAll('.month-card');
    plannerState.selectedMonths = Array.from(monthCards).map(card => card.dataset.month);
    updateMonthDisplay();
}

export function clearMonthSelection() {
    plannerState.selectedMonths = [];
    updateMonthDisplay();
}

function updateMonthDisplay() {
    const monthCards = document.querySelectorAll('.month-card');
    monthCards.forEach(card => {
        const isSelected = plannerState.selectedMonths.includes(card.dataset.month);
        card.classList.toggle('selected', isSelected);
    });
}

function initializeTeamChips() {
    const teamChips = document.getElementById('teamChips');
    if (!teamChips) return;
    
    const allTeams = getAllTeams();
    const teamsHtml = [
        '<div class="team-chip active" data-team="all">Toate Echipele</div>',
        ...allTeams.map(team => `<div class="team-chip" data-team="${team}">${team} zooplus</div>`)
    ].join('');
    
    teamChips.innerHTML = teamsHtml;
    
    // Add event listeners
    teamChips.querySelectorAll('.team-chip').forEach(chip => {
        chip.addEventListener('click', () => toggleTeam(chip.dataset.team));
    });
}

export function toggleTeam(teamId) {
    if (teamId === 'all') {
        plannerState.selectedTeams = ['all'];
    } else {
        // Remove 'all' if it exists
        if (plannerState.selectedTeams.includes('all')) {
            plannerState.selectedTeams = [];
        }
        
        // Toggle this team
        const index = plannerState.selectedTeams.indexOf(teamId);
        if (index > -1) {
            plannerState.selectedTeams.splice(index, 1);
        } else {
            plannerState.selectedTeams.push(teamId);
        }
        
        // If no teams selected, default to 'all'
        if (plannerState.selectedTeams.length === 0) {
            plannerState.selectedTeams = ['all'];
        }
    }
    
    updateTeamDisplay();
    applyFiltersAndRender(); // Re-render automatically
}

function updateTeamDisplay() {
    const teamChips = document.querySelectorAll('.team-chip');
    teamChips.forEach(chip => {
        const isSelected = plannerState.selectedTeams.includes(chip.dataset.team);
        chip.classList.toggle('active', isSelected);
    });
}

export function setRangeType(type) {
    plannerState.rangeType = type;
    const applyBtn = document.getElementById('applyMultiMonthBtn');
    
    // Update tab display
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.range === type);
    });
    
    // Show/hide appropriate containers
    document.getElementById('presetRangeContainer').style.display = type === 'preset' ? 'block' : 'none';
    document.getElementById('customRangeContainer').style.display = type === 'custom' ? 'flex' : 'none';
    document.getElementById('multiMonthContainer').style.display = type === 'multi-month' ? 'block' : 'none';
    
    if (type === 'multi-month') {
        applyBtn.style.display = 'block'; // Show button for multi-month view
    } else {
        applyBtn.style.display = 'none'; // Hide for other views
    }

    // Immediately render if switching away from multi-month
    if (type !== 'multi-month') {
        applyFiltersAndRender();
    }
}

export function applyPresetRange() {
    const presetSelect = document.getElementById('presetRange');
    if (!presetSelect) return;
    
    plannerState.presetRange = presetSelect.value;
    const currentDate = new Date();
    
    // Calculate date range based on preset
    switch (presetSelect.value) {
        case 'current-month':
            plannerState.dateRange.start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            plannerState.dateRange.end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            break;
        case 'next-month':
            plannerState.dateRange.start = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            plannerState.dateRange.end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
            break;
        case 'today':
            plannerState.dateRange.start = new Date(currentDate);
            plannerState.dateRange.end = new Date(currentDate);
            break;
        case 'tomorrow':
            const tomorrow = new Date(currentDate);
            tomorrow.setDate(tomorrow.getDate() + 1);
            plannerState.dateRange.start = tomorrow;
            plannerState.dateRange.end = tomorrow;
            break;
        // Add more cases as needed
    }
    
    applyFiltersAndRender(); // Use the new reactive function
}

function initializeAgentSearch() {
    const agentSearch = document.getElementById('agentSearch');
    if (!agentSearch) return;
    
    agentSearch.addEventListener('input', filterAgents);
    agentSearch.addEventListener('focus', showAgentSuggestions);
    agentSearch.addEventListener('blur', hideAgentSuggestions);
}

export function filterAgents() {
    // This function is now called by the reactive system
    // The actual filtering logic is handled by the Planner Read Model.
    // No need to call renderPlannerTable directly since it's handled by the reactive system
}

export function showAgentSuggestions() {
    // Show agent suggestions dropdown
}

export function hideAgentSuggestions() {
    // Hide agent suggestions dropdown
}

function getAllTeams() {
    const teams = new Set();
    // Operates on the live plannerData
    plannerData.forEach(agent => {
        if (agent.teams && Array.isArray(agent.teams)) {
            agent.teams.forEach(team => teams.add(team));
        }
    });
    return Array.from(teams).sort();
}

function getMonthStartFromKey(monthKey) {
    const [yearStr, monthStr] = String(monthKey || '').split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (!year || !month) return null;
    return new Date(year, month - 1, 1);
}

function formatMonthLabel(monthKey) {
    const monthStart = getMonthStartFromKey(monthKey);
    if (!monthStart) return monthKey;

    const locales = { ro: 'ro-RO', en: 'en-US', it: 'it-IT' };
    const locale = locales[getLang()] || 'ro-RO';
    return monthStart.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

async function clearAgentPlannerMonth(agentId, monthKey) {
    if (!agentId || !monthKey) return;

    const emptyDays = Array(31).fill('');
    await updateAgent(agentId, {
        [`monthlyDays.${monthKey}`]: emptyDays,
        [`monthlyNotes.${monthKey}`]: {}
    });

    const agent = plannerData.find(entry => entry.id === agentId);
    logActivity('portal', 'clear_agent_month', {
        name: agent?.fullName || agentId,
        month: monthKey
    });
    showTemporaryMessage(`Planner data cleared for ${formatMonthLabel(monthKey)}.`, "success");
}

// Table Rendering (now renders live data)
export function renderPlannerTable(container, startDate, endDate) {
    // Use passed-in dates or fallback to state
    let start = startDate;
    let end = endDate;
    
    if (!start || !end) {
        const { start: stateStart, end: stateEnd } = plannerState.dateRange;
        start = stateStart;
        end = stateEnd;
        
        // Fallback to current month if no range is set
        if (!start || !end) {
            const now = new Date();
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }
    }

    // Get the table container - use the enhanced table container by default
    const tableContainer = container || document.querySelector('#planner .table-container.enhanced-table');
    if (!tableContainer) {
        // This is expected if the planner section is not active.
        return;
    }

    const readModel = buildPlannerReadModel(plannerData, start, end, {
        filterState: plannerState,
        viewOptions: plannerState.viewOptions,
        dayNames: t('planner-day-names').split(','),
        today: new Date(),
        unknownAgentLabel: t('unknown-agent')
    });

    tableContainer.classList.toggle('few-days-view', readModel.fewDaysView);

    // Call the function to update the header with the date range
    updatePlannerHeader(); 

    // Clear previous content
    tableContainer.innerHTML = '';

    // Create table structure
    const table = document.createElement('table');
    table.className = 'unified-planner-table'; // Use the new class for sticky styles

    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    tbody.id = 'plannerTableBody'; // Keep ID for event delegation

    const dateHeaderRow = document.createElement('tr');
    dateHeaderRow.className = 'date-header-row';
    dateHeaderRow.appendChild(createTextHeader('agent-name-header', t('planner-agent')));
    dateHeaderRow.appendChild(createTextHeader('hours-header', t('planner-hours')));
    readModel.headers.forEach(header => {
        dateHeaderRow.appendChild(renderPlannerHeader(header));
    });
    dateHeaderRow.appendChild(createTextHeader('total-header', t('planner-total')));
    thead.appendChild(dateHeaderRow);

    readModel.rows.forEach(rowModel => {
        tbody.appendChild(renderAgentRow(rowModel));
    });

    // Assemble table
    table.appendChild(thead);
    table.appendChild(tbody);
    tableContainer.appendChild(table);

    // Re-attach event listeners after every render
    addCellEventListeners();
}

function createTextHeader(className, text) {
    const header = document.createElement('th');
    header.className = className;
    header.textContent = text;
    return header;
}

function renderPlannerHeader(headerModel) {
    const header = document.createElement('th');
    header.className = headerModel.classNames.join(' ');

    if (headerModel.type === 'week-total') {
        header.textContent = t('planner-week-total');
        return header;
    }

    header.appendChild(document.createTextNode(headerModel.dayName));
    header.appendChild(document.createElement('br'));
    header.appendChild(document.createTextNode(headerModel.dayNumber));
    return header;
}

function renderAgentRow(rowModel) {
    const row = document.createElement('tr');
    row.className = 'agent-row';

    // Agent name cell
    const nameCell = document.createElement('td');
    nameCell.className = 'agent-name';
    nameCell.title = rowModel.agentName; // Add tooltip
    nameCell.innerHTML = `
        <div class="cell-content-wrapper">
            <span>${rowModel.agentName}</span>
            <button class="delete-agent-btn" data-agent-id="${rowModel.agentId}" data-month-key="${rowModel.deleteMonthKey}" title="${t('delete')}">
                <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
        </div>
    `;

    // Hours cell
    const hoursCell = document.createElement('td');
    hoursCell.className = 'agent-hours';
    hoursCell.textContent = rowModel.contractHoursLabel;

    row.appendChild(nameCell);
    row.appendChild(hoursCell);
    rowModel.cells.forEach(cellModel => {
        row.appendChild(renderPlannerCell(cellModel));
    });

    // Total cell
    const totalCell = document.createElement('td');
    totalCell.className = 'agent-total';
    totalCell.textContent = rowModel.totalHoursLabel;
    row.appendChild(totalCell);

    return row;
}

function renderPlannerCell(cellModel) {
    if (cellModel.type === 'week-total') {
        const weeklyCell = document.createElement('td');
        weeklyCell.className = cellModel.classNames.join(' ');
        weeklyCell.textContent = cellModel.totalHoursLabel;
        return weeklyCell;
    }

    const cell = document.createElement('td');
    cell.className = 'planner-cell selectable';
    cell.dataset.agentId = cellModel.agentId;
    cell.dataset.day = cellModel.dayIndex;
    cell.dataset.month = cellModel.monthKey;
    cell.dataset.rawValue = cellModel.rawValue;
    cell.classList.add(...cellModel.classNames);

    appendPlannerCellText(cell, cellModel.displayLines);
    applyPlannerCellPresentation(cell, cellModel.sizeClass);

    if (cellModel.title) {
        cell.classList.add('has-note');
        cell.title = cellModel.title;
    }

    return cell;
}

function appendPlannerCellText(cell, displayLines) {
    cell.replaceChildren();
    displayLines.forEach((line, index) => {
        if (index > 0) {
            cell.appendChild(document.createElement('br'));
        }
        cell.appendChild(document.createTextNode(line));
    });
}

function applyPlannerCellPresentation(cell, sizeClass) {
    if (sizeClass) {
        cell.classList.add(sizeClass);
    }

    // FORCE CENTERING: keep Planner Cell contents aligned after read-model rendering.
    cell.style.textAlign = 'center';
    cell.style.verticalAlign = 'middle';
    cell.style.fontVariantNumeric = 'tabular-nums';
    cell.style.fontFeatureSettings = '"tnum" 1, "kern" 1';
    cell.style.letterSpacing = '0';
    cell.style.wordSpacing = '0';
    cell.style.textAlignLast = 'center';
}

// Cell Selection Logic (Refactored to use Firestore Document ID)
function addCellEventListeners() {
    const cells = document.querySelectorAll('.planner-cell.selectable');
    cells.forEach(cell => {
        // Remove old listeners to prevent duplicates
        cell.removeEventListener('mousedown', handleCellMouseDown);
        cell.addEventListener('mousedown', handleCellMouseDown);
        cell.removeEventListener('mouseover', handleCellMouseOver);
        cell.addEventListener('mouseover', handleCellMouseOver);
        cell.removeEventListener('mouseup', handleCellMouseUp);
        cell.addEventListener('mouseup', handleCellMouseUp);
        
        // Add right-click listener to clear selection
        cell.removeEventListener('contextmenu', handleCellRightClick);
        cell.addEventListener('contextmenu', handleCellRightClick);
    });
    
    // Add global mouse up listener
    document.removeEventListener('mouseup', handleDocumentMouseUp);
    document.addEventListener('mouseup', handleDocumentMouseUp);
    
    // Add scoped listener to the table body (works with new unified table structure)
    const plannerBody = document.getElementById('plannerTableBody');
    if (plannerBody) {
        // Remove any old listener to prevent duplicates
        plannerBody.removeEventListener('contextmenu', handleScopedRightClick);
        // Add the new scoped listener
        plannerBody.addEventListener('contextmenu', handleScopedRightClick);
        
        // Add delete button event listener (using event delegation)
        plannerBody.removeEventListener('click', handleDeleteButtonClick);
        plannerBody.addEventListener('click', handleDeleteButtonClick);
    }
}

function handleCellMouseDown(e) {
    const cell = e.currentTarget;
    const cellKey = `${cell.dataset.agentId}|${cell.dataset.month}|${cell.dataset.day}`;
    
    selectionState.selectionStarted = true;
    
    if (selectionState.selectedCells.has(cellKey)) {
        selectionState.selectedCells.delete(cellKey);
        cell.classList.remove('selected');
    } else {
        selectionState.selectedCells.add(cellKey);
        cell.classList.add('selected');
    }
    
    updateSelectionCounter();
    e.preventDefault();
}

function handleCellMouseOver(e) {
    if (!selectionState.selectionStarted) return;

    const cell = e.currentTarget;
    const cellKey = `${cell.dataset.agentId}|${cell.dataset.month}|${cell.dataset.day}`;
    
    if (!selectionState.selectedCells.has(cellKey)) {
        selectionState.selectedCells.add(cellKey);
        cell.classList.add('selected');
        updateSelectionCounter();
    }
}

function handleCellMouseUp() {
    selectionState.selectionStarted = false;
}

function handleDocumentMouseUp() {
    selectionState.selectionStarted = false;
}

function handleCellRightClick(e) {
    e.preventDefault(); // Prevent default context menu
    clearSelection();
}

function handleScopedRightClick(e) {
    // Check if the click happened on a selectable cell
    if (e.target.closest('.planner-cell.selectable')) {
        e.preventDefault(); // Prevent context menu ONLY on the grid
        clearSelection();
    }
    // If not on a cell, the event proceeds as normal, showing the native context menu.
}

function handleDeleteButtonClick(e) {
    const deleteBtn = e.target.closest('.delete-agent-btn');
    if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const agentId = deleteBtn.dataset.agentId;
        const monthKey = deleteBtn.dataset.monthKey;

        if (!agentId) {
            console.error('No agent ID found on delete button');
            return;
        }

        if (!monthKey) {
            showTemporaryMessage("Open a single-month planner view to remove this month's data safely.", "info");
            return;
        }

        const agent = plannerData.find(entry => entry.id === agentId);
        const agentName = agent?.fullName || t('unknown-agent');
        const monthLabel = formatMonthLabel(monthKey);
        const confirmMessage = `Remove ${agentName} from ${monthLabel} only?\n\nThis clears planner data for that month and keeps previous months unchanged.`;

        if (confirm(confirmMessage)) {
            clearAgentPlannerMonth(agentId, monthKey);
        }
    }
}

export function clearSelection() {
    selectionState.selectedCells.clear();
    document.querySelectorAll('.planner-cell.selected').forEach(cell => {
        cell.classList.remove('selected');
    });
    updateSelectionCounter();
}

function updateSelectionCounter() {
    const counter = document.getElementById('selectionCounter');
    const countElement = document.getElementById('selectionCount');

    if (!counter || !countElement) return;

    if (selectionState.selectedCells.size > 0) {
        counter.classList.add('visible'); // FIX: Use a class to show the element
        countElement.textContent = `${selectionState.selectedCells.size} ${t('edit-cells-selected')}`;
    } else {
        counter.classList.remove('visible'); // FIX: Use a class to hide the element
    }
}

// Other utility functions
export function toggleCompactView() {
    const compactViewCheckbox = document.getElementById('compactView');
    plannerState.viewOptions.compactView = compactViewCheckbox.checked;
    document.body.classList.toggle('compact-view', plannerState.viewOptions.compactView);
    applyFiltersAndRender(); // Re-render automatically
}

export function resetFilters() {
    plannerState.selectedTeams = ['all'];
    plannerState.selectedAgents = [];
    plannerState.agentSearchTerm = '';
    
    // Clear the search input if it exists
    const agentSearchInput = document.getElementById('agentSearch');
    if (agentSearchInput) {
        agentSearchInput.value = '';
    }
    
    // CRITICAL: Clear the selection state and UI
    clearSelection();
    
    updateTeamDisplay();
    
    // Re-initialize to default state
    const presetSelect = document.getElementById('presetRange');
    if (presetSelect) {
        presetSelect.value = 'current-month';
    }
    applyPresetRange(); // This will trigger a re-render
}

export function applyFiltersAndRender() {
    console.log("Applying filters and re-rendering...");
    
    // PREVENT GHOST SELECTIONS: Clear state before redrawing
    clearSelection();
    
    // Get the main container where the table(s) will be rendered
    const plannerContainer = document.querySelector('#planner .table-container.enhanced-table');
    if (!plannerContainer) {
        console.log("Planner container not found, likely because the planner tab is not active. Skipping render.");
        return;
    }

    if (plannerState.rangeType === 'multi-month') {
        // Clear previous content
        plannerContainer.innerHTML = '';
        
        if (plannerState.selectedMonths.length === 0) {
            plannerContainer.innerHTML = `<div class="placeholder">${t('planner-select-months')}</div>`;
            return;
        }

        // Sort months chronologically
        plannerState.selectedMonths.sort();

        // Render one table for each selected month
        plannerState.selectedMonths.forEach(monthKey => {
            const [year, month] = monthKey.split('-').map(Number);
            const startOfMonth = new Date(year, month - 1, 1);
            const endOfMonth = new Date(year, month, 0);
            
            // Add a title for each table
            const monthTitle = document.createElement('h3');
            const locales = { ro: 'ro-RO', en: 'en-US', it: 'it-IT' };
            const locale = locales[getLang()] || 'ro-RO';
            monthTitle.textContent = startOfMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
            monthTitle.style.cssText = 'padding: 1.5rem 1rem 0.5rem 1rem; margin: 0; color: var(--text-primary);';
            plannerContainer.appendChild(monthTitle);
            
            // Render the table for this specific month
            renderPlannerTable(plannerContainer, startOfMonth, endOfMonth);
        });

    } else {
        // For 'preset' and 'custom' ranges, use the unified table structure
        const { start, end } = plannerState.dateRange;
        if (!start || !end) {
            plannerContainer.innerHTML = `<div class="placeholder">${t('planner-invalid-range')}</div>`;
            return;
        }
        
        // Use the new unified table rendering
        renderPlannerTable(plannerContainer, start, end);
    }
}

export function setAgentSearchTerm(term) {
    plannerState.agentSearchTerm = term;
}

export function setViewOption(option, value) {
    plannerState.viewOptions[option] = value;
}

export function renderPlannerIfActive() {
    // Check if planner section is active before rendering
    const plannerSection = document.getElementById('planner');
    if (plannerSection && plannerSection.classList.contains('active')) {
        renderPlannerTable();
    }
}

export function exportToCSV() {
    console.log('Exporting to CSV...');
    showTemporaryMessage("CSV export functionality coming soon!", "info");
} 
