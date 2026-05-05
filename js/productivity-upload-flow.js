function hasUploadedDataForType(entry, fileType) {
    if (!entry) return false;
    if (fileType === 'tickets') return Boolean(entry.ticketsData?.size > 0);
    if (fileType === 'calls') return Boolean(entry.callsData?.size > 0);
    return false;
}

function formatUploadMessage(template, file, dateKey, formatDateDisplay) {
    return template
        .replace('{name}', file.name)
        .replace('{date}', formatDateDisplay(dateKey));
}

export async function processProductivityUploadFile({
    file,
    fileNameEl = null,
    fileType,
    getUploadDate = () => '',
    getDateEntry = () => null,
    parseFile = async () => {},
    saveDate = async () => {},
    refreshProductivityViews = () => {},
    showUploadSuccess = () => {},
    showTemporaryMessage = () => {},
    t = key => key,
    formatDateDisplay = dateKey => dateKey,
    logError = (...args) => console.error(...args)
} = {}) {
    const dateKey = getUploadDate();
    if (!dateKey) {
        showTemporaryMessage(t('prod-select-date-first'), 'error');
        return;
    }

    const wasOverride = hasUploadedDataForType(getDateEntry(dateKey), fileType);

    if (fileNameEl) {
        fileNameEl.textContent = file.name;
        fileNameEl.style.color = 'var(--accent)';
    }

    try {
        await parseFile(file, dateKey);
        await saveDate(dateKey);

        const messageKey = wasOverride ? 'data-overwritten' : 'file-processed';
        showTemporaryMessage(
            formatUploadMessage(t(messageKey), file, dateKey, formatDateDisplay),
            'success'
        );
        refreshProductivityViews({ source: 'upload' });
        showUploadSuccess();
    } catch (err) {
        logError('File parse error:', err);
        showTemporaryMessage(t('error-generic').replace('{msg}', err.message), 'error');
        if (fileNameEl) {
            fileNameEl.textContent = t('error-file-processing').replace('{name}', file.name);
            fileNameEl.style.color = 'var(--error)';
        }
    }
}
