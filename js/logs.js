// js/logs.js — Activity Logging Module
import { db } from './firebase-config.js';
import { collection, addDoc, query, orderBy, limit, getDocs, Timestamp, where } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { translations } from './config.js';

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

    container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">${t('logs-loading')}</div>`;

    const filterType = document.getElementById('logsFilter')?.value || 'all';
    const logs = await fetchLogs(filterType);

    if (logs.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">${t('logs-empty')}</div>`;
        return;
    }

    const locale = { ro: 'ro-RO', en: 'en-US', it: 'it-IT' }[getLang()] || 'ro-RO';

    let html = `<div class="chart-container" style="overflow-x: auto;">
        <table class="users-table" style="width: 100%;">
            <thead>
                <tr>
                    <th>${t('logs-time')}</th>
                    <th>${t('logs-user')}</th>
                    <th>${t('logs-type')}</th>
                    <th>${t('logs-action')}</th>
                    <th>${t('logs-details')}</th>
                </tr>
            </thead>
            <tbody>`;

    logs.forEach(log => {
        const time = log.timestamp?.toDate?.()
            ? log.timestamp.toDate().toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '—';
        const user = log.user?.name || log.user?.email || '—';
        const typeLabel = getTypeLabel(log.type);
        const typeBadge = getTypeBadge(log.type);
        const actionLabel = log.action || '—';
        const details = formatDetails(log.details);

        html += `<tr>
            <td style="white-space: nowrap; font-size: 0.82rem; color: var(--text-secondary);">${time}</td>
            <td style="font-size: 0.85rem;">${escapeHtml(user)}</td>
            <td>${typeBadge}</td>
            <td style="font-size: 0.85rem; font-weight: 500;">${escapeHtml(actionLabel)}</td>
            <td style="font-size: 0.82rem; color: var(--text-secondary); max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(details)}</td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function getTypeLabel(type) {
    const labels = { auth: 'Auth', ai: 'AI', portal: 'Portal' };
    return labels[type] || type;
}

function getTypeBadge(type) {
    const colors = {
        auth: 'background: rgba(91,185,140,0.15); color: var(--success);',
        ai: 'background: rgba(232,168,73,0.15); color: var(--accent);',
        portal: 'background: rgba(91,159,232,0.15); color: #5b9fe8;'
    };
    const style = colors[type] || 'background: rgba(255,255,255,0.08); color: var(--text-secondary);';
    return `<span style="${style} padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">${getTypeLabel(type)}</span>`;
}

function formatDetails(details) {
    if (!details || typeof details !== 'object') return '';
    return Object.entries(details)
        .filter(([k, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
