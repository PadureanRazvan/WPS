function escapeAgentSelectionHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getPrimaryTeamCode(primaryTeam) {
    return String(primaryTeam || '').split(' ')[0] || '';
}

function normalizeAgentSelectionSearch(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export function filterProductivityAgentSelection(agents = [], searchTerm = '') {
    if (!searchTerm) return agents;

    const normalizedTerm = normalizeAgentSelectionSearch(searchTerm);
    return agents.filter(([agentKey, info]) =>
        normalizeAgentSelectionSearch(info.fullName).includes(normalizedTerm) ||
        normalizeAgentSelectionSearch(agentKey).includes(normalizedTerm) ||
        normalizeAgentSelectionSearch(info.primaryTeam).includes(normalizedTerm)
    );
}

export function buildProductivityAgentSelectionView({
    agents = [],
    selectedAgents = new Set(),
    searchTerm = '',
    minSearchLength = 2,
    resultLimit = 30,
    t = key => key
} = {}) {
    const normalizedSearchTerm = String(searchTerm || '').trim();
    const canSearch = normalizedSearchTerm.length >= minSearchLength;
    const allMatches = canSearch ? filterProductivityAgentSelection(agents, normalizedSearchTerm) : [];
    const visibleAgents = allMatches.slice(0, resultLimit);
    let statusText = '';
    let resultsMetaText = '';
    if (!normalizedSearchTerm) {
        statusText = t('prod-search-to-select-agent');
    } else if (!canSearch) {
        statusText = t('prod-keep-typing-agent');
    } else if (allMatches.length === 0) {
        statusText = t('prod-no-results');
    } else if (allMatches.length > resultLimit) {
        resultsMetaText = t('prod-too-many-agent-matches').replace('{count}', resultLimit);
    }
    const html = visibleAgents.map(([normalizedName, info], index) => {
        const isSelected = selectedAgents.has(normalizedName);
        const teamCode = getPrimaryTeamCode(info.primaryTeam);
        const optionId = `prod-agent-option-${index}`;
        return `<button type="button" id="${optionId}" class="productivity-agent-option${isSelected ? ' is-selected' : ''}" data-agent-key="${escapeAgentSelectionHtml(normalizedName)}" role="option" aria-selected="${isSelected}" aria-posinset="${index + 1}" aria-setsize="${allMatches.length}" tabindex="-1">
            <span class="productivity-agent-option__identity">
                <strong>${escapeAgentSelectionHtml(info.fullName)}</strong>
                <span>${escapeAgentSelectionHtml(info.primaryTeam || teamCode)}</span>
            </span>
            <span class="productivity-agent-option__team">${escapeAgentSelectionHtml(teamCode)}</span>
        </button>`;
    }).join('');

    return {
        html,
        visibleAgents,
        countText: selectedAgents.size > 0 ? t('prod-agent-selected') : '',
        statusText,
        resultsMetaText,
        shouldOpen: visibleAgents.length > 0
    };
}

export function toggleProductivityAgentSelection(selectedAgents = new Set(), normalizedName) {
    const next = new Set(selectedAgents);
    if (next.has(normalizedName)) {
        next.delete(normalizedName);
    } else {
        next.add(normalizedName);
    }
    return next;
}

export function selectAllProductivityAgents(selectedAgents = new Set(), agents = []) {
    const next = new Set(selectedAgents);
    agents.forEach(([key]) => next.add(key));
    return next;
}

export function clearProductivityAgentSelection() {
    return new Set();
}
