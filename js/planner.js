// Planner Data and State Management
import { showTemporaryMessage } from './ui.js';

// Agent Notes Storage
const agentNotes = {};

// Helper function to generate realistic schedules
function generateSchedule(pattern) {
    const schedule = [];
    // Add space between number and team code
    const formattedPattern = pattern.replace(/(\d+)([A-Z]+)/g, '$1 $2');
    
    for (let i = 0; i < 31; i++) {
        const dayOfWeek = (i + 3) % 7; // Assuming 1st is a Thursday
        if (dayOfWeek === 5 || dayOfWeek === 6) { // Saturday or Sunday
            schedule.push('SL');
        } else if (Math.random() < 0.05) { // 5% chance of sick leave/vacation
            schedule.push(Math.random() < 0.7 ? 'SL' : 'Co');
        } else {
            schedule.push(formattedPattern);
        }
    }
    return schedule;
}

// Planner Mock Data
const plannerData = [
    // RO zooplus team (25 agents)
    { name: 'Popescu Maria.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Ionescu Ana.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Dumitrescu Elena.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Georgescu Ioana.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Stoica Carmen.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Marin Daniela.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Constantin Mihaela.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Stan Andreea.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Dobre Cristina.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Radu Simona.fsp', contract: '6h', teams: ['RO'], days: generateSchedule('6RO') },
    { name: 'Enache Raluca.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Fratila Diana.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Tudor Roxana.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Varga Madalina.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Matei Florina.fsp', contract: '6h', teams: ['RO'], days: generateSchedule('6RO') },
    { name: 'Sandu Corina.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Popa Alina.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Moldovan Lavinia.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Nistor Bianca.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Ciobanu Alexandra.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Festeu Cristina.fsp', contract: '8h', teams: ['RO', 'IT'], days: generateSchedule('4RO+4IT') },
    { name: 'Lungu Gabriela.fsp', contract: '6h', teams: ['RO'], days: generateSchedule('6RO') },
    { name: 'Iliescu Monica.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Andrei Claudia.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },
    { name: 'Ungureanu Paula.fsp', contract: '8h', teams: ['RO'], days: generateSchedule('8RO') },

    // HU zooplus team (20 agents)
    { name: 'Nagy Eszter.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Kiss Andrea.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Szabo Zsuzsanna.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Toth Katalin.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Horvath Judit.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Varga Peter.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Kovacs Gabor.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Farkas Aniko.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Molnar Bea.fsp', contract: '6h', teams: ['HU'], days: generateSchedule('6HU') },
    { name: 'Balazs Diana.fsp', contract: '8h', teams: ['HU', 'IT'], days: generateSchedule('4HU+4IT') },
    { name: 'Banga Kristina.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Nyikora Norbert.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Gabor Eniko.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Lakatos Monika.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Feher Timea.fsp', contract: '6h', teams: ['HU'], days: generateSchedule('6HU') },
    { name: 'Racz Eva.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Nemeth Ildiko.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Balogh Krisztina.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Papp Renata.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },
    { name: 'Simon Beata.fsp', contract: '8h', teams: ['HU'], days: generateSchedule('8HU') },

    // IT zooplus team (18 agents)
    { name: 'Rossi Marco.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Bianchi Giulia.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Romano Francesco.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Ferretti Chiara.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Ricci Valentina.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Marino Sofia.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Greco Elena.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Bruno Alessandra.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Gallo Federica.fsp', contract: '6h', teams: ['IT'], days: generateSchedule('6IT') },
    { name: 'Conti Martina.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'De Luca Francesca.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Mancini Serena.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Costa Roberta.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Giordano Alice.fsp', contract: '6h', teams: ['IT'], days: generateSchedule('6IT') },
    { name: 'Rizzo Paola.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Lombardi Silvia.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Moretti Laura.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },
    { name: 'Barbieri Claudia.fsp', contract: '8h', teams: ['IT'], days: generateSchedule('8IT') },

    // NL zooplus team (12 agents)
    { name: 'Van Der Berg Emma.fsp', contract: '8h', teams: ['NL'], days: generateSchedule('8NL') },
    { name: 'De Jong Lisa.fsp', contract: '8h', teams: ['NL'], days: generateSchedule('8NL') },
    { name: 'Jansen Sophie.fsp', contract: '8h', teams: ['NL'], days: generateSchedule('8NL') },
    { name: 'Van Dijk Anna.fsp', contract: '8h', teams: ['NL'], days: generateSchedule('8NL') },
    { name: 'Peters Julia.fsp', contract: '8h', teams: ['NL'], days: generateSchedule('8NL') },
    { name: 'Van Den Berg Lotte.fsp', contract: '6h', teams: ['NL'], days: generateSchedule('6NL') },
    { name: 'Smit Sanne.fsp', contract: '8h', teams: ['NL'], days: generateSchedule('8NL') },
    { name: 'Mulder Fleur.fsp', contract: '8h', teams: ['NL'], days: generateSchedule('8NL') },
    { name: 'De Vries Iris.fsp', contract: '8h', teams: ['NL'], days: generateSchedule('8NL') },
    { name: 'Van Leeuwen Mila.fsp', contract: '6h', teams: ['NL'], days: generateSchedule('6NL') },
    { name: 'Bakker Noa.fsp', contract: '8h', teams: ['NL'], days: generateSchedule('8NL') },
    { name: 'Visser Luna.fsp', contract: '8h', teams: ['NL'], days: generateSchedule('8NL') },

    // Flexible/Multi-team agents (5 agents)
    { name: 'Schmidt Laura.fsp', contract: '8h', teams: ['DE', 'NL'], days: generateSchedule('4DE+4NL') },
    { name: 'Mueller Sarah.fsp', contract: '8h', teams: ['DE'], days: generateSchedule('8DE') },
    { name: 'Weber Lisa.fsp', contract: '6h', teams: ['DE'], days: generateSchedule('6DE') },
    { name: 'Wagner Anna.fsp', contract: '8h', teams: ['DE', 'IT'], days: generateSchedule('4DE+4IT') },
    { name: 'Becker Marie.fsp', contract: '8h', teams: ['DE'], days: generateSchedule('8DE') },
];

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

// Initialize Enhanced Planner
export function initializePlanner() {
    initializeMonthGrid();
    initializeTeamChips();
    initializeAgentSearch();
    applyPresetRange();
    renderPlannerTable();
}

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
    document.querySelectorAll('.month-card').forEach(card => {
        const isSelected = plannerState.selectedMonths.includes(card.dataset.month);
        card.classList.toggle('selected', isSelected);
    });
}

// Team Management
function initializeTeamChips() {
    const teamChips = document.getElementById('teamChips');
    if (!teamChips) return;
    
    const allTeams = getAllTeams();
    
    const chips = [
        { id: 'all', name: 'Toate echipele', class: 'all' },
        ...allTeams.map(team => ({ id: team, name: team }))
    ];

    teamChips.innerHTML = chips.map(chip => `
        <div class="team-chip ${chip.class || ''} ${plannerState.selectedTeams.includes(chip.id) ? 'active' : ''}" 
             data-team="${chip.id}">
            ${chip.name}
        </div>
    `).join('');
    
    // Add event listeners to team chips
    teamChips.querySelectorAll('.team-chip').forEach(chip => {
        chip.addEventListener('click', () => toggleTeam(chip.dataset.team));
    });
}

export function toggleTeam(teamId) {
    if (teamId === 'all') {
        plannerState.selectedTeams = ['all'];
    } else {
        const allIndex = plannerState.selectedTeams.indexOf('all');
        if (allIndex > -1) {
            plannerState.selectedTeams.splice(allIndex, 1);
        }
        
        const index = plannerState.selectedTeams.indexOf(teamId);
        if (index > -1) {
            plannerState.selectedTeams.splice(index, 1);
        } else {
            plannerState.selectedTeams.push(teamId);
        }
        
        if (plannerState.selectedTeams.length === 0) {
            plannerState.selectedTeams = ['all'];
        }
    }
    updateTeamDisplay();
}

function updateTeamDisplay() {
    document.querySelectorAll('.team-chip').forEach(chip => {
        const isSelected = plannerState.selectedTeams.includes(chip.dataset.team);
        chip.classList.toggle('active', isSelected);
    });
}

// Range Type Management
export function setRangeType(type) {
    plannerState.rangeType = type;
    
    // Update tab active state
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.range === type);
    });
    
    // Show/hide containers
    const presetContainer = document.getElementById('presetRangeContainer');
    const customContainer = document.getElementById('customRangeContainer');
    const multiContainer = document.getElementById('multiMonthContainer');
    
    if (presetContainer) presetContainer.style.display = type === 'preset' ? 'block' : 'none';
    if (customContainer) customContainer.style.display = type === 'custom' ? 'block' : 'none';
    if (multiContainer) multiContainer.style.display = type === 'multi-month' ? 'block' : 'none';
}

// Preset Range Management
export function applyPresetRange() {
    const presetSelect = document.getElementById('presetRange');
    const preset = presetSelect ? presetSelect.value : plannerState.presetRange;
    plannerState.presetRange = preset;
    
    const currentDate = new Date();
    
    switch (preset) {
        case 'current-month':
            plannerState.dateRange.start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            plannerState.dateRange.end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            break;
        case 'next-month':
            plannerState.dateRange.start = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            plannerState.dateRange.end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
            break;
        case 'current-quarter':
            const quarterStart = Math.floor(currentDate.getMonth() / 3) * 3;
            plannerState.dateRange.start = new Date(currentDate.getFullYear(), quarterStart, 1);
            plannerState.dateRange.end = new Date(currentDate.getFullYear(), quarterStart + 3, 0);
            break;
        case 'next-quarter':
            const nextQuarterStart = Math.floor(currentDate.getMonth() / 3) * 3 + 3;
            plannerState.dateRange.start = new Date(currentDate.getFullYear(), nextQuarterStart, 1);
            plannerState.dateRange.end = new Date(currentDate.getFullYear(), nextQuarterStart + 3, 0);
            break;
    }
    
    renderPlannerTable();
}

// Agent Search
function initializeAgentSearch() {
    const searchInput = document.getElementById('agentSearch');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        if (searchTerm === '') {
            plannerState.selectedAgents = [];
        } else {
            plannerState.selectedAgents = plannerData
                .filter(agent => agent.name.toLowerCase().includes(searchTerm))
                .map(agent => agent.name);
        }
        renderPlannerTable();
    });
}

export function filterAgents(event) {
    const searchTerm = event.target.value.toLowerCase();
    if (searchTerm === '') {
        plannerState.selectedAgents = [];
    } else {
        plannerState.selectedAgents = plannerData
            .filter(agent => agent.name.toLowerCase().includes(searchTerm))
            .map(agent => agent.name);
    }
    renderPlannerTable();
}

export function showAgentSuggestions() {
    // Implementation for showing agent suggestions
}

export function hideAgentSuggestions() {
    // Implementation for hiding agent suggestions
}

// Utility Functions
function getAllTeams() {
    const teams = new Set();
    plannerData.forEach(agent => {
        agent.teams.forEach(team => teams.add(team));
    });
    return Array.from(teams).sort();
}

function getFilteredAgents() {
    let filteredAgents = plannerData;
    
    // Filter by teams
    if (!plannerState.selectedTeams.includes('all')) {
        filteredAgents = filteredAgents.filter(agent => 
            agent.teams.some(team => plannerState.selectedTeams.includes(team))
        );
    }
    
    // Filter by agent search
    if (plannerState.selectedAgents.length > 0) {
        filteredAgents = filteredAgents.filter(agent => 
            plannerState.selectedAgents.includes(agent.name)
        );
    }
    
    return filteredAgents;
}

// Table Rendering
function renderPlannerTable() {
    const headerTable = document.querySelector('.planner-header-table');
    const bodyTable = document.querySelector('.planner-body-table');
    
    if (!headerTable || !bodyTable) return;
    
    const filteredAgents = getFilteredAgents();
    
    if (filteredAgents.length === 0) {
        const container = document.querySelector('.planner-body-container');
        if (container) {
            container.innerHTML = '<p style="padding: 2rem; text-align: center;">Nu există agenți care să corespundă criteriilor de filtrare.</p>';
        }
        return;
    }
    
    const daysInMonth = 31; // May 2025
    
    // Render header
    const headerHTML = `
        <tr>
            <th style="width: 3%;">#</th>
            <th style="width: 12%;">Agent</th>
            <th style="width: 8%;">Contract</th>
            <th style="width: 6%;">Echipă</th>
            ${Array.from({length: daysInMonth}, (_, i) => `<th style="width: 2.2%;" class="day-column">${i + 1}</th>`).join('')}
            <th style="width: 4%;">Total</th>
        </tr>
    `;
    
    headerTable.innerHTML = headerHTML;
    
    // Render body
    const bodyHTML = filteredAgents.map((agent, index) => renderAgentRow(agent, daysInMonth, index + 1)).join('');
    bodyTable.innerHTML = bodyHTML;
    
    // Add event listeners for cell selection
    addCellEventListeners();
}

function renderAgentRow(agent, daysInMonth, rowNumber) {
    const totalHours = calculateAgentTotalHours(agent);
    
    return `
        <tr class="agent-row" data-agent="${agent.name}">
            <td style="width: 3%;">${rowNumber}</td>
            <td class="agent-name" style="width: 12%;">${agent.name}</td>
            <td class="contract-hours" style="width: 8%;">${agent.contract}</td>
            <td class="team-list" style="width: 6%;">${agent.teams.join(', ')}</td>
            ${agent.days.slice(0, daysInMonth).map((day, index) => `
                <td class="day-cell planner-cell selectable ${getCellClass(day, index)}" 
                    style="width: 2.2%;"
                    data-agent="${agent.name}" 
                    data-day="${index}"
                    data-original-value="${day}">
                    <div class="cell-content">${formatCellContent(day)}</div>
                </td>
            `).join('')}
            <td class="total-hours" style="width: 4%;">${totalHours}h</td>
        </tr>
    `;
}

function getCellClass(day, dayIndex) {
    const dayOfWeek = (dayIndex + 3) % 7; // Assuming 1st is Thursday
    let classes = [];
    
    if (dayOfWeek === 5 || dayOfWeek === 6) {
        classes.push('weekend');
    }
    
    if (day === 'SL') {
        classes.push('sick-leave');
    } else if (day === 'Co') {
        classes.push('vacation');
    } else if (day === 'LB') {
        classes.push('legal-holiday');
    } else if (day.includes('RO')) {
        classes.push('ro-team');
    } else if (day.includes('HU')) {
        classes.push('hu-team');
    } else if (day.includes('IT')) {
        classes.push('it-team');
    } else if (day.includes('NL')) {
        classes.push('nl-team');
    } else if (day.includes('DE')) {
        classes.push('de-team');
    }
    
    return classes.join(' ');
}

function formatCellContent(day) {
    if (day === 'SL') return 'SL';
    if (day === 'Co') return 'Co';
    if (day === 'LB') return 'LB';
    
    // Format team allocations with line breaks
    return day.replace(/\s*\+\s*/g, '<br>');
}

function calculateAgentTotalHours(agent) {
    let total = 0;
    agent.days.forEach(day => {
        if (day !== 'SL' && day !== 'Co' && day !== 'LB') {
            const matches = day.match(/\d+/g);
            if (matches) {
                total += matches.reduce((sum, num) => sum + parseInt(num), 0);
            }
        }
    });
    return total;
}

// Cell Selection and Editing
function addCellEventListeners() {
    const cells = document.querySelectorAll('.planner-cell.selectable');
    cells.forEach(cell => {
        cell.addEventListener('mousedown', handleCellMouseDown);
        cell.addEventListener('mouseover', handleCellMouseOver);
        cell.addEventListener('mouseup', handleCellMouseUp);
    });
    
    document.addEventListener('mouseup', handleDocumentMouseUp);
}

function handleCellMouseDown(e) {
    e.preventDefault();
    const cell = e.currentTarget;
    const cellKey = `${cell.dataset.agent}-${cell.dataset.day}`;
    
    if (e.ctrlKey || e.metaKey) {
        // Ctrl+click for multi-select
        if (selectionState.selectedCells.has(cellKey)) {
            selectionState.selectedCells.delete(cellKey);
            cell.classList.remove('selected');
        } else {
            selectionState.selectedCells.add(cellKey);
            cell.classList.add('selected');
        }
    } else {
        // Regular click - start new selection
        clearSelection();
        selectionState.selectedCells.add(cellKey);
        cell.classList.add('selected');
        selectionState.selectionStarted = true;
    }
    
    updateSelectionCounter();
}

function handleCellMouseOver(e) {
    if (selectionState.selectionStarted) {
        const cell = e.currentTarget;
        const cellKey = `${cell.dataset.agent}-${cell.dataset.day}`;
        
        if (!selectionState.selectedCells.has(cellKey)) {
            selectionState.selectedCells.add(cellKey);
            cell.classList.add('selected');
        }
    }
}

function handleCellMouseUp() {
    selectionState.selectionStarted = false;
    updateSelectionCounter();
}

function handleDocumentMouseUp() {
    selectionState.selectionStarted = false;
}

function clearSelection() {
    selectionState.selectedCells.clear();
    document.querySelectorAll('.planner-cell.selected').forEach(cell => {
        cell.classList.remove('selected');
    });
    updateSelectionCounter();
}

function updateSelectionCounter() {
    const selectedCount = selectionState.selectedCells.size;
    const counter = document.getElementById('selectionCounter');
    
    if (counter) {
        if (selectedCount === 0) {
            counter.classList.remove('visible');
        } else {
            counter.classList.add('visible');
            counter.querySelector('#selectionCount').textContent = `${selectedCount} celule selectate`;
        }
    }
}

// View options
export function toggleCompactView() {
    const compactCheckbox = document.getElementById('compactView');
    const isCompact = compactCheckbox ? compactCheckbox.checked : false;
    
    const tableContainer = document.querySelector('.enhanced-table');
    if (tableContainer) {
        tableContainer.classList.toggle('compact-view', isCompact);
    }
}

// Filter actions
export function resetFilters() {
    plannerState.selectedTeams = ['all'];
    plannerState.selectedAgents = [];
    plannerState.rangeType = 'preset';
    plannerState.presetRange = 'current-month';
    
    // Reset UI
    const agentSearch = document.getElementById('agentSearch');
    if (agentSearch) agentSearch.value = '';
    
    const presetSelect = document.getElementById('presetRange');
    if (presetSelect) presetSelect.value = 'current-month';
    
    // Update display
    initializeTeamChips();
    applyPresetRange();
    renderPlannerTable();
}

export function applyFilters() {
    renderPlannerTable();
}

// Export functions
export function exportToCSV() {
    const filteredAgents = getFilteredAgents();
    console.log('Exporting to CSV...', filteredAgents);
    // Implementation for CSV export
}

export function savePlannerChanges() {
    console.log('Saving planner changes...');
    showTemporaryMessage('Modificările au fost salvate!', 'success');
}

// Export renderPlannerTable function
export { renderPlannerTable };

// Calendar functions
export function toggleCalendar(calendarType) {
    const calendar = document.querySelector(`.calendar-popup[data-type="${calendarType}"]`);
    if (calendar) {
        calendar.style.display = calendar.style.display === 'none' ? 'block' : 'none';
    }
}

export function navigateCalendar(calendarType, direction) {
    console.log(`Navigating ${calendarType} calendar ${direction}`);
    // Implementation for calendar navigation
}

export function setToday(calendarType) {
    const input = document.querySelector(`input[data-calendar="${calendarType}"]`);
    if (input) {
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        input.value = formattedDate;
    }
}

export function closeCalendar(calendarType) {
    const calendar = document.querySelector(`.calendar-popup[data-type="${calendarType}"]`);
    if (calendar) {
        calendar.style.display = 'none';
    }
} 