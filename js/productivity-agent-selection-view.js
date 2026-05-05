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

export function filterProductivityAgentSelection(agents = [], searchTerm = '') {
    if (!searchTerm) return agents;

    const lower = searchTerm.toLowerCase();
    return agents.filter(([, info]) => String(info.fullName || '').toLowerCase().includes(lower));
}

export function buildProductivityAgentSelectionView({
    agents = [],
    selectedAgents = new Set(),
    searchTerm = '',
    t = key => key
} = {}) {
    const visibleAgents = filterProductivityAgentSelection(agents, searchTerm);
    const html = visibleAgents.map(([normalizedName, info]) => {
        const isSelected = selectedAgents.has(normalizedName);
        const teamCode = getPrimaryTeamCode(info.primaryTeam);
        return `<button type="button" data-agent-key="${escapeAgentSelectionHtml(normalizedName)}" style="
            background: ${isSelected ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)'};
            border: 1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'};
            color: ${isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'};
            padding: 0.3rem 0.7rem; border-radius: 4px; font-size: 0.8rem; cursor: pointer;
            transition: all 0.15s;
        ">${escapeAgentSelectionHtml(info.fullName)} <span style="font-size: 0.7rem; opacity: 0.6;">${escapeAgentSelectionHtml(teamCode)}</span></button>`;
    }).join('');

    return {
        html,
        visibleAgents,
        countText: selectedAgents.size > 0 ? `${selectedAgents.size} ${t('prod-selected')}` : ''
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
