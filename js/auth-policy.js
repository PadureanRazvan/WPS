export const AUTHORIZED_EMAIL_DOMAIN = 'fspglobal.com';
export const SUPPORT_EMAILS = Object.freeze(['reizvanmail@gmail.com']);

export function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export function isAuthorizedEmail(email) {
    const normalized = normalizeEmail(email);
    return SUPPORT_EMAILS.includes(normalized) || normalized.endsWith(`@${AUTHORIZED_EMAIL_DOMAIN}`);
}

export function isAuthorizedUser(user) {
    return Boolean(user?.emailVerified && isAuthorizedEmail(user.email));
}
