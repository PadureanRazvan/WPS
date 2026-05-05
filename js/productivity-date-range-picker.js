export function bindProductivityDateRangePicker({
    input,
    LitepickerAdapter = globalThis.Litepicker,
    today = new Date(),
    setDateRange = () => {},
    hasAnyData = () => false,
    renderCurrentView = () => {}
} = {}) {
    if (!input || !LitepickerAdapter) return null;

    const startDate = new Date(today);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    setDateRange(startDate, endDate);

    return new LitepickerAdapter({
        element: input,
        singleMode: false,
        allowRepick: true,
        lang: 'ro-RO',
        startDate,
        endDate,
        format: 'DD MMM YYYY',
        numberOfMonths: 2,
        numberOfColumns: 2,
        setup: picker => {
            picker.on('selected', (date1, date2) => {
                setDateRange(date1.dateInstance, date2.dateInstance);
                if (hasAnyData()) renderCurrentView();
            });
        }
    });
}
