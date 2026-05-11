export function bindProductivityControls({
    doc = globalThis.document,
    getCurrentView = () => 'overview',
    setView = () => {},
    renderAgentSearchResults = () => {},
    submitAgentSearch = () => {},
    markAgentSearchPending = () => {},
    setCurrentTeamFilter = () => {},
    hasAnyData = () => false,
    renderCurrentView = () => {},
    refreshProductivityData = async () => {},
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

    const agentSearch = getById('prodAgentSearch');
    agentSearch?.addEventListener('input', () => {
        markAgentSearchPending();
        renderAgentSearchResults(agentSearch.value);
    });
    agentSearch?.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        submitAgentSearch(agentSearch.value);
    });

    getById('prodAgentSearchBtn')?.addEventListener('click', () => {
        submitAgentSearch(agentSearch?.value || '');
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

    return true;
}
