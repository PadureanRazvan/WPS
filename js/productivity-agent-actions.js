export function createProductivityAgentActions({
    getSelectedAgents = () => new Set(),
    setSelectedAgents = () => {},
    getFilteredAgents = () => [],
    getAgentSearchTerm = () => '',
    toggleSelection = (selection = new Set()) => selection,
    selectAllSelection = (selection = new Set()) => selection,
    clearSelection = () => new Set(),
    renderAgentChips = () => {},
    renderCurrentView = () => {}
} = {}) {
    function updateSelection(nextSelectedAgents, searchTerm) {
        setSelectedAgents(nextSelectedAgents);
        renderAgentChips(searchTerm);
        renderCurrentView();
    }

    return {
        toggleAgent(normalizedName) {
            updateSelection(toggleSelection(getSelectedAgents(), normalizedName));
        },
        selectAllAgents() {
            const searchTerm = getAgentSearchTerm();
            updateSelection(
                selectAllSelection(getSelectedAgents(), getFilteredAgents(searchTerm)),
                searchTerm
            );
        },
        deselectAllAgents() {
            updateSelection(clearSelection(), getAgentSearchTerm());
        }
    };
}

export function bindProductivityAgentActions({
    container,
    toggleAgent = () => {}
} = {}) {
    if (!container) return false;

    container.querySelectorAll('[data-agent-key]').forEach(button => {
        button.addEventListener('click', () => toggleAgent(button.dataset.agentKey));
    });

    return true;
}
