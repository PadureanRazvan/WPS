export const SHERPA_THEME_IDS = Object.freeze(['dark', 'aurora', 'light', 'coral']);

export const SHERPA_THEMES = Object.freeze({
    dark: Object.freeze({ name: 'Midnight', accent: '#e8a849', metaColor: '#111111' }),
    aurora: Object.freeze({ name: 'Aurora', accent: '#5ee1ad', metaColor: '#0b1110' }),
    light: Object.freeze({ name: 'Cloud', accent: '#3b5dab', metaColor: '#f5f7fb' }),
    coral: Object.freeze({ name: 'Coral', accent: '#d44f68', metaColor: '#f7f8fb' })
});

export function normalizeTheme(theme) {
    return SHERPA_THEME_IDS.includes(theme) ? theme : 'dark';
}

export function getNextTheme(theme) {
    const index = SHERPA_THEME_IDS.indexOf(normalizeTheme(theme));
    return SHERPA_THEME_IDS[(index + 1) % SHERPA_THEME_IDS.length];
}

export function getThemeMeta(theme) {
    return SHERPA_THEMES[normalizeTheme(theme)];
}

export function getThemeRevealRadius({ x = 0, y = 0, width = 0, height = 0 } = {}) {
    return Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
}
