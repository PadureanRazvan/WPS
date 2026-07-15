import { getProductivityDateStatus } from './productivity-upload-calendar.js';
import { formatProductivityDateKey } from './productivity-calculation.js';

const UPLOAD_LABELS = {
    ro: {
        title: 'Calendar incarcari',
        today: 'Azi',
        noFiles: 'Fara fisiere',
        tickets: 'Tickete',
        calls: 'Apeluri',
        both: 'XLSX si CSV incarcate',
        uploadXlsx: 'Incarca XLSX',
        uploadCsv: 'Incarca CSV',
        exportCsv: 'Export CSV',
        deleteDay: 'Sterge ziua',
        selected: 'Data selectata',
        previous: 'Luna anterioara',
        next: 'Luna urmatoare',
        weekdays: ['lun.', 'mar.', 'mie.', 'joi', 'vin.', 'sam.', 'dum.'],
        weekdayNames: ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică']
    },
    en: {
        title: 'Upload calendar',
        today: 'Today',
        noFiles: 'No files',
        tickets: 'Tickets',
        calls: 'Calls',
        both: 'XLSX and CSV uploaded',
        uploadXlsx: 'Upload XLSX',
        uploadCsv: 'Upload CSV',
        exportCsv: 'Export CSV',
        deleteDay: 'Delete day',
        selected: 'Selected date',
        previous: 'Previous month',
        next: 'Next month',
        weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        weekdayNames: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    },
    it: {
        title: 'Calendario caricamenti',
        today: 'Oggi',
        noFiles: 'Nessun file',
        tickets: 'Ticket',
        calls: 'Chiamate',
        both: 'XLSX e CSV caricati',
        uploadXlsx: 'Carica XLSX',
        uploadCsv: 'Carica CSV',
        exportCsv: 'Esporta CSV',
        deleteDay: 'Elimina giorno',
        selected: 'Data selezionata',
        previous: 'Mese precedente',
        next: 'Mese successivo',
        weekdays: ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'],
        weekdayNames: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']
    }
};

export function getProductivityUploadText(key, lang = 'en') {
    const labels = UPLOAD_LABELS[lang] || UPLOAD_LABELS.en;
    return labels[key] || UPLOAD_LABELS.en[key] || key;
}

export function getProductivityUploadCalendarLocale(lang = 'en') {
    return ({ ro: 'ro-RO', en: 'en-US', it: 'it-IT' })[lang] || 'en-US';
}

export function escapeProductivityUploadHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function getProductivityUploadCalendarDays(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const start = new Date(firstDay);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    start.setDate(firstDay.getDate() - mondayOffset);

    const days = [];
    for (let i = 0; i < 42; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        days.push(date);
    }
    return days;
}

function getStatusLabel(status, lang) {
    if (status.hasTickets && status.hasCalls) return getProductivityUploadText('both', lang);
    if (status.hasTickets) return 'XLSX';
    if (status.hasCalls) return 'CSV';
    return getProductivityUploadText('noFiles', lang);
}

function getStatusMarkers(status) {
    return `
        ${status.hasTickets ? '<span class="upload-calendar-marker marker-xlsx" aria-hidden="true">XLSX</span>' : ''}
        ${status.hasCalls ? '<span class="upload-calendar-marker marker-csv" aria-hidden="true">CSV</span>' : ''}
    `;
}

function defaultFormatDateDisplay(dateKey) {
    const date = new Date(`${dateKey}T00:00:00`);
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function buildProductivityUploadDateStatusView({
    uploadDate,
    entry,
    formatDateDisplay = defaultFormatDateDisplay,
    t = key => key
} = {}) {
    if (!uploadDate) {
        return {
            statusDisplay: 'none',
            filesOpacity: '0.4',
            filesPointerEvents: 'none',
            html: ''
        };
    }

    const dateDisplay = formatDateDisplay(uploadDate);
    const status = getProductivityDateStatus(entry);
    if (status.hasAnyData) {
        return {
            statusDisplay: 'block',
            filesOpacity: '1',
            filesPointerEvents: 'auto',
            html: `<div class="alert alert-warning" style="margin: 0; padding: 0.75rem 1rem;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink: 0;">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>${t('prod-data-for')} <strong>${dateDisplay}</strong> ${t('prod-data-exists')}</span>
        </div>`
        };
    }

    return {
        statusDisplay: 'block',
        filesOpacity: '1',
        filesPointerEvents: 'auto',
        html: `<p style="color: var(--success); margin: 0; font-size: 0.9rem;">${t('prod-date-selected')} <strong>${dateDisplay}</strong> — ${t('prod-can-upload')}</p>`
    };
}

export function buildProductivityUploadSuccessView({
    uploadDate,
    entry,
    formatDateDisplay = defaultFormatDateDisplay,
    t = key => key
} = {}) {
    const hasTickets = entry?.ticketsData && entry.ticketsData.size > 0;
    const hasCalls = entry?.callsData && entry.callsData.size > 0;
    const parts = [];
    if (hasTickets) parts.push(`${entry.ticketsData.size} ${t('prod-agents-from-tickets')}`);
    if (hasCalls) parts.push(`${entry.callsData.size} ${t('prod-agents-from-calls')}`);

    return `<p style="color: var(--success); margin: 0; font-size: 0.9rem;">${t('prod-data-uploaded-for')} <strong>${formatDateDisplay(uploadDate)}</strong>: ${parts.join(', ')}. ${t('prod-can-add-file')}</p>`;
}

export function buildProductivityUploadCalendarView({
    dataByDate = new Map(),
    uploadDate,
    monthDate = new Date(),
    today = new Date(),
    lang = 'en',
    formatDateDisplay = defaultFormatDateDisplay
} = {}) {
    const selectedStatus = getProductivityDateStatus(dataByDate.get(uploadDate));
    const todayKey = formatProductivityDateKey(today);
    const locale = getProductivityUploadCalendarLocale(lang);
    const monthLabel = monthDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    const weekdays = getProductivityUploadText('weekdays', lang);
    const weekdayNames = getProductivityUploadText('weekdayNames', lang);
    const calendarDays = getProductivityUploadCalendarDays(monthDate);
    const dayKeys = calendarDays.map(date => formatProductivityDateKey(date));
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    const focusDateKey = dayKeys.includes(uploadDate)
        ? uploadDate
        : dayKeys.find(dateKey => dateKey.startsWith(`${monthKey}-`)) || dayKeys[0];

    const dayButtons = calendarDays.map((date, index) => {
        const dateKey = dayKeys[index];
        const status = getProductivityDateStatus(dataByDate.get(dateKey));
        const isSelected = dateKey === uploadDate;
        const isToday = dateKey === todayKey;
        const isOtherMonth = date.getMonth() !== monthDate.getMonth();
        const classes = [
            'upload-calendar-day',
            isSelected ? 'selected' : '',
            isToday ? 'today' : '',
            isOtherMonth ? 'other-month' : '',
            status.hasTickets ? 'has-tickets' : '',
            status.hasCalls ? 'has-calls' : '',
            status.isComplete ? 'complete' : ''
        ].filter(Boolean).join(' ');
        const accessibleLabel = `${formatDateDisplay(dateKey)}: ${getStatusLabel(status, lang)}`;

        return `
            <button type="button" class="${classes}" data-date="${dateKey}" tabindex="${dateKey === focusDateKey ? '0' : '-1'}" aria-label="${escapeProductivityUploadHtml(accessibleLabel)}" aria-pressed="${isSelected}" ${isToday ? 'aria-current="date"' : ''} title="${escapeProductivityUploadHtml(accessibleLabel)}">
                <span class="upload-calendar-day-number">${date.getDate()}</span>
                <span class="upload-calendar-markers">${getStatusMarkers(status)}</span>
            </button>
        `;
    }).join('');

    const html = `
        <div class="upload-calendar-toolbar">
            <button type="button" class="upload-calendar-nav" id="uploadCalendarPrev" aria-label="${escapeProductivityUploadHtml(getProductivityUploadText('previous', lang))}" title="${escapeProductivityUploadHtml(getProductivityUploadText('previous', lang))}">&#9664;</button>
            <div>
                <div class="upload-calendar-title">${escapeProductivityUploadHtml(getProductivityUploadText('title', lang))}</div>
                <div class="upload-calendar-month" aria-live="polite" aria-atomic="true">${escapeProductivityUploadHtml(monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1))}</div>
            </div>
            <button type="button" class="upload-calendar-nav" id="uploadCalendarNext" aria-label="${escapeProductivityUploadHtml(getProductivityUploadText('next', lang))}" title="${escapeProductivityUploadHtml(getProductivityUploadText('next', lang))}">&#9654;</button>
        </div>
        <div class="upload-calendar-weekdays">
            ${weekdays.map((day, index) => `<span class="upload-calendar-weekday"><span aria-hidden="true">${escapeProductivityUploadHtml(day)}</span><span class="visually-hidden">${escapeProductivityUploadHtml(weekdayNames[index])}</span></span>`).join('')}
        </div>
        <div class="upload-calendar-grid" role="group" aria-label="${escapeProductivityUploadHtml(monthLabel)}">
            ${dayButtons}
        </div>
        <div class="upload-calendar-detail">
            <div>
                <div class="upload-calendar-detail-label">${escapeProductivityUploadHtml(getProductivityUploadText('selected', lang))}</div>
                <div class="upload-calendar-detail-date">${escapeProductivityUploadHtml(formatDateDisplay(uploadDate))}</div>
                <div class="upload-calendar-detail-status">
                    ${selectedStatus.hasTickets ? `<span class="upload-calendar-pill marker-xlsx">XLSX · ${selectedStatus.ticketAgents}</span>` : ''}
                    ${selectedStatus.hasCalls ? `<span class="upload-calendar-pill marker-csv">CSV · ${selectedStatus.callAgents}</span>` : ''}
                    ${!selectedStatus.hasAnyData ? `<span class="upload-calendar-pill empty">${escapeProductivityUploadHtml(getProductivityUploadText('noFiles', lang))}</span>` : ''}
                </div>
            </div>
            <div class="upload-calendar-actions">
                <button type="button" class="btn btn-secondary" id="uploadCalendarTickets">${escapeProductivityUploadHtml(getProductivityUploadText('uploadXlsx', lang))}</button>
                <button type="button" class="btn btn-secondary" id="uploadCalendarCalls">${escapeProductivityUploadHtml(getProductivityUploadText('uploadCsv', lang))}</button>
                <button type="button" class="btn btn-secondary" id="uploadCalendarExport" ${selectedStatus.hasAnyData ? '' : 'disabled'}>${escapeProductivityUploadHtml(getProductivityUploadText('exportCsv', lang))}</button>
                <button type="button" class="btn btn-danger" id="uploadCalendarDelete" ${selectedStatus.hasAnyData ? '' : 'disabled'}>${escapeProductivityUploadHtml(getProductivityUploadText('deleteDay', lang))}</button>
            </div>
        </div>
    `;

    return {
        html,
        selectedStatus,
        days: dayKeys
    };
}
