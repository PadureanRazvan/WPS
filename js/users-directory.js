function normalizeDirectoryText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .trim();
}

export function getUsersDirectoryTeams(users = []) {
    return [...new Set(users
        .map(user => String(user?.primaryTeam || '').trim())
        .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
}

export function filterUsersDirectory(users = [], state = {}) {
    const query = normalizeDirectoryText(state.query);
    const team = String(state.team || 'all');
    const normalizedTeam = normalizeDirectoryText(team);
    const status = ['active', 'inactive'].includes(state.status) ? state.status : 'all';

    return users.filter(user => {
        const matchesQuery = !query || [
            user?.fullName,
            user?.username,
            user?.primaryTeam,
            user?.contractType
        ].some(value => normalizeDirectoryText(value).includes(query));
        const matchesTeam = team === 'all'
            || normalizeDirectoryText(user?.primaryTeam) === normalizedTeam;
        const isActive = Boolean(user?.isActive);
        const matchesStatus = status === 'all'
            || (status === 'active' && isActive)
            || (status === 'inactive' && !isActive);

        return matchesQuery && matchesTeam && matchesStatus;
    });
}
