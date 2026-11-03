import { translations } from './config.js?v=2026.11.04';

export function t(key) {
    const language = globalThis.localStorage?.getItem('language') || 'ro';
    return translations[language]?.[key] || key;
}
