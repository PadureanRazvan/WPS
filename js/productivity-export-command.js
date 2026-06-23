const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function pad(value) {
    return String(value).padStart(2, '0');
}

function normalizeDate(value) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function formatDateKey(value) {
    const date = normalizeDate(value);
    if (!date) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateRange(start, end) {
    return `${formatDateKey(start)} to ${formatDateKey(end)}`;
}

function sanitizeSheetName(name) {
    const cleaned = String(name || 'Sheet')
        .replace(/[\[\]:*?/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return (cleaned || 'Sheet').slice(0, 31);
}

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function getColumnName(index) {
    let value = index + 1;
    let name = '';
    while (value > 0) {
        const remainder = (value - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        value = Math.floor((value - 1) / 26);
    }
    return name;
}

function getCellReference(rowIndex, columnIndex) {
    return `${getColumnName(columnIndex)}${rowIndex + 1}`;
}

function asFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function columnStyle(column = {}) {
    if (column.format === '0.00') return 4;
    if (column.format === '0') return 3;
    return 0;
}

function buildCellXml(value, rowIndex, columnIndex, styleId = 0) {
    const ref = getCellReference(rowIndex, columnIndex);
    const numericValue = asFiniteNumber(value);
    const styleAttr = styleId ? ` s="${styleId}"` : '';

    if (numericValue !== null) {
        return `<c r="${ref}"${styleAttr}><v>${numericValue}</v></c>`;
    }

    return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t>${escapeXml(value)}</t></is></c>`;
}

function buildColsXml(columns = []) {
    if (columns.length === 0) return '';
    const cols = columns
        .map((column, index) => {
            const width = Number(column?.width) || 14;
            const safeWidth = Math.max(8, Math.min(48, width));
            return `<col min="${index + 1}" max="${index + 1}" width="${safeWidth}" customWidth="1"/>`;
        })
        .join('');
    return `<cols>${cols}</cols>`;
}

function buildWorksheetXml(sheet = {}) {
    const rows = sheet.rows || [];
    const columns = sheet.columns || [];
    const tabColor = sheet.tabColor || 'F2B84B';
    const sheetData = rows
        .map((row, rowIndex) => {
            const cells = (row || []).map((cell, columnIndex) => {
                let styleId = rowIndex === 0 ? 1 : columnStyle(columns[columnIndex]);
                if (sheet.titleRow && rowIndex === 0 && columnIndex === 0) styleId = 2;
                if (sheet.metaRows && columnIndex === 0 && rowIndex > 0) styleId = 5;
                return buildCellXml(cell, rowIndex, columnIndex, styleId);
            }).join('');
            const heightAttr = rowIndex === 0 ? ' ht="24" customHeight="1"' : '';
            return `<row r="${rowIndex + 1}"${heightAttr}>${cells}</row>`;
        })
        .join('');

    const freezePane = sheet.freezeHeader === false
        ? ''
        : '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    const autoFilter = rows.length > 1 && !sheet.metaRows
        ? `<autoFilter ref="A1:${getColumnName(Math.max(0, (rows[0] || []).length - 1))}${rows.length}"/>`
        : '';

    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        `<sheetPr><tabColor rgb="${escapeXml(tabColor)}"/></sheetPr>`,
        freezePane,
        buildColsXml(columns),
        `<sheetData>${sheetData}</sheetData>`,
        autoFilter,
        '</worksheet>'
    ].join('');
}

function buildWorkbookXml(sheets = []) {
    const sheetXml = sheets
        .map((sheet, index) => `<sheet name="${escapeXml(sanitizeSheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
        .join('');
    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        `<sheets>${sheetXml}</sheets>`,
        '</workbook>'
    ].join('');
}

function buildWorkbookRelsXml(sheets = []) {
    const sheetRels = sheets
        .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
        .join('');
    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        sheetRels,
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
        '</Relationships>'
    ].join('');
}

function buildRootRelsXml() {
    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
        '</Relationships>'
    ].join('');
}

function buildContentTypesXml(sheets = []) {
    const sheetTypes = sheets
        .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('');
    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
        sheetTypes,
        '</Types>'
    ].join('');
}

function buildStylesXml() {
    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>',
        '<fonts count="4">',
        '<font><sz val="11"/><color rgb="FF111111"/><name val="Calibri"/></font>',
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
        '<font><b/><sz val="16"/><color rgb="FFF2B84B"/><name val="Calibri"/></font>',
        '<font><b/><sz val="11"/><color rgb="FF444444"/><name val="Calibri"/></font>',
        '</fonts>',
        '<fills count="4">',
        '<fill><patternFill patternType="none"/></fill>',
        '<fill><patternFill patternType="gray125"/></fill>',
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF2B84B"/><bgColor indexed="64"/></patternFill></fill>',
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1F1F1F"/><bgColor indexed="64"/></patternFill></fill>',
        '</fills>',
        '<borders count="2">',
        '<border><left/><right/><top/><bottom/><diagonal/></border>',
        '<border><left style="thin"><color rgb="FF3A3A3A"/></left><right style="thin"><color rgb="FF3A3A3A"/></right><top style="thin"><color rgb="FF3A3A3A"/></top><bottom style="thin"><color rgb="FF3A3A3A"/></bottom><diagonal/></border>',
        '</borders>',
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
        '<cellXfs count="6">',
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
        '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center"/></xf>',
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
        '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>',
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>',
        '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
        '</cellXfs>',
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
        '</styleSheet>'
    ].join('');
}

function makeCrcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    bytes.forEach(byte => {
        crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    });
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pushUint16(bytes, value) {
    bytes.push(value & 0xFF, (value >>> 8) & 0xFF);
}

function pushUint32(bytes, value) {
    bytes.push(
        value & 0xFF,
        (value >>> 8) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 24) & 0xFF
    );
}

function appendBytes(target, source) {
    for (let index = 0; index < source.length; index += 1) {
        target.push(source[index]);
    }
}

function createZip(files = []) {
    const encoder = new TextEncoder();
    const output = [];
    const centralDirectory = [];
    let offset = 0;

    files.forEach(file => {
        const nameBytes = encoder.encode(file.name);
        const dataBytes = file.data instanceof Uint8Array ? file.data : encoder.encode(String(file.data ?? ''));
        const crc = crc32(dataBytes);
        const localHeader = [];

        pushUint32(localHeader, 0x04034B50);
        pushUint16(localHeader, 20);
        pushUint16(localHeader, 0);
        pushUint16(localHeader, 0);
        pushUint16(localHeader, 0);
        pushUint16(localHeader, 0);
        pushUint32(localHeader, crc);
        pushUint32(localHeader, dataBytes.length);
        pushUint32(localHeader, dataBytes.length);
        pushUint16(localHeader, nameBytes.length);
        pushUint16(localHeader, 0);

        appendBytes(output, localHeader);
        appendBytes(output, nameBytes);
        appendBytes(output, dataBytes);

        const centralHeader = [];
        pushUint32(centralHeader, 0x02014B50);
        pushUint16(centralHeader, 20);
        pushUint16(centralHeader, 20);
        pushUint16(centralHeader, 0);
        pushUint16(centralHeader, 0);
        pushUint16(centralHeader, 0);
        pushUint16(centralHeader, 0);
        pushUint32(centralHeader, crc);
        pushUint32(centralHeader, dataBytes.length);
        pushUint32(centralHeader, dataBytes.length);
        pushUint16(centralHeader, nameBytes.length);
        pushUint16(centralHeader, 0);
        pushUint16(centralHeader, 0);
        pushUint16(centralHeader, 0);
        pushUint16(centralHeader, 0);
        pushUint32(centralHeader, 0);
        pushUint32(centralHeader, offset);
        appendBytes(centralDirectory, centralHeader);
        appendBytes(centralDirectory, nameBytes);

        offset += localHeader.length + nameBytes.length + dataBytes.length;
    });

    const centralOffset = output.length;
    appendBytes(output, centralDirectory);
    const centralSize = centralDirectory.length;
    const footer = [];

    pushUint32(footer, 0x06054B50);
    pushUint16(footer, 0);
    pushUint16(footer, 0);
    pushUint16(footer, files.length);
    pushUint16(footer, files.length);
    pushUint32(footer, centralSize);
    pushUint32(footer, centralOffset);
    pushUint16(footer, 0);
    appendBytes(output, footer);

    return new Uint8Array(output);
}

function buildReadMeSheet({
    view,
    start,
    end,
    teamFilter,
    daysInRange,
    datesWithData,
    selectedCount,
    now,
    t
}) {
    const rows = [
        [t('prod-export-summary-note')],
        [t('prod-export-generated'), formatDateTime(now)],
        [t('prod-export-period'), formatDateRange(start, end)],
        [t('prod-export-view'), view === 'detail' ? t('prod-per-agent') : t('prod-summary')],
        [t('prod-export-team-filter'), teamFilter === 'all' ? t('prod-all-teams') : teamFilter],
        [t('prod-export-days'), daysInRange],
        [t('prod-export-dates-with-data'), datesWithData]
    ];

    if (view === 'detail') {
        rows.push([t('prod-export-agents'), selectedCount || 0]);
    }

    return {
        name: t('prod-export-readme-sheet'),
        titleRow: true,
        metaRows: true,
        freezeHeader: false,
        tabColor: 'F2B84B',
        columns: [{ width: 28 }, { width: 30 }],
        rows
    };
}

function buildOverviewSheet({ rows = [], t }) {
    return {
        name: t('prod-export-overview-sheet'),
        tabColor: '4DC08A',
        columns: [
            { width: 28 },
            { width: 16 },
            { width: 12, format: '0' },
            { width: 12, format: '0' },
            { width: 12, format: '0' },
            { width: 14, format: '0.00' },
            { width: 14, format: '0.00' }
        ],
        rows: [
            [
                t('th-agent'),
                t('th-teams'),
                t('th-tickets'),
                t('th-calls'),
                t('th-total'),
                t('th-hours-worked'),
                t('th-productivity')
            ],
            ...rows.map(row => [
                row.name,
                row.teamsDisplay,
                row.tickets,
                row.calls,
                row.total,
                row.hours,
                row.productivity
            ])
        ]
    };
}

function buildDetailSheet({ detailRows = [], t }) {
    return {
        name: t('prod-export-detail-sheet'),
        tabColor: '5BA8FF',
        columns: [
            { width: 14 },
            { width: 28 },
            { width: 16 },
            { width: 12, format: '0' },
            { width: 12, format: '0' },
            { width: 12, format: '0' },
            { width: 16 },
            { width: 12, format: '0.00' },
            { width: 14, format: '0.00' }
        ],
        rows: [
            [
                t('th-date'),
                t('th-agent'),
                t('th-teams'),
                t('th-tickets'),
                t('th-calls'),
                t('th-total'),
                t('th-schedule'),
                t('th-hours'),
                t('th-productivity')
            ],
            ...detailRows.map(row => [
                row.dateKey,
                row.name,
                row.teamsDisplay,
                row.tickets,
                row.calls,
                row.total,
                row.dayValue || '',
                row.hours,
                row.productivity
            ])
        ]
    };
}

function buildAgentTotalsSheet({ detailRows = [], t }) {
    const totalsByAgent = new Map();

    detailRows.forEach(row => {
        if (!totalsByAgent.has(row.name)) {
            totalsByAgent.set(row.name, {
                name: row.name,
                teams: new Set(),
                tickets: 0,
                calls: 0,
                total: 0,
                hours: 0
            });
        }

        const total = totalsByAgent.get(row.name);
        String(row.teamsDisplay || '')
            .split('/')
            .map(team => team.trim())
            .filter(Boolean)
            .forEach(team => total.teams.add(team));
        total.tickets += Number(row.tickets) || 0;
        total.calls += Number(row.calls) || 0;
        total.total += Number(row.total) || 0;
        total.hours += Number(row.hours) || 0;
    });

    const rows = [...totalsByAgent.values()]
        .map(total => ({
            ...total,
            teamsDisplay: [...total.teams].sort().join('/') || '-',
            productivity: total.hours > 0 ? total.total / total.hours : 0
        }))
        .sort((a, b) => b.productivity - a.productivity || a.name.localeCompare(b.name));

    return {
        name: t('prod-export-agent-totals-sheet'),
        tabColor: '9BDB75',
        columns: [
            { width: 28 },
            { width: 16 },
            { width: 12, format: '0' },
            { width: 12, format: '0' },
            { width: 12, format: '0' },
            { width: 14, format: '0.00' },
            { width: 14, format: '0.00' }
        ],
        rows: [
            [
                t('th-agent'),
                t('th-teams'),
                t('th-tickets'),
                t('th-calls'),
                t('th-total'),
                t('th-hours-worked'),
                t('th-productivity')
            ],
            ...rows.map(row => [
                row.name,
                row.teamsDisplay,
                row.tickets,
                row.calls,
                row.total,
                row.hours,
                row.productivity
            ])
        ]
    };
}

function buildExportFilename(view, start, end) {
    const label = view === 'detail' ? 'per-agent' : 'summary';
    return `productivity-${label}-${formatDateKey(start)}-to-${formatDateKey(end)}.xlsx`;
}

export function buildProductivitySelectionWorkbookModel({
    view = 'overview',
    rows = [],
    detailRows = [],
    start,
    end,
    teamFilter = 'all',
    daysInRange = 0,
    datesWithData = 0,
    selectedCount = 0,
    now = new Date(),
    t = key => key
} = {}) {
    const sheets = [
        buildReadMeSheet({
            view,
            start,
            end,
            teamFilter,
            daysInRange,
            datesWithData,
            selectedCount,
            now,
            t
        })
    ];

    if (view === 'detail') {
        sheets.push(buildDetailSheet({ detailRows, t }));
        sheets.push(buildAgentTotalsSheet({ detailRows, t }));
    } else {
        sheets.push(buildOverviewSheet({ rows, t }));
    }

    return {
        filename: buildExportFilename(view, start, end),
        sheets
    };
}

export function buildXlsxWorkbook({ sheets = [] } = {}) {
    const safeSheets = sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [[]], columns: [] }];
    const files = [
        { name: '[Content_Types].xml', data: buildContentTypesXml(safeSheets) },
        { name: '_rels/.rels', data: buildRootRelsXml() },
        { name: 'xl/workbook.xml', data: buildWorkbookXml(safeSheets) },
        { name: 'xl/_rels/workbook.xml.rels', data: buildWorkbookRelsXml(safeSheets) },
        { name: 'xl/styles.xml', data: buildStylesXml() },
        ...safeSheets.map((sheet, index) => ({
            name: `xl/worksheets/sheet${index + 1}.xml`,
            data: buildWorksheetXml(sheet)
        }))
    ];
    return createZip(files);
}

export function downloadBinaryFile({
    filename,
    bytes,
    mimeType = XLSX_MIME_TYPE,
    doc = globalThis.document,
    url = globalThis.URL,
    BlobAdapter = globalThis.Blob
} = {}) {
    const blob = new BlobAdapter([bytes], { type: mimeType });
    const objectUrl = url.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    url.revokeObjectURL(objectUrl);
}

export function exportProductivityWorkbook({
    model,
    downloadBinaryFile: download = (filename, bytes, mimeType) => downloadBinaryFile({ filename, bytes, mimeType })
} = {}) {
    const bytes = buildXlsxWorkbook(model);
    download(model.filename, bytes, XLSX_MIME_TYPE);
    return bytes;
}
