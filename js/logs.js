// js/logs.js — Activity Logging Module
import { db } from './firebase-config.js';
import { collection, addDoc, query, orderBy, limit, getDocs, Timestamp, where } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { translations } from './config.js';
import { renderActivityLogStatus, renderActivityLogView } from './logs-view.js?v=2026.07.15.15';

function getLang() { return localStorage.getItem('language') || 'ro'; }
function t(key) { const l = getLang(); return (translations[l] && translations[l][key]) || key; }

const LOGS_COLLECTION = 'activity_logs';
let currentUser = null;

// --- Log an activity ---
export async function logActivity(type, action, details = {}) {
    try {
        await addDoc(collection(db, LOGS_COLLECTION), {
            type,           // 'auth', 'ai', 'portal'
            action,         // 'login', 'logout', 'set_cell', 'add_agent', 'delete_agent', 'navigate', etc.
            details,        // { agentName, day, value, ... }
            user: currentUser ? {
                email: currentUser.email || '',
                name: currentUser.displayName || '',
                uid: currentUser.uid || ''
            } : null,
            timestamp: Timestamp.now()
        });
    } catch (err) {
        console.error('[Logs] Could not write log:', err.message || err);
    }
}

export function setLogUser(user) {
    currentUser = user;
}

// --- Fetch logs for display ---
export async function fetchLogs(filterType = 'all', limitCount = 100) {
    try {
        let q;
        if (filterType && filterType !== 'all') {
            q = query(
                collection(db, LOGS_COLLECTION),
                where('type', '==', filterType),
                orderBy('timestamp', 'desc'),
                limit(limitCount)
            );
        } else {
            q = query(
                collection(db, LOGS_COLLECTION),
                orderBy('timestamp', 'desc'),
                limit(limitCount)
            );
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
        console.error('[Logs] Could not fetch logs:', err.message || err);
        return [];
    }
}

// --- Render logs UI ---
export async function renderLogsSection() {
    const container = document.getElementById('logsContent');
    if (!container) return;

    container.setAttribute('aria-busy', 'true');
    renderActivityLogStatus(container, t('logs-loading'));

    try {
        const filterType = document.getElementById('logsFilter')?.value || 'all';
        const logs = await fetchLogs(filterType);

        if (logs.length === 0) {
            renderActivityLogStatus(container, t('logs-empty'), 'empty');
            return;
        }

        const locale = { ro: 'ro-RO', en: 'en-US', it: 'it-IT' }[getLang()] || 'ro-RO';
        const entries = logs.map(log => buildActivityEntry(log, locale));

        renderActivityLogView(container, entries, {
            list: t('logs-list-label'),
            time: t('logs-time'),
            user: t('logs-user'),
            type: t('logs-type'),
            action: t('logs-action'),
            details: t('logs-details')
        });
    } finally {
        container.setAttribute('aria-busy', 'false');
    }
}

function getTypeLabel(type) {
    const labels = { auth: 'Auth', ai: 'AI', portal: 'Portal' };
    return labels[type] || type;
}

function buildActivityEntry(log, locale) {
    const date = log.timestamp?.toDate?.();
    const hasValidDate = date instanceof Date && !Number.isNaN(date.getTime());
    const dayKey = hasValidDate
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        : 'unknown';

    return {
        dayKey,
        dayLabel: hasValidDate
            ? date.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
            : t('logs-date-unknown'),
        dateTime: hasValidDate ? date.toISOString() : '',
        timeLabel: hasValidDate
            ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
            : '—',
        user: log.user?.name || log.user?.email || '—',
        type: log.type,
        typeLabel: getTypeLabel(log.type),
        action: log.action || '—',
        details: formatDetails(log.details) || '—'
    };
}

function formatDetails(details) {
    if (!details || typeof details !== 'object') return '';
    return Object.entries(details)
        .filter(([k, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
}

// --- Initialize ---
export function initializeLogs() {
    const filterEl = document.getElementById('logsFilter');
    if (filterEl) {
        filterEl.addEventListener('change', () => renderLogsSection());
    }
    const refreshBtn = document.getElementById('logsRefreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => renderLogsSection());
    }
}
