// Application Entry Point
import { initializeCharts, changeProductivityView } from './charts.js';
import { 
    initializePlanner, 
    applyPresetRange, 
    setRangeType, 
    toggleMonth, 
    selectAllMonths, 
    clearMonthSelection, 
    toggleTeam, 
    filterAgents, 
    showAgentSuggestions, 
    hideAgentSuggestions, 
    toggleCompactView, 
    resetFilters, 
    applyFilters, 
    savePlannerChanges, 
    exportToCSV,
    renderPlannerTable,
    toggleCalendar,
    navigateCalendar,
    setToday,
    closeCalendar
} from './planner.js';
import { 
    initializeThemeAndLanguage, 
    toggleSidebar, 
    showSection, 
    toggleDay, 
    toggleTheme,
    toggleLanguageMenu,
    changeLanguage,
    openEditModal, 
    closeEditModal, 
    selectEditType, 
    saveModalChanges,
    updateTotalHours
} from './ui.js';

// Application State
const appState = {
    initialized: false,
    performanceStartTime: Date.now()
};

// Main initialization function
function initializeApp() {
    if (appState.initialized) return;
    
    console.log('Initializing Sherpa Application...');
    
    try {
        // Initialize all modules
        initializeThemeAndLanguage();
        initializeCharts();
        initializePlanner();
        
        // Set up event listeners
        setupEventListeners();
        
        // Initialize UI state
        initializeUI();
        
        // Setup global listeners
        setupGlobalEventListeners();
        
        // Monitor performance
        monitorPerformance();
        
        appState.initialized = true;
        console.log('Sherpa Application initialized successfully');
        
    } catch (error) {
        console.error('Error initializing application:', error);
        showErrorMessage('Failed to initialize application. Please refresh the page.');
    }
}

// Initialize UI elements
function initializeUI() {
    // Set default active section
    const dashboardSection = document.getElementById('dashboard');
    if (dashboardSection) {
        dashboardSection.classList.add('active');
    }
    
    // Set default active nav item
    const firstNavItem = document.querySelector('.nav-item[data-tooltip="dashboard"]');
    if (firstNavItem) {
        firstNavItem.classList.add('active');
    }
}

// Centralized Event Listeners Setup
function setupEventListeners() {
    // Sidebar and Navigation
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }
    
    // Navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const sectionId = item.dataset.tooltip;
            if (sectionId) {
                showSection(sectionId);
                
                // Update active nav item
                document.querySelectorAll('.nav-item').forEach(navItem => {
                    navItem.classList.remove('active');
                });
                item.classList.add('active');
            }
        });
    });

    // Header Controls
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    const languageDropdown = document.querySelector('.language-dropdown');
    if (languageDropdown) {
        languageDropdown.addEventListener('click', toggleLanguageMenu);
    }
    
    // Language options
    document.querySelectorAll('.language-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const langCode = option.dataset.lang;
            if (langCode) {
                changeLanguage(langCode);
            }
        });
    });

    // Dashboard controls
    const todayBtn = document.getElementById('todayBtn');
    const tomorrowBtn = document.getElementById('tomorrowBtn');
    
    if (todayBtn) {
        todayBtn.addEventListener('click', () => toggleDay('today'));
    }
    if (tomorrowBtn) {
        tomorrowBtn.addEventListener('click', () => toggleDay('tomorrow'));
    }

    // Planner Filter Controls
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const rangeType = tab.dataset.range;
            if (rangeType) {
                setRangeType(rangeType);
            }
        });
    });
    
    const presetRange = document.getElementById('presetRange');
    if (presetRange) {
        presetRange.addEventListener('change', applyPresetRange);
    }
    
    // Calendar event handlers
    document.querySelectorAll('input[onclick*="toggleCalendar"]').forEach(input => {
        input.addEventListener('click', (e) => {
            const calendarType = input.getAttribute('onclick').includes('start') ? 'start' : 'end';
            toggleCalendar(calendarType);
        });
    });
    
    document.querySelectorAll('button[onclick*="toggleCalendar"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const calendarType = button.getAttribute('onclick').includes('start') ? 'start' : 'end';
            toggleCalendar(calendarType);
        });
    });
    
    document.querySelectorAll('button[onclick*="navigateCalendar"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const onclick = button.getAttribute('onclick');
            const calendarType = onclick.includes('start') ? 'start' : 'end';
            const direction = onclick.includes('prev') ? 'prev' : 'next';
            navigateCalendar(calendarType, direction);
        });
    });
    
    document.querySelectorAll('button[onclick*="setToday"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const calendarType = button.getAttribute('onclick').includes('start') ? 'start' : 'end';
            setToday(calendarType);
        });
    });
    
    document.querySelectorAll('button[onclick*="closeCalendar"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const calendarType = button.getAttribute('onclick').includes('start') ? 'start' : 'end';
            closeCalendar(calendarType);
        });
    });
    
    // Month selection buttons
    const selectAllMonthsBtn = document.querySelector('button[onclick*="selectAllMonths"]');
    if (selectAllMonthsBtn) {
        selectAllMonthsBtn.addEventListener('click', selectAllMonths);
    }
    
    const clearMonthSelectionBtn = document.querySelector('button[onclick*="clearMonthSelection"]');
    if (clearMonthSelectionBtn) {
        clearMonthSelectionBtn.addEventListener('click', clearMonthSelection);
    }
    
    const agentSearch = document.getElementById('agentSearch');
    if (agentSearch) {
        agentSearch.addEventListener('keyup', filterAgents);
        agentSearch.addEventListener('focus', showAgentSuggestions);
        agentSearch.addEventListener('blur', (e) => {
            // Delay hiding suggestions to allow clicks
            setTimeout(() => hideAgentSuggestions(e), 200);
        });
    }
    
    // Checkboxes
    const showWeekTotals = document.getElementById('showWeekTotals');
    if (showWeekTotals) {
        showWeekTotals.addEventListener('change', renderPlannerTable);
    }
    
    const highlightWeekends = document.getElementById('highlightWeekends');
    if (highlightWeekends) {
        highlightWeekends.addEventListener('change', renderPlannerTable);
    }
    
    const compactView = document.getElementById('compactView');
    if (compactView) {
        compactView.addEventListener('change', toggleCompactView);
    }
    
    // Filter buttons
    const resetFiltersBtn = document.querySelector('button[onclick*="resetFilters"]');
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', resetFilters);
    }
    
    const applyFiltersBtn = document.querySelector('button[onclick*="applyFilters"]');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
    }

    // Planner Action Buttons
    const exportBtn = document.querySelector('button[onclick*="exportToCSV"]');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToCSV);
    }
    
    const saveBtn = document.querySelector('button[onclick*="savePlannerChanges"]');
    if (saveBtn) {
        saveBtn.addEventListener('click', savePlannerChanges);
    }

    // Productivity chart buttons
    document.querySelectorAll('button[onclick*="changeProductivityView"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const onclick = button.getAttribute('onclick');
            const match = onclick.match(/changeProductivityView\('([^']+)'\)/);
            if (match) {
                changeProductivityView(match[1]);
            }
        });
    });

    // Edit Modal
    const editModal = document.getElementById('editModal');
    const editModalClose = document.querySelector('.edit-modal-close');
    
    if (editModalClose) {
        editModalClose.addEventListener('click', closeEditModal);
    }
    
    // Edit options
    document.querySelectorAll('.edit-option').forEach(option => {
        option.addEventListener('click', () => {
            const editType = option.dataset.type;
            if (editType) {
                selectEditType(editType);
            }
        });
    });
    
    // Save button in modal
    const saveButton = document.getElementById('saveButton');
    if (saveButton) {
        saveButton.addEventListener('click', saveModalChanges);
    }
    
    // Cancel button in modal
    const cancelButton = document.querySelector('.edit-actions .btn-secondary');
    if (cancelButton) {
        cancelButton.addEventListener('click', closeEditModal);
    }
    
    // Selection counter edit button
    const selectionCounterEditBtn = document.querySelector('#selectionCounter button');
    if (selectionCounterEditBtn) {
        selectionCounterEditBtn.addEventListener('click', openEditModal);
    }
    
    // Team allocation inputs (will be set up when modal is opened)
    document.addEventListener('input', (e) => {
        if (e.target.matches('#teamAllocation input[type="number"]')) {
            updateTotalHours();
        }
    });
    
    // Click outside modal to close
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) {
                closeEditModal();
            }
        });
    }
}

// Global Event Listeners
function setupGlobalEventListeners() {
    // Window resize handler
    window.addEventListener('resize', handleWindowResize);
    
    // Online/offline status
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);
    
    // Page visibility change
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Before unload warning
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Global click handler for modals and dropdowns
    document.addEventListener('click', (e) => {
        // Close language menu when clicking outside
        if (!e.target.closest('.language-selector')) {
            const menu = document.getElementById('languageMenu');
            const dropdown = document.querySelector('.language-dropdown');
            if (menu) menu.classList.remove('open');
            if (dropdown) dropdown.classList.remove('open');
        }
        
        // Close edit modal when clicking outside
        if (e.target.classList.contains('edit-modal')) {
            closeEditModal();
        }
        
        // Close calendar widgets when clicking outside
        if (!e.target.closest('.date-input-with-calendar')) {
            document.querySelectorAll('.calendar-widget').forEach(cal => {
                cal.classList.remove('active');
            });
        }
    });
    
    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape key to close modals
        if (e.key === 'Escape') {
            closeEditModal();
            
            // Close language menu
            const menu = document.getElementById('languageMenu');
            const dropdown = document.querySelector('.language-dropdown');
            if (menu) menu.classList.remove('open');
            if (dropdown) dropdown.classList.remove('open');
        }
        
        // Ctrl+S to save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            savePlannerChanges();
        }
    });
}

// Event Handlers
function handleWindowResize() {
    // Update responsive elements
    updateResponsiveElements();
    
    // Recalculate chart dimensions if needed
    if (window.Chart) {
        Object.values(window.Chart.instances).forEach(chart => {
            if (chart && chart.resize) {
                chart.resize();
            }
        });
    }
}

function handleOnlineStatus() {
    console.log('Application is online');
    // Update UI to show online status
}

function handleOfflineStatus() {
    console.log('Application is offline');
    showErrorMessage('You are currently offline. Some features may not work properly.');
}

function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        // Page became visible - refresh data if needed
        console.log('Page became visible');
    } else {
        // Page became hidden - pause animations, etc.
        console.log('Page became hidden');
    }
}

function handleBeforeUnload(event) {
    // Check if there are unsaved changes
    if (hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return event.returnValue;
    }
}

function updateResponsiveElements() {
    // Update table layouts for different screen sizes
    const tables = document.querySelectorAll('.planner-table');
    tables.forEach(table => {
        if (window.innerWidth < 768) {
            table.classList.add('mobile-view');
        } else {
            table.classList.remove('mobile-view');
        }
    });
}

function hasUnsavedChanges() {
    // Check if there are any unsaved changes in the planner
    return false; // Placeholder - implement actual check
}

function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message temporary-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
        position: fixed;
        top: 2rem;
        right: 2rem;
        background: rgba(244, 67, 54, 0.9);
        color: white;
        padding: 1rem 2rem;
        border-radius: 8px;
        font-weight: 600;
        z-index: 2000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function monitorPerformance() {
    const loadTime = Date.now() - appState.performanceStartTime;
    console.log(`Application loaded in ${loadTime}ms`);
    
    // Monitor memory usage if available
    if (performance.memory) {
        console.log('Memory usage:', {
            used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
            total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB'
        });
    }
}

// Initialize the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
} 