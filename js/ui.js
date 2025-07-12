// js/ui.js

// === THEME AND LANGUAGE FUNCTIONALITY ===
import { languageConfig, translations } from './config.js';
// Import the new Firestore functions from planner.js
import { addAgent, applyChangesToSelectedCells, renderPlannerTable } from './planner.js';

// Theme and language state
let currentTheme = localStorage.getItem('theme') || 'dark';
let currentLanguage = localStorage.getItem('language') || 'ro';

// Initialize theme and language from localStorage
export function initializeThemeAndLanguage() {
    // Set theme
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeIcon();
    
    // Set language
    updateLanguageDisplay(currentLanguage);
    translatePage(currentLanguage);
    
    // Initialize the new user form
    initializeNewUserForm();
}

// Theme Management
export function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    updateThemeIcon();
    
    // Add a smooth transition effect
    document.body.style.transition = 'all 0.3s ease';
    setTimeout(() => {
        document.body.style.transition = '';
    }, 300);
}

export function updateThemeIcon() {
    const themeIcon = document.getElementById('themeIcon');
    if (currentTheme === 'dark') {
        // Sun icon (for switching to light)
        themeIcon.innerHTML = `<path d="M12 17.5c-3.04 0-5.5-2.46-5.5-5.5S8.96 6.5 12 6.5s5.5 2.46 5.5 5.5-2.46 5.5-5.5 5.5zM12 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0-7c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1s1-.45 1-1V3c0-.55-.45-1-1-1zm0 16c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1s1-.45 1-1v-1c0-.55-.45-1-1-1zM6 12c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1s.45 1 1 1h1c.55 0 1-.45 1-1zm14 0c0-.55-.45-1-1-1h-1c-.55 0-1 .45-1 1s.45 1 1 1h1c.55 0 1-.45 1-1zm-2.64-6.36c.39-.39.39-1.02 0-1.41l-.71-.71c-.39-.39-1.02-.39-1.41 0-.39.39-.39 1.02 0 1.41l.71.71c.39.39 1.02.39 1.41 0zM6.05 17.66c.39-.39.39-1.02 0-1.41l-.71-.71c-.39-.39-1.02-.39-1.41 0-.39.39-.39 1.02 0 1.41l.71.71c.39.39 1.02.39 1.41 0zm0-11.32c-.39-.39-1.02-.39-1.41 0l-.71.71c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l.71-.71c.39-.39.39-1.02 0-1.41zm11.32 11.32c-.39-.39-1.02-.39-1.41 0l-.71.71c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l.71-.71c.39-.39.39-1.02 0-1.41z"/>`;
    } else {
        // Moon icon (for switching to dark)
        themeIcon.innerHTML = `<path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z"/>`;
    }
}

// Language Management
export function toggleLanguageMenu() {
    const menu = document.getElementById('languageMenu');
    const dropdown = document.querySelector('.language-dropdown');
    
    menu.classList.toggle('open');
    dropdown.classList.toggle('open');
}

export function changeLanguage(langCode, saveToStorage = true) {
    currentLanguage = langCode;
    
    if (saveToStorage) {
        localStorage.setItem('language', langCode);
    }
    
    // Update UI elements
    updateLanguageDisplay(langCode);
    translatePage(langCode);
    
    // Close language menu
    document.getElementById('languageMenu').classList.remove('open');
    document.querySelector('.language-dropdown').classList.remove('open');
    
    // Update active language option
    document.querySelectorAll('.language-option').forEach(option => {
        option.classList.remove('active');
    });
    const activeOption = document.querySelector(`[data-lang="${langCode}"]`);
    if (activeOption) {
        activeOption.classList.add('active');
    }
}

export function updateLanguageDisplay(langCode) {
    const config = languageConfig[langCode];
    const currentFlag = document.getElementById('currentFlag');
    const currentLanguage = document.getElementById('currentLanguage');
    
    if (currentFlag) currentFlag.textContent = config.flag;
    if (currentLanguage) currentLanguage.textContent = config.name;
}

export function translatePage(langCode) {
    const elements = document.querySelectorAll('[data-translate]');
    elements.forEach(element => {
        const key = element.getAttribute('data-translate');
        if (translations[langCode] && translations[langCode][key]) {
            element.textContent = translations[langCode][key];
        }
    });
}

// Sidebar toggle functionality
export function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

// Navigation
export function showSection(sectionId, clickedElement) {
    // Update active nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    if (clickedElement) {
        clickedElement.classList.add('active');
    }
    
    // Show section
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        
        // If switching to planner section, trigger a render
        if (sectionId === 'planner') {
            // Use setTimeout to ensure the section is visible first
            setTimeout(() => {
                renderPlannerTable();
            }, 10);
        }
    }
}

// Day Toggle Functionality for Dashboard
const plannedHoursData = {
    today: {
        hours: 336,
        agents: 42,
        detail: "Pentru 42 agenți"
    },
    tomorrow: {
        hours: 312,
        agents: 39,
        detail: "Pentru 39 agenți"
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
    const selectedCells = document.querySelectorAll('.day-cell.selected');
    if (selectedCells.length === 0) {
        alert('Selectează cel puțin o celulă pentru editare.');
        return;
    }
    populateSelectionInfo();
    document.getElementById('editModal').classList.add('active');
    resetEditModal();
}

export function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    resetEditModal();
}

export function resetEditModal() {
    // Reset edit type selection
    document.querySelectorAll('.edit-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Hide all edit sections
    const workingSection = document.getElementById('workingHoursSection');
    const dayOffSection = document.getElementById('dayOffSection');
    const editMessage = document.getElementById('editMessage');
    
    if (workingSection) workingSection.style.display = 'none';
    if (dayOffSection) dayOffSection.style.display = 'none';
    if (editMessage) editMessage.style.display = 'none';
}

export function populateSelectionInfo() {
    const details = document.getElementById('selectionDetails');
    const selectedCells = document.querySelectorAll('.day-cell.selected');
    
    if (details) {
        details.innerHTML = `
            <strong>Selecție:</strong> ${selectedCells.length} celule selectate<br>
            <strong>Ready for editing</strong>
        `;
    }
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
    
    // Hide all sections first
    const workingSection = document.getElementById('workingHoursSection');
    const dayOffSection = document.getElementById('dayOffSection');
    
    if (workingSection) workingSection.style.display = 'none';
    if (dayOffSection) dayOffSection.style.display = 'none';
    
    // Show appropriate section
    if (type === 'working') {
        showWorkingHoursSection();
    } else if (type === 'dayoff') {
        if (dayOffSection) dayOffSection.style.display = 'block';
    }
}

export function showWorkingHoursSection() {
    const workingSection = document.getElementById('workingHoursSection');
    const teamAllocation = document.getElementById('teamAllocation');
    
    if (!workingSection || !teamAllocation) return;
    
    // Show the section
    workingSection.style.display = 'block';
    
    // Create team input fields
    const teams = ['RO', 'HU', 'IT', 'NL', 'DE']; // Common teams
    teamAllocation.innerHTML = teams.map(team => `
        <div class="team-input-group">
            <label for="${team.toLowerCase()}Hours">${team} zooplus</label>
            <input type="number" 
                   id="${team.toLowerCase()}Hours" 
                   class="team-input" 
                   data-team="${team}" 
                   min="0" 
                   max="12" 
                   value="0">
        </div>
    `).join('');
    
    // Update total hours display
    updateTotalHours();
}

export function updateTotalHours() {
    const teamInputs = document.querySelectorAll('.team-input');
    let totalHours = 0;
    
    teamInputs.forEach(input => {
        const hours = parseInt(input.value) || 0;
        totalHours += hours;
    });
    
    const totalDisplay = document.getElementById('totalHoursDisplay');
    if (totalDisplay) {
        totalDisplay.textContent = `Total: ${totalHours} ore`;
        
        // Add warning if over 12 hours
        if (totalHours > 12) {
            totalDisplay.style.color = 'var(--error)';
            totalDisplay.textContent += ' (Depășește limita de 12 ore)';
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
        alert('Selectează un tip de modificare.');
        return;
    }

    const type = selectedOption.dataset.type;
    let newValue = '';

    if (type === 'working') {
        const teamInputs = document.querySelectorAll('.team-input');
        let totalHours = 0;
        const allocations = [];
        teamInputs.forEach(input => {
            const hours = parseInt(input.value) || 0;
            if (hours > 0) {
                totalHours += hours;
                allocations.push(`${hours}${input.dataset.team}`); // Format as "8RO"
            }
        });

        if (totalHours > 12) {
            alert('Totalul orelor nu poate depăși 12 ore pe zi.');
            return;
        }
        newValue = allocations.join('+');
    } else {
        const values = { holiday: 'Co', sick: 'CM', dayoff: 'LB' };
        newValue = values[type];
    }

    // Get the keys of all selected cells
    const selectedCellKeys = new Set();
    document.querySelectorAll('.day-cell.selected').forEach(cell => {
        const cellKey = `${cell.dataset.agentId}-${cell.dataset.day}`;
        selectedCellKeys.add(cellKey);
    });

    // Call the refactored function in planner.js to handle the database update
    if (selectedCellKeys.size > 0) {
        applyChangesToSelectedCells(selectedCellKeys, newValue);
    }

    closeEditModal();
    // The success message is now shown in applyChangesToSelectedCells
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
        showTemporaryMessage("Please fill all required fields.", "error");
        return;
    }
    if (!username.endsWith('.fsp')) {
        showTemporaryMessage("Username must end with .fsp", "error");
        return;
    }

    // Construct the new agent object
    const newAgent = {
        fullName: fullName,
        username: username,
        contractHours: parseInt(contractHours) || 8,
        contractType: contractType,
        primaryTeam: primaryTeam,
        teams: [primaryTeam.split(' ')[0]], // e.g., "RO zooplus" -> "RO"
        hireDate: new Date(hireDate),
        isActive: true,
        // Create a default 31-day schedule for the new agent
        days: Array(31).fill(''), 
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