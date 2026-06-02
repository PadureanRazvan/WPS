// js/main.js

// --- Core Application Imports ---
import { initializePlanner, cleanupPlanner, clearSelection, undoLastChange } from './planner.js';
import { initializeUsers, cleanupUsers } from './users.js';
import { initializeProductivity, cleanupProductivity } from './productivity.js';
import { initializeSchedule, cleanupSchedule } from './schedule.js';
import { initializeReports, cleanupReports } from './reports.js';
import { initializeCharts, initializeProductivityChart } from './charts.js';
import { updateAverageProductivityCard } from './dashboard.js';
import { setTheme, updateLanguageUI, showSection, openEditModal, selectEditType, saveModalChanges, closeEditModal, toggleSidebar } from './ui.js';
import { bindPlannerControlInteractions } from './planner-interaction-wiring.js';
import {
    bindAppLifecycleEvents,
    bindAppRefreshEvents,
    bindAppShellInteractions,
    showAuthenticatedShell,
    showLoginScreen
} from './app-shell-wiring.js';
import { initLogoAnimation } from './logo-animation.js';
import { initializeChat, cleanupChat } from './chat.js';
import { loginWithGoogle, logout, onAuthChange } from './auth.js';
import { initializeLogs, setLogUser, logActivity } from './logs.js';
import { applyDailyGreeting } from './daily-greeting.js';

// --- Daily Greeting (local rotation, no async overwrite) ---
function setDynamicGreeting() {
    applyDailyGreeting(document);
}

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

    // Set dynamic greeting message
    setDynamicGreeting();

    // Set theme from local storage or default to 'dark'
    setTheme(localStorage.getItem('theme') || 'dark');

    // Initialize modules that depend on Firestore data
    initializePlanner();
    initializeUsers();
    await initializeProductivity();
    updateAverageProductivityCard(); // Update after productivity data is loaded
    initializeCharts(); // After productivity so chart has real data
    bindAppRefreshEvents({
        eventTarget: document,
        actions: {
            updateAverageProductivityCard,
            initializeProductivityChart
        }
    });
    initializeReports();
    initializeLogs();
    initializeSchedule();

    // Initialize core UI elements and event listeners
    bindAppShellInteractions({
        root: document,
        actions: {
            showSection,
            setTheme,
            updateLanguageUI,
            bindPlannerControls: () => bindPlannerControlInteractions({
                root: document,
                documentTarget: document,
                actions: {
                    openEditModal,
                    clearSelection,
                    selectEditType,
                    closeEditModal,
                    saveModalChanges,
                    undoLastChange
                }
            }),
            toggleSidebar,
            logout,
            setAppInitialized: value => { appInitialized = value; }
        },
        getCurrentLanguage: () => currentLanguage,
        setCurrentLanguage: value => { currentLanguage = value; }
    });
    initLogoAnimation();
    await initializeChat();

    console.log("✅ Sherpa App Initialized Successfully.");
}

// --- Lifecycle Event Listeners ---

// Start the authentication flow once the DOM is fully loaded
bindAppLifecycleEvents({
    root: document,
    windowTarget: window,
    storage: localStorage,
    actions: {
        setTheme,
        setDynamicGreeting,
        initLogoAnimation,
        loginWithGoogle,
        onAuthChange,
        onLogin: async (user) => {
            showAuthenticatedShell(user, document);
            setLogUser(user);
            await initializeApp();
            logActivity('auth', 'login', { email: user.email, name: user.displayName || '' });
        },
        onLogout: () => {
            logActivity('auth', 'logout');
            setLogUser(null);
            showLoginScreen(document);
            // Clean up listeners
            cleanupPlanner();
            cleanupUsers();
            cleanupProductivity();
            cleanupReports();
            cleanupSchedule();
            cleanupChat();
        },
        cleanupBeforeUnload: () => {
            cleanupPlanner();
            cleanupUsers();
            cleanupProductivity();
            cleanupReports();
            cleanupSchedule();
        }
    }
});
