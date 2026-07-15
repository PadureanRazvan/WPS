export const AUTHORIZED_EMAIL_DOMAINS = Object.freeze([
    'fspglobal.com',
    'fsp-global.com',
    'sharpmindsglobal.com'
]);
export const AUTHORIZED_EMAILS = Object.freeze([
    'rahela231091@gmail.com',
    'rahela.vlasa@gmail.com',
    'reizvanmail@gmail.com'
]);

export function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export function isAuthorizedEmail(email) {
    const normalized = normalizeEmail(email);
    const domain = normalized.includes('@') ? normalized.split('@').pop() : '';
    return AUTHORIZED_EMAILS.includes(normalized)
        || AUTHORIZED_EMAIL_DOMAINS.includes(domain);
}

export function isAuthorizedUser(user) {
    return Boolean(user?.emailVerified && isAuthorizedEmail(user.email));
}
