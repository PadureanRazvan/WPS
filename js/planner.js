// js/planner.js

// --- Firestore & Application Imports ---
import { db } from './firebase-config.js';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { showTemporaryMessage } from './ui.js';
import { updateDashboard } from './dashboard.js';

// --- Local State Management ---
// This will hold the live data from Firestore. It's our local, in-memory copy.
let plannerData = []; 
// This holds the unsubscribe function for our real-time listener.
let unsubscribeFromAgents; 

// --- Core Firestore Integration ---

/**
 * [REAL-TIME] Sets up a listener to the 'agents' collection in Firestore.
 * This function is the new heart of the planner. It automatically receives updates
 * when data changes in the database and re-renders the planner.
 */
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
    // A simple confirmation dialog. In a real app, use a custom modal.
    if (!confirm(`Are you sure you want to delete agent ${agentId}? This action cannot be undone.`)) {
        return;
    }
    console.log(`[Firestore] Attempting to delete agent ${agentId}...`);
    try {
        await deleteDoc(doc(db, "agents", agentId));
        console.log(`✅ Agent ${agentId} deleted successfully.`);
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
 * @param {Set<string>} selectedCellKeys - A Set of keys like 'agentId-dayIndex'.
 * @param {string} newValue - The new value for the day (e.g., '8 RO', 'SL').
 */
export async function applyChangesToSelectedCells(selectedCellKeys, newValue) {
    console.log(`Applying value "${newValue}" to ${selectedCellKeys.size} cells.`);
    const updates = new Map(); // Use a Map to group changes by agentId

    // 1. Group all changes by agent ID
    selectedCellKeys.forEach(key => {
        const [agentId, dayIndexStr] = key.split('-');
        const dayIndex = parseInt(dayIndexStr, 10);

        if (!updates.has(agentId)) {
            updates.set(agentId, []);
        }
        updates.get(agentId).push({ dayIndex, newValue });
    });

    // 2. For each agent, apply the changes and update Firestore
    for (const [agentId, changes] of updates.entries()) {
        // Find the full agent object from our local data store
        const agent = plannerData.find(a => a.id === agentId);
        if (!agent) {
            console.error(`Could not find agent with ID ${agentId} in local data.`);
            continue;
        }

        // Create a mutable copy of the agent's days array
        const newDays = [...agent.days];
        changes.forEach(({ dayIndex, newValue }) => {
            if (dayIndex >= 0 && dayIndex < newDays.length) {
                newDays[dayIndex] = newValue;
            }
        });

        // 3. Call the updateAgent function to save the modified 'days' field to Firestore
        await updateAgent(agentId, { days: newDays });
    }
    
    showTemporaryMessage("Changes saved to database!", "success");
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
        dateRangeEl.textContent = 'Selectați o perioadă';
        return;
    }

    const startMonth = start.toLocaleDateString('ro-RO', { month: 'long' });
    const endMonth = end.toLocaleDateString('ro-RO', { month: 'long' });
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    if (startMonth === endMonth && startYear === endYear) {
        dateRangeEl.textContent = `${startMonth.charAt(0).toUpperCase() + startMonth.slice(1)} ${startYear}`;
    } else {
        dateRangeEl.textContent = `${start.toLocaleDateString('ro-RO')} - ${end.toLocaleDateString('ro-RO')}`;
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
                searchInput.placeholder = 'Caută echipă...';
            } else {
                searchInput.placeholder = 'Caută agent...';
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
        lang: 'ro-RO',
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

    // Initial render
    renderPlannerIfActive();
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
        const filteredAgents = getFilteredAgents(); // Get agents based on selected teams

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
            name: date.toLocaleDateString('ro-RO', { month: 'short' }),
            fullName: date.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' }),
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
    // The actual filtering logic is handled in getFilteredAgents()
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

function getFilteredAgents() {
    // This function is now always using the most up-to-date data from Firestore
    let filteredAgents = [...plannerData]; // Use a copy

    // Agent selections take precedence over team selections.
    if (plannerState.selectedAgents.length > 0) {
        filteredAgents = filteredAgents.filter(agent => 
            plannerState.selectedAgents.includes(agent.id)
        );
    } 
    // If no agents are selected, use the team filter.
    else if (plannerState.selectedTeams.length > 0 && !plannerState.selectedTeams.includes('all')) {
        filteredAgents = filteredAgents.filter(agent => 
            agent.teams && agent.teams.some(team => plannerState.selectedTeams.includes(team))
        );
    }

    // Apply agent search filter ONLY when the filter type is 'agent'
    if (plannerState.filterType === 'agent') {
        const searchTerm = plannerState.agentSearchTerm?.toLowerCase();
        if (searchTerm) {
            filteredAgents = filteredAgents.filter(agent =>
                (agent.fullName && agent.fullName.toLowerCase().includes(searchTerm)) ||
                (agent.username && agent.username.toLowerCase().includes(searchTerm))
            );
        }
    }

    return filteredAgents;
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

    const days = [];
    for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
        days.push(new Date(dt));
    }

    // Get the table container - use the enhanced table container by default
    const tableContainer = container || document.querySelector('#planner .table-container.enhanced-table');
    if (!tableContainer) {
        // This is expected if the planner section is not active.
        return;
    }

    // FIX: Add a class for custom styling when few days are shown
    if (days.length > 0 && days.length < 10) {
        tableContainer.classList.add('few-days-view');
    } else {
        tableContainer.classList.remove('few-days-view');
    }

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

    // Render date header row (full dates)
    const dateHeaderRow = document.createElement('tr');
    dateHeaderRow.className = 'date-header-row';
    dateHeaderRow.innerHTML = `
        <th class="agent-name-header" rowspan="2">Agent</th>
        <th class="hours-header" rowspan="2">Ore</th>
        ${days.map((date, index) => {
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const weekendClass = plannerState.viewOptions.highlightWeekends && isWeekend ? 'weekend' : '';
            const today = new Date();
            const isToday = date.getDate() === today.getDate() &&
                           date.getMonth() === today.getMonth() &&
                           date.getFullYear() === today.getFullYear();
            const todayClass = isToday ? 'today' : '';

            // Format date as "MAR 25 MAI" (day name + date + month)
            const dayNames = ['DUM', 'LUN', 'MAR', 'MIE', 'JOI', 'VIN', 'SÂM'];
            const monthNames = ['IAN', 'FEB', 'MAR', 'APR', 'MAI', 'IUN', 'IUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const dayName = dayNames[dayOfWeek];
            const dayNum = date.getDate();
            const monthName = monthNames[date.getMonth()];
            const fullDate = `${dayName}<br/>${dayNum} ${monthName}`;
            
            // Weekly total column logic
            let extraColumn = '';
            if (plannerState.viewOptions.showWeekTotals && dayOfWeek === 0) { // After every Sunday
                extraColumn = `<th class="week-total-header date-header" rowspan="2">Total Săpt.</th>`;
            }
            return `<th class="date-header ${weekendClass} ${todayClass}">${fullDate}</th>${extraColumn}`;
        }).join('')}
        <th class="total-header" rowspan="2">Total</th>
    `;
    
    // Render day number header row (simplified)
    const dayHeaderRow = document.createElement('tr');
    dayHeaderRow.className = 'day-header-row';
    dayHeaderRow.innerHTML = `
        ${days.map((date, index) => {
            const dayNum = date.getDate();
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const weekendClass = plannerState.viewOptions.highlightWeekends && isWeekend ? 'weekend' : '';
            const today = new Date();
            const isToday = date.getDate() === today.getDate() &&
                           date.getMonth() === today.getMonth() &&
                           date.getFullYear() === today.getFullYear();
            const todayClass = isToday ? 'today' : '';

            // Weekly total column logic - skip for this row as it's handled by rowspan
            let extraColumn = '';
            if (plannerState.viewOptions.showWeekTotals && dayOfWeek === 0) { // After every Sunday
                extraColumn = ''; // Already handled by rowspan in date header
            }
            return `<th class="day-number-header ${weekendClass} ${todayClass}">${dayNum}</th>${extraColumn}`;
        }).join('')}
    `;
    
    thead.appendChild(dateHeaderRow);
    thead.appendChild(dayHeaderRow);

    // Render body
    const filteredAgents = getFilteredAgents();
    filteredAgents.forEach((agent) => {
        // Pass the array of dates to renderAgentRow
        const row = renderAgentRow(agent, days);
        tbody.appendChild(row);
    });

    // Assemble table
    table.appendChild(thead);
    table.appendChild(tbody);
    tableContainer.appendChild(table);

    // Re-attach event listeners after every render
    addCellEventListeners();
}

function renderAgentRow(agent, dates) {
    const row = document.createElement('tr');
    row.className = 'agent-row';

    // Agent name cell
    const nameCell = document.createElement('td');
    nameCell.className = 'agent-name';
    nameCell.title = agent.fullName || agent.name || 'Unknown Agent'; // Add tooltip
    nameCell.innerHTML = `
        <span>${agent.fullName || agent.name || 'Unknown Agent'}</span>
        <button class="delete-agent-btn" data-agent-id="${agent.id}" title="Delete Agent">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
    `;

    // Hours cell
    const hoursCell = document.createElement('td');
    hoursCell.className = 'agent-hours';
    hoursCell.textContent = agent.contractHours ? `${agent.contractHours}h` : '8h';

    // Day cells with weekly totals support
    const dayCells = [];
    let weeklyHours = 0;
    
    dates.forEach(date => {
        const dayIndex = date.getDate() - 1; // agent.days is 0-indexed (0 for 1st, 1 for 2nd)

        const cell = document.createElement('td');
        cell.className = 'planner-cell selectable';
        cell.dataset.agentId = agent.id; // Use Firestore document ID
        cell.dataset.day = dayIndex;

        // This assumes agent.days stores data for the month of the current date
        // This is a design limitation but we'll work with it for now.
        const dayValue = agent.days && agent.days[dayIndex] ? agent.days[dayIndex] : '';
        const formattedContent = formatCellContent(dayValue);
        
        // FORCE CENTERING: Add inline styles to ensure proper centering
        cell.style.textAlign = 'center';
        cell.style.verticalAlign = 'middle';
        cell.style.fontVariantNumeric = 'tabular-nums';
        cell.style.fontFeatureSettings = '"tnum" 1, "kern" 1';
        cell.style.letterSpacing = '0';
        cell.style.wordSpacing = '0';
        cell.style.textAlignLast = 'center';
        
        // Set cell content using innerHTML to properly handle newlines
        cell.innerHTML = formattedContent.replace(/\n/g, '<br>');
        
        // Apply dynamic font sizing to ensure content fits properly
        applyDynamicFontSizing(cell, formattedContent);
        
        // Check if it's a multi-team day (contains + symbol or newline)
        if (formattedContent.includes('+') || formattedContent.includes('\n')) {
            cell.classList.add('multi-team');
        }
        
        cell.classList.add(...getCellClass(dayValue, date));

        // Add today class if this is the current day
        const today = new Date();
        const isToday = date.getDate() === today.getDate() && 
                       date.getMonth() === today.getMonth() && 
                       date.getFullYear() === today.getFullYear();
        
        if (isToday) {
            cell.classList.add('today');
        }

        // Add to cells array
        dayCells.push(cell);
        
        // Track weekly hours for weekly totals
        if (plannerState.viewOptions.showWeekTotals) {
            const hoursMatch = dayValue.match(/\d+/g);
            if (hoursMatch) {
                weeklyHours += hoursMatch.reduce((sum, h) => sum + parseInt(h, 10), 0);
            }
            
            // Add weekly total cell after Sunday
            if (date.getDay() === 0) {
                const weeklyCell = document.createElement('td');
                weeklyCell.className = 'week-total-cell';
                weeklyCell.textContent = `${weeklyHours}h`;
                dayCells.push(weeklyCell);
                weeklyHours = 0; // Reset for the next week
            }
        }
    });

    // Total cell
    const totalCell = document.createElement('td');
    totalCell.className = 'agent-total';
    totalCell.textContent = calculateAgentTotalHours(agent);

    // Append all cells
    row.appendChild(nameCell);
    row.appendChild(hoursCell);
    dayCells.forEach(cell => row.appendChild(cell));
    row.appendChild(totalCell);

    return row;
}

function getCellClass(day, date) { // <-- Changed to accept 'date' object
    const classes = ['day-cell'];

    if (!day || day.trim() === '') {
        classes.push('empty');
    } else if (day === 'SL') {
        classes.push('sick-leave');
    } else if (day === 'Co') {
        classes.push('holiday');
    } else if (day === 'CM') {
        classes.push('medical-leave');
    } else if (day === 'LB') {
        classes.push('day-off');
    } else if (day.match(/\d+\s*(RO|HU|IT|NL|DE|BRO|BDE)/i)) {
        classes.push('working');
        // Check if it's a multi-team day (contains + or multiple teams)
        if (day.includes('+') || day.match(/(\d+\s*(RO|HU|IT|NL|DE|BRO|BDE).*){2,}/i)) {
            classes.push('multi-team');
        }
    }

    // Add weekend class using the passed date object
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        classes.push('weekend');
    }

    return classes;
}

function formatCellContent(day) {
    if (!day || day.trim() === '') return '';
    
    // Handle special cases
    if (['SL', 'Co', 'CM', 'LB'].includes(day)) {
        return day;
    }
    
    // Handle multiple teams - use newlines for better formatting
    if (day.includes('+')) {
        const parts = day.split('+');
        const cleanedParts = parts.map(part => part.trim().replace(/\s+/g, ''));
        
        // Define valid team codes (including BRO and BDE)
        const validTeamCodes = ['RO', 'HU', 'IT', 'NL', 'DE', 'BRO', 'BDE'];
        const teamPattern = validTeamCodes.join('|');
        
        // Check if all parts are valid team allocations (any number + team code)
        const allAreValidTeams = cleanedParts.every(part => {
            const pattern = new RegExp(`^\\d+(${teamPattern})$`);
            return pattern.test(part);
        });
        
        // If all parts are valid team allocations, use newlines for better formatting
        if (allAreValidTeams) {
            return cleanedParts.join('\n');
        }
        
        // For mixed or invalid allocations, keep the + symbol
        return cleanedParts.join('+');
    }
    
    // For single team entries, just clean up spaces
    return day.trim().replace(/\s+/g, '');
}

// Dynamic font sizing function to ensure content fits properly in cells
function applyDynamicFontSizing(cell, content) {
    if (!content || content.trim() === '') return;
    
    // Remove any existing sizing classes
    cell.classList.remove('tiny-text', 'small-text', 'medium-text', 'super-tiny');
    
    // Check if content has newlines (multi-line)
    const hasNewlines = content.includes('\n');
    const lineCount = hasNewlines ? content.split('\n').length : 1;
    const maxLineLength = hasNewlines ? 
        Math.max(...content.split('\n').map(line => line.length)) : 
        content.length;
    
    // Conservative approach - use larger fonts for better readability
    let sizeClass = '';
    
    if (hasNewlines) {
        // Multi-line content - be very generous
        if (lineCount > 3 || maxLineLength > 12) {
            sizeClass = 'small-text';
        } else if (lineCount > 2 || maxLineLength > 9) {
            sizeClass = 'medium-text';
        }
        // For most multi-line content, use default (largest) font
    } else {
        // Single line content - much more generous thresholds
        if (maxLineLength > 15) {
            sizeClass = 'tiny-text';
        } else if (maxLineLength > 12) {
            sizeClass = 'small-text';
        } else if (maxLineLength > 9) {
            sizeClass = 'medium-text';
        }
        // For content ≤9 chars (like "12RO"), use default (largest) font
    }
    
    // Apply the calculated size class
    if (sizeClass) {
        cell.classList.add(sizeClass);
    }
    
    // FORCE CENTERING: Re-apply centering styles after font size changes
    cell.style.textAlign = 'center';
    cell.style.verticalAlign = 'middle';
    cell.style.fontVariantNumeric = 'tabular-nums';
    cell.style.fontFeatureSettings = '"tnum" 1, "kern" 1';
    cell.style.letterSpacing = '0';
    cell.style.wordSpacing = '0';
    cell.style.textAlignLast = 'center';
}

function calculateAgentTotalHours(agent) {
    if (!agent.days || !Array.isArray(agent.days)) return '0h';
    
    let totalHours = 0;
    agent.days.forEach(day => {
        if (day && day.match(/\d+/)) {
            const hours = day.match(/\d+/g);
            if (hours) {
                totalHours += hours.reduce((sum, h) => sum + parseInt(h), 0);
            }
        }
    });
    
    return `${totalHours}h`;
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
    // CRITICAL CHANGE: The key now uses the Firestore document ID (agent.id)
    // instead of the agent's name, which is more robust.
    const cellKey = `${cell.dataset.agentId}-${cell.dataset.day}`;
    
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
    const cellKey = `${cell.dataset.agentId}-${cell.dataset.day}`;
    
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
        if (agentId) {
            deleteAgent(agentId);
        } else {
            console.error('No agent ID found on delete button');
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
        countElement.textContent = `${selectionState.selectedCells.size} celule selectate`;
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
            plannerContainer.innerHTML = '<div class="placeholder">Selectați una sau mai multe luni pentru a le vizualiza.</div>';
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
            monthTitle.textContent = startOfMonth.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' });
            monthTitle.style.cssText = 'padding: 1.5rem 1rem 0.5rem 1rem; margin: 0; color: var(--text-primary);';
            plannerContainer.appendChild(monthTitle);
            
            // Render the table for this specific month
            renderPlannerTable(plannerContainer, startOfMonth, endOfMonth);
        });

    } else {
        // For 'preset' and 'custom' ranges, use the unified table structure
        const { start, end } = plannerState.dateRange;
        if (!start || !end) {
            plannerContainer.innerHTML = '<div class="placeholder">Perioadă invalidă.</div>';
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