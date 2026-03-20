// js/main.js

// --- Core Application Imports ---
import { initializePlanner, cleanupPlanner, clearSelection } from './planner.js';
import { initializeUsers, cleanupUsers } from './users.js';
import { initializeProductivity, cleanupProductivity } from './productivity.js';
import { initializeReports, cleanupReports } from './reports.js';
import { initializeCharts } from './charts.js';
import { updateAverageProductivityCard } from './dashboard.js';
import { setTheme, updateLanguageUI, showSection, openEditModal, translatePage, selectEditType, saveModalChanges, closeEditModal, toggleSidebar } from './ui.js';
import { initLogoAnimation } from './logo-animation.js';
import { loginWithGoogle, logout, onAuthChange } from './auth.js';

// --- Global State ---
let currentLanguage = localStorage.getItem('language') || 'ro';
let appInitialized = false;

/**
 * Main application initialization function.
 * This function is the entry point for the application. It sets up the theme,
 * initializes all the main modules (Planner, Users, Dashboard), and sets up
 * the core UI event listeners.
 */
async function initializeApp() {
    if (appInitialized) return; // Prevent double initialization
    appInitialized = true;

    console.log("🚀 Sherpa App Initializing...");

    // Set theme from local storage or default to 'dark'
    setTheme(localStorage.getItem('theme') || 'dark');

    // Initialize modules that depend on Firestore data
    initializePlanner();
    initializeUsers();
    await initializeProductivity();
    updateAverageProductivityCard(); // Update after productivity data is loaded
    initializeCharts(); // After productivity so chart has real data
    initializeReports();

    // Initialize core UI elements and event listeners
    initializeUI();
    initLogoAnimation();

    console.log("✅ Sherpa App Initialized Successfully.");
}

/**
 * Show login screen, hide app
 */
function showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const appContainer = document.getElementById('appContainer');
    if (loginScreen) loginScreen.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
}

/**
 * Show app, hide login screen, and populate user info
 */
function showApp(user) {
    const loginScreen = document.getElementById('loginScreen');
    const appContainer = document.getElementById('appContainer');
    if (loginScreen) loginScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = '';

    // Update sidebar user info
    const avatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    if (avatar) {
        avatar.src = user.photoURL || '';
        avatar.style.display = user.photoURL ? 'block' : 'none';
    }
    if (userName) userName.textContent = user.displayName || 'User';
    if (userEmail) userEmail.textContent = user.email || '';
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
        languageDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            languageMenu.classList.toggle('open');
            languageDropdown.classList.toggle('open');
        });
    }
    if (languageMenu) {
        languageMenu.addEventListener('click', (e) => {
            const target = e.target.closest('.language-option');
            if (target) {
                currentLanguage = target.dataset.lang;
                updateLanguageUI(currentLanguage);
                languageMenu.classList.remove('open');
                languageDropdown.classList.remove('open');
            }
        });
    }

    // Initial translation — full UI update (flag, active option, all text)
    updateLanguageUI(currentLanguage);
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

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await logout();
            appInitialized = false;
        });
    }
}

// --- Lifecycle Event Listeners ---

// Start the authentication flow once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set theme immediately so login screen looks correct
    setTheme(localStorage.getItem('theme') || 'dark');

    // Init login screen logo animation
    initLogoAnimation('loginLogo', 100);

    // Set up Google login button
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', loginWithGoogle);
    }

    // Listen for auth state changes
    onAuthChange(
        // On login
        async (user) => {
            showApp(user);
            await initializeApp();
        },
        // On logout
        () => {
            showLoginScreen();
            // Clean up listeners
            cleanupPlanner();
            cleanupUsers();
            cleanupProductivity();
            cleanupReports();
        }
    );
});

// Clean up Firestore listeners when the user leaves the page to prevent memory leaks
window.addEventListener('beforeunload', () => {
    cleanupPlanner();
    cleanupUsers();
    cleanupProductivity();
    cleanupReports();
}); 