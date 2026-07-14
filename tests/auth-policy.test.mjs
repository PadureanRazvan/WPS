import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedEmail, isAuthorizedUser, normalizeEmail } from '../js/auth-policy.js';

test('normalizes and authorizes company and temporary support identities', () => {
    assert.equal(normalizeEmail('  FspSherpa@FSPGLOBAL.com '), 'fspsherpa@fspglobal.com');
    assert.equal(isAuthorizedEmail('fspsherpa@fspglobal.com'), true);
    assert.equal(isAuthorizedEmail('reizvanmail@gmail.com'), true);
    assert.equal(isAuthorizedEmail('someone@gmail.com'), false);
    assert.equal(isAuthorizedEmail('attacker@notfspglobal.com'), false);
});

test('requires a verified email on the Firebase user', () => {
    assert.equal(isAuthorizedUser({ email: 'fspsherpa@fspglobal.com', emailVerified: true }), true);
    assert.equal(isAuthorizedUser({ email: 'fspsherpa@fspglobal.com', emailVerified: false }), false);
    assert.equal(isAuthorizedUser(null), false);
});
