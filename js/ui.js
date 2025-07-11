// === THEME AND LANGUAGE FUNCTIONALITY ===
import { languageConfig, translations } from './config.js';

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
export function showSection(sectionId) {
    // Update active nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    // Show section
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
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

// Modal Functions
export function openEditModal() {
    console.log('openEditModal called');
    const selectedCells = document.querySelectorAll('.day-cell.selected');
    if (selectedCells.length === 0) {
        console.log('No cells selected, showing alert');
        alert('Selectează cel puțin o celulă pentru editare.');
        return;
    }
    
    console.log('Opening edit modal...');
    populateSelectionInfo();
    document.getElementById('editModal').classList.add('active');
    resetEditModal();
    console.log('Edit modal opened successfully');
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
    // Update UI
    document.querySelectorAll('.edit-option').forEach(option => {
        option.classList.remove('selected');
    });
    document.querySelector(`[data-type="${type}"]`).classList.add('selected');
    
    // Hide all edit sections
    const workingSection = document.getElementById('workingHoursSection');
    const dayOffSection = document.getElementById('dayOffSection');
    
    if (workingSection) workingSection.style.display = 'none';
    if (dayOffSection) dayOffSection.style.display = 'none';
    
    // Show relevant section
    if (type === 'working') {
        showWorkingHoursSection();
    } else if (type === 'dayoff') {
        if (dayOffSection) dayOffSection.style.display = 'block';
    }
}

export function showWorkingHoursSection() {
    const section = document.getElementById('workingHoursSection');
    const teamAllocation = document.getElementById('teamAllocation');
    
    if (!section || !teamAllocation) return;
    
    // Get all available teams
    const allTeams = ['RO', 'HU', 'IT', 'NL', 'DE'];
    
    teamAllocation.innerHTML = allTeams.map(team => `
        <div class="team-input-group">
            <label class="team-input-label">${team}</label>
            <input type="number" 
                   class="team-input" 
                   data-team="${team}" 
                   min="0" 
                   max="12" 
                   value="0" 
                   onchange="updateTotalHours()">
        </div>
    `).join('');
    
    section.style.display = 'block';
    updateTotalHours();
}

export function updateTotalHours() {
    const teamInputs = document.querySelectorAll('.team-input');
    let total = 0;
    
    teamInputs.forEach(input => {
        total += parseInt(input.value) || 0;
    });
    
    const totalDisplay = document.getElementById('totalHoursDisplay');
    if (totalDisplay) {
        totalDisplay.textContent = `Total: ${total} ore`;
    }
    
    // Validate total hours (should not exceed 12)
    const saveButton = document.getElementById('saveButton');
    if (total > 12) {
        if (saveButton) saveButton.disabled = true;
        showEditMessage('Totalul orelor nu poate depăși 12 ore pe zi.', 'error');
    } else {
        if (saveButton) saveButton.disabled = false;
        hideEditMessage();
    }
}

export function showEditMessage(message, type) {
    const messageDiv = document.getElementById('editMessage');
    if (messageDiv) {
        messageDiv.className = type === 'error' ? 'error-message' : 'success-message';
        messageDiv.textContent = message;
        messageDiv.style.display = 'block';
    }
}

export function hideEditMessage() {
    const messageDiv = document.getElementById('editMessage');
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }
}

export function saveModalChanges() {
    const selectedOption = document.querySelector('.edit-option.selected');
    if (!selectedOption) {
        alert('Selectează un tip de modificare.');
        return;
    }
    
    const type = selectedOption.dataset.type;
    
    if (type === 'working') {
        // Apply working hours changes
        const teamInputs = document.querySelectorAll('.team-input');
        let totalHours = 0;
        const allocations = [];
        
        teamInputs.forEach(input => {
            const hours = parseInt(input.value) || 0;
            if (hours > 0) {
                totalHours += hours;
                allocations.push(`${hours} ${input.dataset.team}`);
            }
        });
        
        if (totalHours > 12) {
            alert('Totalul orelor nu poate depăși 12 ore pe zi.');
            return;
        }
        
        const newValue = allocations.join(' + ');
        applyChangesToSelectedCells(newValue);
    } else if (type === 'holiday' || type === 'sick' || type === 'dayoff') {
        const values = {
            holiday: 'Co',
            sick: 'CM',
            dayoff: 'LB'
        };
        applyChangesToSelectedCells(values[type]);
    }
    
    closeEditModal();
    showTemporaryMessage('Modificările au fost aplicate cu succes!', 'success');
}

function applyChangesToSelectedCells(newValue) {
    const selectedCells = document.querySelectorAll('.day-cell.selected');
    
    selectedCells.forEach(cell => {
        const cellContent = cell.querySelector('.cell-content');
        if (cellContent) {
            cellContent.textContent = newValue;
        }
        cell.classList.remove('selected');
    });
}

export function showTemporaryMessage(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `temporary-message ${type === 'success' ? 'success-message' : 'error-message'}`;
    messageDiv.textContent = message;
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '2rem';
    messageDiv.style.right = '2rem';
    messageDiv.style.zIndex = '2000';
    messageDiv.style.padding = '1rem 2rem';
    messageDiv.style.borderRadius = '8px';
    messageDiv.style.fontWeight = '600';
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

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