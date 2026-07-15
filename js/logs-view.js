const DEFAULT_LABELS = Object.freeze({
    list: 'Recent activity',
    time: 'Time',
    user: 'User',
    type: 'Type',
    action: 'Action',
    details: 'Details'
});

const KNOWN_TYPES = new Set(['auth', 'ai', 'portal']);

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function normalizeLabels(labels = {}) {
    return { ...DEFAULT_LABELS, ...labels };
}

function normalizeEntry(entry = {}) {
    const type = KNOWN_TYPES.has(entry.type) ? entry.type : 'other';

    return {
        dayKey: entry.dayKey || 'unknown',
        dayLabel: entry.dayLabel || '—',
        dateTime: entry.dateTime || '',
        timeLabel: entry.timeLabel || '—',
        user: entry.user || '—',
        type,
        typeLabel: entry.typeLabel || entry.type || '—',
        action: entry.action || '—',
        details: entry.details || '—'
    };
}

function groupEntries(entries = []) {
    const groups = new Map();

    entries.map(normalizeEntry).forEach(entry => {
        if (!groups.has(entry.dayKey)) {
            groups.set(entry.dayKey, {
                label: entry.dayLabel,
                entries: []
            });
        }
        groups.get(entry.dayKey).entries.push(entry);
    });

    return [...groups.values()];
}

function buildEntryHtml(entry, index, labels) {
    const titleId = `activity-entry-title-${index}`;
    const dateTimeAttribute = entry.dateTime ? ` datetime="${escapeHtml(entry.dateTime)}"` : '';
    const revealIndex = Math.min(index, 8);

    return `
                    <li class="activity-entry" style="--activity-index: ${revealIndex}">
                        <article class="activity-entry-card" aria-labelledby="${titleId}">
                            <time class="activity-entry-time"${dateTimeAttribute}>
                                <span class="activity-field-label">${escapeHtml(labels.time)}</span>
                                <span>${escapeHtml(entry.timeLabel)}</span>
                            </time>
                            <div class="activity-entry-user">
                                <span class="activity-field-label">${escapeHtml(labels.user)}</span>
                                <span class="activity-field-value">${escapeHtml(entry.user)}</span>
                            </div>
                            <div class="activity-entry-type">
                                <span class="activity-field-label">${escapeHtml(labels.type)}</span>
                                <span class="activity-type-badge activity-type-badge--${entry.type}">${escapeHtml(entry.typeLabel)}</span>
                            </div>
                            <div class="activity-entry-action">
                                <span class="activity-field-label">${escapeHtml(labels.action)}</span>
                                <strong id="${titleId}" class="activity-field-value">${escapeHtml(entry.action)}</strong>
                            </div>
                            <div class="activity-entry-details">
                                <span class="activity-field-label">${escapeHtml(labels.details)}</span>
                                <span class="activity-field-value">${escapeHtml(entry.details)}</span>
                            </div>
                        </article>
                    </li>`;
}

export function buildActivityLogHtml(entries = [], labels = {}) {
    const normalizedLabels = normalizeLabels(labels);
    let entryIndex = 0;

    const groupsHtml = groupEntries(entries).map((group, groupIndex) => {
        const headingId = `activity-day-heading-${groupIndex}`;
        const entriesHtml = group.entries.map(entry => buildEntryHtml(entry, entryIndex++, normalizedLabels)).join('');

        return `
            <section class="activity-day-group" aria-labelledby="${headingId}">
                <h3 id="${headingId}" class="activity-day-heading">${escapeHtml(group.label)}</h3>
                <ol class="activity-day-list">${entriesHtml}
                </ol>
            </section>`;
    }).join('');

    return `
        <div class="activity-log" aria-label="${escapeHtml(normalizedLabels.list)}">
            <div class="activity-log-key" aria-hidden="true">
                <span>${escapeHtml(normalizedLabels.time)}</span>
                <span>${escapeHtml(normalizedLabels.user)}</span>
                <span>${escapeHtml(normalizedLabels.type)}</span>
                <span>${escapeHtml(normalizedLabels.action)}</span>
                <span>${escapeHtml(normalizedLabels.details)}</span>
            </div>${groupsHtml}
        </div>`;
}

export function buildActivityLogStatusHtml(message, state = 'loading') {
    const normalizedState = state === 'empty' ? 'empty' : 'loading';
    return `<div class="activity-status activity-status--${normalizedState}" role="status">${escapeHtml(message)}</div>`;
}

export function renderActivityLogView(container, entries = [], labels = {}) {
    if (!container) return;
    container.innerHTML = buildActivityLogHtml(entries, labels);
}

export function renderActivityLogStatus(container, message, state = 'loading') {
    if (!container) return;
    container.innerHTML = buildActivityLogStatusHtml(message, state);
}
