import test from 'node:test';
import assert from 'node:assert/strict';
import { createSherpaChatService, getChatErrorTranslationKey } from '../js/chat-service.js';

test('sends only language and conversation contents through the callable boundary', async () => {
    let received;
    const service = createSherpaChatService(async payload => {
        received = payload;
        return { data: { response: { candidates: [] } } };
    });

    const response = await service.generate({
        language: 'en',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
    });

    assert.deepEqual(received, {
        language: 'en',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
    });
    assert.deepEqual(response, { candidates: [] });
});

test('rejects malformed callable responses', async () => {
    const service = createSherpaChatService(async () => ({ data: {} }));
    await assert.rejects(
        service.generate({ language: 'en', contents: [] }),
        error => error.code === 'functions/internal'
    );
});

test('maps secure backend reasons to accurate user-facing states', () => {
    assert.equal(
        getChatErrorTranslationKey({ details: { reason: 'AI_PROJECT_DENIED' } }),
        'chat-service-configuration-error'
    );
    assert.equal(
        getChatErrorTranslationKey({ details: { reason: 'AI_NOT_CONFIGURED' } }),
        'chat-service-setup-pending'
    );
    assert.equal(getChatErrorTranslationKey({ code: 'functions/resource-exhausted' }), 'chat-rate-limit');
    assert.equal(getChatErrorTranslationKey({ code: 'functions/permission-denied' }), 'chat-access-denied');
});
