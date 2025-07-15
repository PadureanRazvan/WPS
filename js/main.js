// js/main.js

// Application Entry Point
import { initializeCharts, changeProductivityView } from './charts.js';
import { 
    initializePlanner, 
    cleanupPlanner, // Import the new cleanup function
    deleteAgent, // Import delete function for agent removal
    applyPresetRange, 
    setRangeType, 
    toggleMonth, 
    selectAllMonths, 
    clearMonthSelection, 
    toggleTeam, 
    filterAgents, 
    toggleCompactView, 
    resetFilters, 
    applyFiltersAndRender, 
    setAgentSearchTerm,
    setViewOption,
    exportToCSV,
    renderPlannerTable,
    clearSelection // Import the clearSelection function
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

// Main initialization function (Modified)
async function initializeApp() {
    if (appState.initialized) return;
    
    console.log('Initializing Sherpa Application...');
    
    // REMOVED: await uploadAllAgents(); // This is no longer needed.

    try {
        // Initialize all modules
        initializeThemeAndLanguage();
        initializeCharts();
        
        // This now sets up the real-time listener but doesn't block.
        // The UI will render once data is received from Firestore.
        initializePlanner(); 
        
        // --- Set default date range for planner ---
        // This ensures the planner starts with a default state that matches the UI
        const presetSelect = document.getElementById('presetRange');
        if (presetSelect) {
            presetSelect.value = 'current-month'; // Set the dropdown to the default
            applyPresetRange(); // Apply this default range to the state and re-render
        }
        // --- End of default date range setup ---
        
        setupEventListeners();
        initializeUI();
        setupGlobalEventListeners();
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
                // Pass the sectionId and the clicked element itself (item)
                showSection(sectionId, item); 
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
    
    // Month grid handlers
    const monthGrid = document.getElementById('monthGrid');
    if (monthGrid) {
        monthGrid.addEventListener('click', (e) => {
            const monthButton = e.target.closest('.month-button');
            if (monthButton) {
                const monthKey = monthButton.dataset.month;
                if (monthKey) {
                    toggleMonth(monthKey);
                }
            }
        });
    }
    
    // Agent Search
    const agentSearch = document.getElementById('agentSearch');
    if (agentSearch) {
        agentSearch.addEventListener('input', (e) => {
            // Update the search term in plannerState
            setAgentSearchTerm(e.target.value);
            filterAgents();
            applyFiltersAndRender(); // Re-render automatically
        });
    }
    
    // View Options
    document.querySelectorAll('.view-options input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const option = e.target.id; // e.g., 'highlightWeekends'
            const isChecked = e.target.checked;
            
            switch(option) {
                case 'highlightWeekends':
                    setViewOption('highlightWeekends', isChecked);
                    break;
                case 'compactView':
                    toggleCompactView();
                    return; // toggleCompactView already calls applyFiltersAndRender
            }
            // Re-render the table with the new view options
            applyFiltersAndRender();
        });
    });
    

    
    const applyMultiMonthBtn = document.getElementById('applyMultiMonthBtn');
    if (applyMultiMonthBtn) {
        applyMultiMonthBtn.addEventListener('click', applyFiltersAndRender);
    }
    
    // Modal Event Listeners
    const editModal = document.getElementById('editModal');
    if (editModal) {
        // Edit Modal Open (from selection counter)
        const editSelectionBtn = document.getElementById('editSelectionBtn');
        if (editSelectionBtn) {
            editSelectionBtn.addEventListener('click', openEditModal);
        }
        
        // Cancel Selection Button
        const cancelSelectionBtn = document.getElementById('cancelSelectionBtn');
        if (cancelSelectionBtn) {
            cancelSelectionBtn.addEventListener('click', clearSelection);
        }
        
        // Edit Modal Close
        const closeBtn = document.querySelector('.edit-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeEditModal);
        }
        
        // Edit Options
        document.querySelectorAll('.edit-option').forEach(option => {
            option.addEventListener('click', () => {
                const type = option.dataset.type;
                if (type) {
                    selectEditType(type);
                }
            });
        });
        
        // Save Changes
        const saveButton = document.getElementById('saveButton');
        if (saveButton) {
            saveButton.addEventListener('click', saveModalChanges);
        }
        
        // Cancel Button
        const cancelBtn = document.querySelector('.edit-actions .btn-secondary');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeEditModal);
        }
        
        // Team allocation inputs
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('team-input')) {
                updateTotalHours();
            }
        });
    }
    
    // Productivity Chart Controls
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = btn.textContent.toLowerCase();
            changeProductivityView(view);
        });
    });
    
    // Month Selection (Multi-month view)
    const selectAllBtn = document.querySelector('.month-actions .btn-ghost:first-child');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', selectAllMonths);
    }
    
    const clearSelectionBtn = document.querySelector('.month-actions .btn-ghost:last-child');
    if (clearSelectionBtn) {
        clearSelectionBtn.addEventListener('click', clearMonthSelection);
    }
    
    // Agent Delete Button Listener will be handled in addCellEventListeners after table render
}

// Global Event Listeners
function setupGlobalEventListeners() {
    // Window resize handler
    window.addEventListener('resize', handleWindowResize);
    
    // Scroll handler for header behavior
    window.addEventListener('scroll', handleScroll);
    
    // Online/offline detection
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);
    
    // Visibility change (tab switching)
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Before unload (warn about unsaved changes)
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape key to close modals
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.edit-modal.active');
            if (activeModal) {
                closeEditModal();
            } else {
                // If no modal is open, let Escape clear the current selection
                clearSelection(); // NEW: Add this for better UX
            }
        }
        
        // Ctrl+S to save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            // savePlannerChanges(); // Function removed - changes are saved via edit modal
        }
        
        // Ctrl+E to export
        if (e.ctrlKey && e.key === 'e') {
            e.preventDefault();
            exportToCSV();
        }
    });
    
    // Click outside to close dropdowns
    document.addEventListener('click', (e) => {
        // Close language menu
        const languageMenu = document.getElementById('languageMenu');
        if (languageMenu && !languageMenu.parentElement.contains(e.target)) {
            languageMenu.classList.remove('visible');
        }

        // Close agent suggestions
        if (!e.target.closest('.agent-search-container')) {
        }
    });
}

// Event Handlers
function handleWindowResize() {
    // Update responsive elements
    updateResponsiveElements();
    
    // Recalculate chart dimensions if needed
    if (typeof window.Chart !== 'undefined') {
        Object.values(Chart.instances).forEach(chart => {
            if (chart) chart.resize();
        });
    }
}

function handleScroll() {
    const header = document.querySelector('.header');
    if (header) {
        const scrolled = window.scrollY > 20;
        header.classList.toggle('scrolled', scrolled);
    }
}

function handleOnlineStatus() {
    console.log('Application is online');
    // Could show a notification or update UI
}

function handleOfflineStatus() {
    console.log('Application is offline');
    // Could show offline indicator
}

function handleVisibilityChange() {
    if (document.hidden) {
        console.log('Application is hidden (tab switched)');
        // Could pause certain operations
    } else {
        console.log('Application is visible');
        // Could resume operations or refresh data
    }
}

function handleBeforeUnload(event) {
    // Only show warning if there are unsaved changes
    if (hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = '';
        return '';
    }
}

function updateResponsiveElements() {
    // Update sidebar state based on window size
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth < 768) {
        sidebar.classList.add('collapsed');
    } else {
        sidebar.classList.remove('collapsed');
    }
}

function hasUnsavedChanges() {
    // Check if there are any unsaved changes
    return false; // Placeholder - implement actual logic
}

function showErrorMessage(message) {
    // Create error notification
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <div class="error-content">
            <svg class="error-icon" viewBox="0 0 24 24" width="24" height="24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>${message}</span>
            <button class="error-close">&times;</button>
        </div>
    `;
    
    document.body.appendChild(errorDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
    
    // Manual close
    errorDiv.querySelector('.error-close').addEventListener('click', () => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    });
}

// Performance monitoring
function monitorPerformance() {
    const loadTime = Date.now() - appState.performanceStartTime;
    console.log(`%cApplication loaded in ${loadTime}ms`, 'color: #4caf50; font-weight: bold;');
    
    // Monitor memory usage (if available)
    if (performance.memory) {
        const memory = performance.memory;
        console.log(`Memory usage: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
    }
}

// Add a cleanup function for when the window is closed
window.addEventListener('beforeunload', cleanupPlanner);

// Initialize the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
} 