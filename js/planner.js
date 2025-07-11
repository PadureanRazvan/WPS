// js/planner.js

// --- Firestore & Application Imports ---
import { db } from './firebase-config.js';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { showTemporaryMessage } from './ui.js';

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
        renderPlannerTable();
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

// Enhanced Planner State
let plannerState = {
    selectedMonths: [],
    selectedTeams: ['all'],
    selectedAgents: [],
    dateRange: { start: null, end: null },
    rangeType: 'preset',
    presetRange: 'current-month',
    viewOptions: {
        showWeekTotals: true,
        highlightWeekends: true,
        compactView: false
    }
};

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
    const teamChips = document.querySelector('.team-chips');
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
    
    // Update tab display
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.range === type);
    });
    
    // Show/hide appropriate containers
    document.getElementById('presetRangeContainer').style.display = type === 'preset' ? 'block' : 'none';
    document.getElementById('customRangeContainer').style.display = type === 'custom' ? 'flex' : 'none';
    document.getElementById('multiMonthContainer').style.display = type === 'multi-month' ? 'block' : 'none';
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
    
    renderPlannerTable();
}

function initializeAgentSearch() {
    const agentSearch = document.getElementById('agentSearch');
    if (!agentSearch) return;
    
    agentSearch.addEventListener('input', filterAgents);
    agentSearch.addEventListener('focus', showAgentSuggestions);
    agentSearch.addEventListener('blur', hideAgentSuggestions);
}

export function filterAgents() {
    renderPlannerTable();
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

    // Apply team filter
    if (!plannerState.selectedTeams.includes('all')) {
        filteredAgents = filteredAgents.filter(agent => 
            agent.teams && agent.teams.some(team => plannerState.selectedTeams.includes(team))
        );
    }

    // Apply agent search filter
    const searchTerm = document.getElementById('agentSearch')?.value?.toLowerCase();
    if (searchTerm) {
        filteredAgents = filteredAgents.filter(agent =>
            (agent.fullName && agent.fullName.toLowerCase().includes(searchTerm)) ||
            (agent.username && agent.username.toLowerCase().includes(searchTerm))
        );
    }

    return filteredAgents;
}

// Table Rendering (now renders live data)
export function renderPlannerTable() {
    const headerContainer = document.getElementById('plannerTableHeader');
    const bodyContainer = document.getElementById('plannerTableBody');

    if (!headerContainer || !bodyContainer) {
        console.error("Planner table containers not found!");
        return;
    }

    // === FIX START: Use date range from state ===
    let { start, end } = plannerState.dateRange;

    // Fallback to current month if no range is set
    if (!start || !end) {
        const now = new Date();
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    const days = [];
    for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
        days.push(new Date(dt));
    }
    // === FIX END ===

    // Render header
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
        <th class="agent-name-header">Agent</th>
        <th class="hours-header">Ore</th>
        ${days.map(date => {
            const dayNum = date.getDate();
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            return `<th class="day-header ${isWeekend ? 'weekend' : ''}">${dayNum}</th>`;
        }).join('')}
        <th class="total-header">Total</th>
    `;
    headerContainer.innerHTML = '';
    headerContainer.appendChild(headerRow);

    // Render body
    const filteredAgents = getFilteredAgents();
    bodyContainer.innerHTML = '';

    filteredAgents.forEach((agent) => {
        // Pass the array of dates to renderAgentRow
        const row = renderAgentRow(agent, days);
        bodyContainer.appendChild(row);
    });

    // Add cell event listeners
    addCellEventListeners();
}

function renderAgentRow(agent, dates) {
    const row = document.createElement('tr');
    row.className = 'agent-row';

    // Agent name cell
    const nameCell = document.createElement('td');
    nameCell.className = 'agent-name';
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

    // Day cells
    const dayCells = dates.map(date => {
        const dayIndex = date.getDate() - 1; // agent.days is 0-indexed (0 for 1st, 1 for 2nd)

        const cell = document.createElement('td');
        cell.className = 'planner-cell selectable';
        cell.dataset.agentId = agent.id; // Use Firestore document ID
        cell.dataset.day = dayIndex;

        // This assumes agent.days stores data for the month of the current date
        // This is a design limitation but we'll work with it for now.
        const dayValue = agent.days && agent.days[dayIndex] ? agent.days[dayIndex] : '';
        const formattedContent = formatCellContent(dayValue);
        
        // Use innerHTML for proper line break display
        if (formattedContent.includes('\n')) {
            cell.innerHTML = formattedContent.replace(/\n/g, '<br>');
            cell.classList.add('multi-team');
        } else {
            cell.textContent = formattedContent;
        }
        
        cell.classList.add(...getCellClass(dayValue, date));

        return cell;
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
    
    // Handle multiple teams (e.g., "4HU + 4IT" or "4HU+4IT" -> "4HU\n+\n4IT")
    if (day.includes('+')) {
        const parts = day.split('+');
        // Clean up each part and join with newlines and + symbols for better display
        return parts.map(part => part.trim().replace(/\s+/g, '')).join('\n+\n');
    }
    
    // Format single team working hours (e.g., "8 RO" -> "8RO")
    return day.replace(/\s+/g, '');
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
    
    // Add global right-click listener to clear selection
    document.removeEventListener('contextmenu', handleDocumentRightClick);
    document.addEventListener('contextmenu', handleDocumentRightClick);
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

function handleDocumentRightClick(e) {
    e.preventDefault(); // Prevent default context menu
    clearSelection();
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
    plannerState.viewOptions.compactView = !plannerState.viewOptions.compactView;
    document.body.classList.toggle('compact-view', plannerState.viewOptions.compactView);
    renderPlannerTable();
}

export function resetFilters() {
    plannerState.selectedTeams = ['all'];
    plannerState.selectedAgents = [];
    document.getElementById('agentSearch').value = '';
    updateTeamDisplay();
    renderPlannerTable();
}

export function applyFilters() {
    renderPlannerTable();
}

export function exportToCSV() {
    console.log('Exporting to CSV...');
    showTemporaryMessage("CSV export functionality coming soon!", "info");
} 