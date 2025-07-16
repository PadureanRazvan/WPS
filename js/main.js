// js/main.js

// --- Core Application Imports ---
import { initializePlanner, cleanupPlanner, clearSelection } from './planner.js';
import { initializeUsers, cleanupUsers } from './users.js';
import { initializeCharts } from './charts.js';
import { setTheme, updateLanguageUI, showSection, openEditModal, translatePage, selectEditType, saveModalChanges, closeEditModal, toggleSidebar } from './ui.js';

// --- Global State ---
let currentLanguage = 'ro';

/**
 * Main application initialization function.
 * This function is the entry point for the application. It sets up the theme,
 * initializes all the main modules (Planner, Users, Dashboard), and sets up
 * the core UI event listeners.
 */
async function initializeApp() {
    console.log("🚀 Sherpa App Initializing...");
    
    // Set theme from local storage or default to 'dark'
    setTheme(localStorage.getItem('theme') || 'dark');
    
    // Initialize modules that depend on Firestore data
    initializePlanner();
    initializeUsers();
    initializeCharts();
    
    // Initialize core UI elements and event listeners
    initializeUI();
    
    console.log("✅ Sherpa App Initialized Successfully.");
}

/**
 * Sets up core UI event listeners for navigation, theme toggling, 
 * and language selection.
 */
function initializeUI() {
    // Navigation menu
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.dataset.tooltip;
            showSection(sectionId, item);
        });
    });

    // Theme toggle button
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const newTheme = current === 'dark' ? 'light' : 'dark';
            setTheme(newTheme);
        });
    }

    // Language selector dropdown
    const languageDropdown = document.querySelector('.language-dropdown');
    const languageMenu = document.getElementById('languageMenu');
    if (languageDropdown) {
        languageDropdown.addEventListener('click', () => {
            languageMenu.classList.toggle('visible');
        });
    }
    if (languageMenu) {
        languageMenu.addEventListener('click', (e) => {
            const target = e.target.closest('.language-option');
            if (target) {
                currentLanguage = target.dataset.lang;
                updateLanguageUI(currentLanguage);
                languageMenu.classList.remove('visible');
            }
        });
    }

    // Initial translation
    translatePage(currentLanguage);
    // Selection counter buttons
    const editBtn = document.getElementById('editSelectionBtn');
    if (editBtn) {
        editBtn.addEventListener('click', openEditModal);
    }
    const cancelBtn = document.getElementById('cancelSelectionBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', clearSelection);
    }

    // Modal event listeners
    document.querySelectorAll('.edit-option').forEach(option => {
        option.addEventListener('click', () => selectEditType(option.dataset.type));
    });
    const closeModalBtn = document.querySelector('.edit-modal-close');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeEditModal);
    }
    const saveBtn = document.getElementById('saveButton');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveModalChanges);
    }
    const cancelModalBtn = document.querySelector('.edit-actions .btn-secondary');
    if (cancelModalBtn) {
        cancelModalBtn.addEventListener('click', closeEditModal);
    }

    // Sidebar toggle
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }
}

// --- Lifecycle Event Listeners ---

// Start the application once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Clean up Firestore listeners when the user leaves the page to prevent memory leaks
window.addEventListener('beforeunload', () => {
    cleanupPlanner();
    cleanupUsers();
}); 