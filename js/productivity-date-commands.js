export function downloadTextFile({
    filename,
    content,
    mimeType = 'text/csv;charset=utf-8',
    doc = globalThis.document,
    url = globalThis.URL,
    BlobAdapter = globalThis.Blob
} = {}) {
    const blob = new BlobAdapter([content], { type: mimeType });
    const objectUrl = url.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    url.revokeObjectURL(objectUrl);
}

export function createProductivityDateCommands({
    getDateEntry = () => null,
    deleteDateEntry = () => {},
    getDateStatus = () => ({ hasAnyData: false }),
    buildExportCsv = () => '',
    downloadTextFile: download = (filename, content) => downloadTextFile({ filename, content }),
    deletePersistedDate = async () => {},
    refreshProductivityViews = () => {},
    showTemporaryMessage = () => {},
    formatDateDisplay = dateKey => dateKey,
    t = key => key
} = {}) {
    return {
        exportDate(dateKey) {
            const entry = getDateEntry(dateKey);
            const status = getDateStatus(entry);
            if (!status.hasAnyData) {
                showTemporaryMessage(t('prod-no-results'), 'error');
                return;
            }

            const csv = buildExportCsv(dateKey, entry);
            download(`productivity-${dateKey}.csv`, csv);
        },
        async removeDate(dateKey) {
            deleteDateEntry(dateKey);
            await deletePersistedDate(dateKey);
            refreshProductivityViews({ source: 'delete' });
            showTemporaryMessage(
                t('prod-deleted').replace('{date}', formatDateDisplay(dateKey)),
                'success',
                2000
            );
        }
    };
}
