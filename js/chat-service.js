const REASON_TRANSLATIONS = Object.freeze({
    AI_NOT_CONFIGURED: 'chat-service-setup-pending',
    AI_CREDENTIAL_INVALID: 'chat-service-configuration-error',
    AI_CREDENTIAL_BLOCKED: 'chat-service-configuration-error',
    AI_PROJECT_DENIED: 'chat-service-configuration-error',
    AI_PERMISSION_DENIED: 'chat-service-configuration-error',
    AI_RATE_LIMITED: 'chat-rate-limit',
    AI_UNAVAILABLE: 'chat-service-unavailable',
    AUTH_REQUIRED: 'chat-access-denied',
    AUTH_DOMAIN_DENIED: 'chat-access-denied',
    INVALID_REQUEST: 'chat-invalid-request',
    REQUEST_TOO_LARGE: 'chat-invalid-request'
});

export function createSherpaChatService(callable) {
    if (typeof callable !== 'function') throw new TypeError('A callable function is required.');

    return {
        async generate({ language, contents }) {
            const result = await callable({ language, contents });
            const response = result?.data?.response;
            if (!response || typeof response !== 'object') {
                const error = new Error('Sherpa AI returned an invalid response.');
                error.code = 'functions/internal';
                throw error;
            }
            return response;
        }
    };
}

export function getChatErrorTranslationKey(error) {
    const reason = error?.details?.reason;
    if (reason && REASON_TRANSLATIONS[reason]) return REASON_TRANSLATIONS[reason];

    const code = String(error?.code || '').replace(/^functions\//, '');
    if (code === 'resource-exhausted') return 'chat-rate-limit';
    if (code === 'unauthenticated' || code === 'permission-denied') return 'chat-access-denied';
    if (code === 'invalid-argument') return 'chat-invalid-request';
    if (code === 'not-found' || code === 'failed-precondition') return 'chat-service-setup-pending';
    if (code === 'unavailable' || code === 'internal' || code === 'deadline-exceeded') {
        return 'chat-service-unavailable';
    }
    return 'chat-error';
}
