// Structural CSV parsing for the Orar (Schedule) section, Phase 1.
//
// This module is intentionally DOM-free, side-effect-free, and decoupled from
// the rest of the app so it unit-tests cleanly. It performs ONLY:
//   1. RFC-style splitting of CSV lines (quoted fields, doubled "" escapes),
//      mirroring parseProductivityCSVLine in productivity-upload-parsing.js.
//   2. Header-indexed, column-order-tolerant mapping into row objects.
//   3. A required-header presence check.
//
// It deliberately does NOT do semantic validation (unknown agent, invalid
// date, end <= start, duplicate rows, etc.). That belongs to schedule-validation.

// The eight known template columns, in their canonical order. Order here is for
// reference/documentation only - parsing is header-indexed and tolerant of any
// column order or extra columns.
export const SCHEDULE_CSV_HEADERS = [
    'month',
    'agent_username',
    'agent_name',
    'date',
    'start_time',
    'end_time',
    'break_minutes',
    'notes'
];

// The minimum set of columns a file MUST contain to be structurally usable.
// agent_name, break_minutes and notes are optional at the structural level.
export const SCHEDULE_REQUIRED_HEADERS = [
    'month',
    'agent_username',
    'date',
    'start_time',
    'end_time'
];

// Maps a header cell to the canonical field name on the output row object.
const HEADER_TO_FIELD = {
    month: 'month',
    agent_username: 'agentUsername',
    agent_name: 'agentName',
    date: 'date',
    start_time: 'startTime',
    end_time: 'endTime',
    break_minutes: 'breakMinutes',
    notes: 'notes'
};

// Parse one CSV line into an array of field strings. Honors double-quoted
// fields (which may contain commas and newlines were they ever joined) and
// collapses doubled "" inside a quoted field to a single ". Mirrors
// parseProductivityCSVLine in productivity-upload-parsing.js.
export function parseScheduleCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    const text = String(line ?? '');
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') { current += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else { current += ch; }
        } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',') { result.push(current); current = ''; }
            else { current += ch; }
        }
    }
    result.push(current);
    return result;
}

function normalizeHeaderCell(value) {
    return String(value ?? '').trim().toLowerCase();
}

// Parse break_minutes into a number. Blank/whitespace => 0. Non-numeric input
// is passed through as a Number (which may be NaN) so semantic validation can
// flag it; this stays purely structural and does not throw.
function parseBreakMinutes(value) {
    const text = String(value ?? '').trim();
    if (text === '') return 0;
    return Number(text);
}

// Structurally parse a schedule CSV. Returns:
//   { headerError: string|null, rows: [...] }
// Each row carries the canonical fields plus a 1-based lineNumber pointing at
// the source line it came from. Fully blank lines (including the gaps created
// by trailing newlines) are skipped but still advance the line counter so
// lineNumber always reflects the true source position.
export function parseScheduleCsv(text) {
    const lines = String(text ?? '').split(/\r?\n/);

    // Find the first non-blank line: that is the header row. Blank leading
    // lines are skipped but counted so lineNumber stays accurate.
    let headerLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== '') { headerLineIndex = i; break; }
    }

    if (headerLineIndex === -1) {
        return { headerError: 'empty_file', rows: [] };
    }

    const rawHeaders = parseScheduleCsvLine(lines[headerLineIndex]).map(normalizeHeaderCell);

    // Build a map from canonical field name -> column index, keeping the FIRST
    // occurrence if a header is duplicated. Unknown/extra columns are ignored.
    const fieldToIndex = {};
    rawHeaders.forEach((header, index) => {
        const field = HEADER_TO_FIELD[header];
        if (field && !(field in fieldToIndex)) {
            fieldToIndex[field] = index;
        }
    });

    const missing = SCHEDULE_REQUIRED_HEADERS
        .map(header => HEADER_TO_FIELD[header])
        .filter(field => !(field in fieldToIndex))
        // Report the missing column under its original header name.
        .map(field => SCHEDULE_CSV_HEADERS.find(h => HEADER_TO_FIELD[h] === field));

    if (missing.length > 0) {
        return { headerError: `missing_headers:${missing.join(',')}`, rows: [] };
    }

    const cellAt = (cols, field) => {
        const index = fieldToIndex[field];
        if (index === undefined) return '';
        return String(cols[index] ?? '').trim();
    };

    const rows = [];
    for (let i = headerLineIndex + 1; i < lines.length; i++) {
        const rawLine = lines[i];
        if (rawLine.trim() === '') continue; // skip fully blank lines

        const cols = parseScheduleCsvLine(rawLine);
        rows.push({
            month: cellAt(cols, 'month'),
            agentUsername: cellAt(cols, 'agentUsername'),
            agentName: cellAt(cols, 'agentName'),
            date: cellAt(cols, 'date'),
            startTime: cellAt(cols, 'startTime'),
            endTime: cellAt(cols, 'endTime'),
            breakMinutes: parseBreakMinutes(cellAt(cols, 'breakMinutes')),
            notes: cellAt(cols, 'notes'),
            lineNumber: i + 1
        });
    }

    return { headerError: null, rows };
}
