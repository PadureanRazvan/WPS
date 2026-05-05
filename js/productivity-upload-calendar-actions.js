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

    panel.querySelectorAll('[data-date]').forEach(button => {
        button.addEventListener('click', () => selectUploadDate(button.dataset.date));
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
