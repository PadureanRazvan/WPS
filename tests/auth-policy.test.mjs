import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAuthorizedEmail, isAuthorizedUser, normalizeEmail } from '../js/auth-policy.js';
import { SHERPA_VERSION } from '../js/version.js';

const authSource = await readFile(new URL('../js/auth.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

test('normalizes and authorizes every approved Sherpa identity', () => {
    assert.equal(normalizeEmail('  FspSherpa@FSPGLOBAL.com '), 'fspsherpa@fspglobal.com');
    assert.equal(isAuthorizedEmail('fspsherpa@fspglobal.com'), true);
    assert.equal(isAuthorizedEmail('loredana.baba@fsp-global.com'), true);
    assert.equal(isAuthorizedEmail('helga.nagy@sharpmindsglobal.com'), true);
    assert.equal(isAuthorizedEmail('rahela231091@gmail.com'), true);
    assert.equal(isAuthorizedEmail('rahela.vlasa@gmail.com'), true);
    assert.equal(isAuthorizedEmail('reizvanmail@gmail.com'), true);
    assert.equal(isAuthorizedEmail('someone@gmail.com'), false);
    assert.equal(isAuthorizedEmail('attacker@notfspglobal.com'), false);
    assert.equal(isAuthorizedEmail('attacker@fspglobal.com.example'), false);
});

test('requires a verified email on the Firebase user', () => {
    assert.equal(isAuthorizedUser({ email: 'fspsherpa@fspglobal.com', emailVerified: true }), true);
    assert.equal(isAuthorizedUser({ email: 'fspsherpa@fspglobal.com', emailVerified: false }), false);
    assert.equal(isAuthorizedUser(null), false);
});

test('authentication module graph uses the current release number as its browser cache key', () => {
    const version = SHERPA_VERSION.number.replaceAll('.', '\\.');

    assert.match(mainSource, new RegExp(`auth\\.js\\?v=${version}`));
    assert.match(authSource, new RegExp(`auth-policy\\.js\\?v=${version}`));
});
