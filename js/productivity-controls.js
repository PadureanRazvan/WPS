export function bindProductivityControls({
    doc = globalThis.document,
    getCurrentView = () => 'overview',
    setView = () => {},
    setCurrentTeamFilter = () => {},
    hasAnyData = () => false,
    renderCurrentView = () => {},
    refreshProductivityData = async () => {},
    exportCurrentSelection = () => {},
    showTemporaryMessage = () => {},
    log = () => {},
    refreshMessage = 'Productivity data refreshed.'
} = {}) {
    const getById = id => doc?.getElementById?.(id) ?? null;

    getById('viewOverview')?.addEventListener('click', () => {
        log('[Productivity] Switching to Sumar view');
        setView('overview');
    });

    getById('viewDetail')?.addEventListener('click', () => {
        log('[Productivity] Switching to Per Agent view');
        setView('detail');
    });

    const teamFilter = getById('productivityTeamFilter');
    teamFilter?.addEventListener('change', () => {
        setCurrentTeamFilter(teamFilter.value);
        if (getCurrentView() === 'overview' && hasAnyData()) renderCurrentView();
    });

    const refreshButton = getById('productivityRefreshBtn');
    refreshButton?.addEventListener('click', async () => {
        refreshButton.classList.add('is-loading');
        await refreshProductivityData();
        refreshButton.classList.remove('is-loading');
        showTemporaryMessage(refreshMessage, 'success', 1500);
    });

    getById('productivityExportBtn')?.addEventListener('click', () => {
        exportCurrentSelection();
    });

    return true;
}
