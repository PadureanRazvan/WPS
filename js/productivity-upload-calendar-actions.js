const PRODUCTIVITY_UPLOAD_CALENDAR_NAV_KEYS = new Set([
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End'
]);

export function getProductivityUploadCalendarFocusIndex(key, currentIndex, total) {
    if (!Number.isInteger(currentIndex) || !Number.isInteger(total) || total <= 0) return currentIndex;

    let nextIndex = currentIndex;
    if (key === 'ArrowLeft') nextIndex -= 1;
    if (key === 'ArrowRight') nextIndex += 1;
    if (key === 'ArrowUp') nextIndex -= 7;
    if (key === 'ArrowDown') nextIndex += 7;
    if (key === 'Home') nextIndex = currentIndex - (currentIndex % 7);
    if (key === 'End') nextIndex = currentIndex + (6 - (currentIndex % 7));

    return nextIndex >= 0 && nextIndex < total ? nextIndex : currentIndex;
}

export function bindProductivityUploadCalendarActions({
    panel,
    doc = globalThis.document,
    selectUploadDate = () => {},
    getUploadCalendarMonth = () => new Date(),
    setUploadCalendarMonth = () => {},
    renderUploadCalendar = () => {},
    getUploadDate = () => '',
    exportProductivityDate = () => {},
    removeProductivityDate = () => {}
} = {}) {
    if (!panel) return false;

    const dateButtons = Array.from(panel.querySelectorAll('[data-date]'));
    dateButtons.forEach((button, index) => {
        button.addEventListener('click', () => selectUploadDate(button.dataset.date));
        button.addEventListener('keydown', event => {
            if (!PRODUCTIVITY_UPLOAD_CALENDAR_NAV_KEYS.has(event.key)) return;

            const nextIndex = getProductivityUploadCalendarFocusIndex(event.key, index, dateButtons.length);
            event.preventDefault?.();
            if (nextIndex === index) return;

            button.tabIndex = -1;
            dateButtons[nextIndex].tabIndex = 0;
            dateButtons[nextIndex].focus?.();
        });
    });

    panel.querySelector('#uploadCalendarPrev')?.addEventListener('click', () => {
        const monthDate = getUploadCalendarMonth();
        setUploadCalendarMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1));
        renderUploadCalendar();
    });

    panel.querySelector('#uploadCalendarNext')?.addEventListener('click', () => {
        const monthDate = getUploadCalendarMonth();
        setUploadCalendarMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1));
        renderUploadCalendar();
    });

    panel.querySelector('#uploadCalendarTickets')?.addEventListener('click', () => {
        doc?.getElementById?.('ticketsFileInput')?.click();
    });

    panel.querySelector('#uploadCalendarCalls')?.addEventListener('click', () => {
        doc?.getElementById?.('callsFileInput')?.click();
    });

    panel.querySelector('#uploadCalendarExport')?.addEventListener('click', () => {
        exportProductivityDate(getUploadDate());
    });

    panel.querySelector('#uploadCalendarDelete')?.addEventListener('click', () => {
        removeProductivityDate(getUploadDate());
    });

    return true;
}
