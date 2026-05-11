function normalizeAgentActionSearch(value) {
    return String(value || '').trim().toLowerCase();
}

export function resolveProductivityAgentSearch(agents = [], searchTerm = '') {
    const normalizedSearchTerm = normalizeAgentActionSearch(searchTerm);
    if (!normalizedSearchTerm || agents.length === 0) return null;

    return agents.find(([agentKey, info]) =>
        normalizeAgentActionSearch(agentKey) === normalizedSearchTerm ||
        normalizeAgentActionSearch(info?.fullName) === normalizedSearchTerm
    ) || agents[0] || null;
}

export function createProductivityAgentActions({
    setSelectedAgents = () => {},
    setDetailSearchCommitted = () => {},
    getVisibleAgents = () => [],
    getSearchResults = () => [],
    getAgentSearchTerm = () => '',
    setAgentSearchTerm = () => {},
    resolveAgentSearch = resolveProductivityAgentSearch,
    renderAgentSearchResults = () => {},
    renderCurrentView = () => {},
    showTemporaryMessage = () => {},
    noResultMessage = 'No matching agent.',
    getNoResultMessage = () => noResultMessage
} = {}) {
    return {
        chooseAgentSuggestion(normalizedName) {
            const selectedSuggestion = getVisibleAgents().find(([agentKey]) => agentKey === normalizedName);
            if (!selectedSuggestion) return false;

            const [, info] = selectedSuggestion;
            const searchTerm = info?.fullName || normalizedName;
            setAgentSearchTerm(searchTerm);
            setDetailSearchCommitted(false);
            renderAgentSearchResults(searchTerm);
            return true;
        },

        submitAgentSearch(searchTerm = getAgentSearchTerm()) {
            const normalizedSearchTerm = String(searchTerm || '').trim();
            const match = resolveAgentSearch(getSearchResults(normalizedSearchTerm), normalizedSearchTerm);

            if (!match) {
                setSelectedAgents(new Set());
                setDetailSearchCommitted(false);
                renderAgentSearchResults(normalizedSearchTerm);
                showTemporaryMessage(getNoResultMessage(), 'error', 1800);
                return false;
            }

            const [agentKey, info] = match;
            const committedSearchTerm = info?.fullName || agentKey;
            setSelectedAgents(new Set([agentKey]));
            setDetailSearchCommitted(true);
            setAgentSearchTerm(committedSearchTerm);
            renderAgentSearchResults(committedSearchTerm);
            renderCurrentView();
            return true;
        }
    };
}

export function bindProductivityAgentActions({
    container,
    chooseAgentSuggestion = () => {}
} = {}) {
    if (!container) return false;

    container.querySelectorAll('[data-agent-key]').forEach(button => {
        button.addEventListener('click', () => chooseAgentSuggestion(button.dataset.agentKey));
    });

    return true;
}
