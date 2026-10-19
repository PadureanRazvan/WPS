// The authenticated workspace loads after the sign-in controls are responsive.
import { initializePlanner, cleanupPlanner, clearSelection, undoLastChange } from './planner.js';
import { initializeUsers, cleanupUsers } from './users.js?v=2026.10.19';
import { initializeProductivity, cleanupProductivity } from './productivity.js?v=2026.10.19';
import { initializeSchedule, cleanupSchedule } from './schedule.js?v=2026.10.19';
import { initializeReports, cleanupReports } from './reports.js?v=2026.10.19';
import { initializeInfoVersion } from './info-version.js?v=2026.10.19';
import { initializeInfoInteractive } from './info-interactive.js';
import { initializeCharts, initializeProductivityChart } from './charts.js?v=2026.10.19';
import { updateAverageProductivityCard } from './dashboard.js?v=2026.10.19';
import { setTheme, updateLanguageUI, showSection, openEditModal, selectEditType, saveModalChanges, closeEditModal, toggleSidebar } from './ui.js?v=2026.10.19';
import { bindPlannerControlInteractions } from './planner-interaction-wiring.js';
import { bindAppRefreshEvents, bindAppShellInteractions } from './app-shell-wiring.js?v=2026.10.19';
import { initLogoAnimation } from './logo-animation.js?v=2026.10.19';
import { initializeChat, cleanupChat } from './chat.js?v=2026.10.19';
import { logout } from './auth.js?v=2026.10.19';
import { initializeLogs, setLogUser, logActivity } from './logs.js?v=2026.10.19';
import { applyDailyGreeting } from './daily-greeting.js';
import { loadWorkspaceLibraries, yieldToInterface } from './app-dependencies.js';

let currentLanguage = localStorage.getItem('language') || 'ro';
let appInitialized = false;
let cleanupShell = null, cleanupRefresh = null, cleanupPlannerControls = null;

export const preloadWorkspaceLibraries = loadWorkspaceLibraries;

export async function initializeApp(user, { isCurrent = () => true } = {}) {
    if (appInitialized) return;
    appInitialized = true;
    setLogUser(user);
    applyDailyGreeting(document);
    setTheme(localStorage.getItem('theme') || 'system');
    cleanupShell = bindAppShellInteractions({
        root: document,
        actions: {
            showSection, setTheme, updateLanguageUI,
            bindPlannerControls: () => {
                cleanupPlannerControls = bindPlannerControlInteractions({
                    root: document,
                    documentTarget: document,
                    actions: { openEditModal, clearSelection, selectEditType, closeEditModal, saveModalChanges, undoLastChange }
                });
            },
            toggleSidebar,
            logout: () => {
                // A slow activity-log write must not trap an offline session.
                logActivity('auth', 'logout');
                return logout();
            },
            setAppInitialized: value => { appInitialized = value; }
        },
        getCurrentLanguage: () => currentLanguage,
        setCurrentLanguage: value => { currentLanguage = value; }
    });
    await loadWorkspaceLibraries();
    if (!isCurrent()) { cleanupApp(); return; }
    initializePlanner();
    initializeUsers();
    await yieldToInterface();
    if (!isCurrent()) { cleanupApp(); return; }
    await initializeProductivity();
    if (!isCurrent()) { cleanupApp(); return; }
    updateAverageProductivityCard();
    initializeCharts();
    cleanupRefresh = bindAppRefreshEvents({ eventTarget: document, actions: { updateAverageProductivityCard, initializeProductivityChart } });
    initializeReports();
    initializeLogs();
    initializeSchedule();
    initializeInfoVersion();
    initializeInfoInteractive();
    initLogoAnimation();
    await initializeChat();
    if (!isCurrent()) { cleanupApp(); return; }
    logActivity('auth', 'login', { email: user.email, name: user.displayName || '' });
    console.log('✅ Sherpa App Initialized Successfully.');
}

export function cleanupApp() {
    appInitialized = false;
    cleanupShell?.(); cleanupShell = null;
    cleanupRefresh?.(); cleanupRefresh = null;
    cleanupPlannerControls?.(); cleanupPlannerControls = null;
    clearSelection(); closeEditModal();
    cleanupPlanner(); cleanupUsers(); cleanupProductivity();
    cleanupReports(); cleanupSchedule(); cleanupChat();
    setLogUser(null);
}
