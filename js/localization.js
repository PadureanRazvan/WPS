import { translations } from './config.js?v=2026.10.23.2';

export function t(key) {
    const language = globalThis.localStorage?.getItem('language') || 'ro';
    return translations[language]?.[key] || key;
}
