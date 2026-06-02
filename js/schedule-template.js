// Schedule ("Orar") CSV template helpers — Phase 1.
//
// Pure, side-effect-free and DOM-free logic so it unit-tests cleanly. The only
// browser-touching helper (downloadScheduleCsv) injects document/URL/Blob and
// mirrors downloadPlannerExportCsv in ./planner-export-command.js exactly.
//
// This module is intentionally decoupled from the planner export command. The
// CSV escape helper below is a small, self-contained duplicate of that module's
// private escapeCsvValue so the schedule feature has no cross-dependency.

export const SCHEDULE_TEMPLATE_HEADERS = [
    'month',
    'agent_username',
    'agent_name',
    'date',
    'start_time',
    'end_time',
    'break_minutes',
    'notes'
];

// Self-contained CSV field escaper: quote any field containing a comma, double
// quote, carriage return or line feed, and escape embedded double quotes by
// doubling them.
function escapeScheduleCsvValue(value) {
    const text = String(value ?? '');
    if (!/[",\n\r]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

// Example rows using the client-confirmed examples plus one day-off row
// (empty start_time AND end_time => day off, not an error).
export function buildScheduleTemplateRows() {
    return [
        {
            month: '2026-06',
            agent_username: 'mpopescu',
            agent_name: 'Maria Popescu',
            date: '2026-06-01',
            start_time: '09:00',
            end_time: '17:00',
            break_minutes: '30',
            notes: ''
        },
        {
            month: '2026-06',
            agent_username: 'mpopescu',
            agent_name: 'Maria Popescu',
            date: '2026-06-02',
            start_time: '10:00',
            end_time: '18:00',
            break_minutes: '30',
            notes: ''
        },
        {
            month: '2026-06',
            agent_username: 'ionescu',
            agent_name: 'Andrei Ionescu',
            date: '2026-06-01',
            start_time: '08:00',
            end_time: '16:00',
            break_minutes: '30',
            notes: ''
        },
        {
            // Day off: empty start_time AND end_time.
            month: '2026-06',
            agent_username: 'ionescu',
            agent_name: 'Andrei Ionescu',
            date: '2026-06-02',
            start_time: '',
            end_time: '',
            break_minutes: '',
            notes: 'Zi liberă'
        }
    ];
}

export function buildScheduleTemplateCsv(rows = buildScheduleTemplateRows()) {
    return [
        SCHEDULE_TEMPLATE_HEADERS,
        ...rows.map(row => [
            row.month,
            row.agent_username,
            row.agent_name,
            row.date,
            row.start_time,
            row.end_time,
            row.break_minutes,
            row.notes
        ])
    ]
        .map(row => row.map(escapeScheduleCsvValue).join(','))
        .join('\n');
}

export function buildScheduleTemplateFilename(month) {
    const value = String(month ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(value)) {
        return `orar-template-${value}.csv`;
    }
    return 'orar-template.csv';
}

export function downloadScheduleCsv({
    filename,
    csv,
    doc = globalThis.document,
    url = globalThis.URL,
    BlobAdapter = globalThis.Blob
} = {}) {
    const blob = new BlobAdapter([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const objectUrl = url.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    url.revokeObjectURL(objectUrl);
}
