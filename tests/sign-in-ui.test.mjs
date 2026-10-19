import test from 'node:test';
import assert from 'node:assert/strict';
import { setSignInPending, showSignInError, clearSignInError } from '../js/sign-in-ui.js';
import { loadBrowserModule } from './helpers/browser-module.mjs';

function uiFixture() {
    const label = { textContent: '', attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
    const spinner = { hidden: true };
    const button = {
        style: { width: '' }, dataset: {}, attributes: {}, disabled: false,
        getAttribute(key) { return this.attributes[key]; }, setAttribute(key, value) { this.attributes[key] = value; },
        getBoundingClientRect: () => ({ width: 288 }),
        querySelector: selector => selector === '.login-spinner' ? spinner : label
    };
    const error = { textContent: '', style: {}, dataset: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
    return { button, spinner, label, error, root: { getElementById: id => id === 'googleLoginBtn' ? button : error } };
}

test('connecting keeps the same Google button nodes and locks their measured width', () => {
    const f = uiFixture();
    setSignInPending(true, f.root);
    assert.equal(f.button.style.width, '288px');
    assert.equal(f.button.disabled, true);
    assert.equal(f.spinner.hidden, false);
    assert.equal(f.label.attributes['data-translate'], 'connecting');
    setSignInPending(true, f.root); // A duplicate update cannot overwrite the idle width.
    setSignInPending(false, f.root);
    assert.equal(f.button.style.width, '');
    assert.equal(f.button.disabled, false);
    assert.equal(f.spinner.hidden, true);
    assert.equal(f.label.attributes['data-translate'], 'login-google');
});

test('cancellation announces quietly while errors remain assertive and text-only', () => {
    const f = uiFixture();
    showSignInError('Popup closed', { root: f.root, informational: true });
    assert.equal(f.error.attributes.role, 'status');
    assert.equal(f.error.dataset.kind, 'info');
    showSignInError('<img src=x>', { root: f.root });
    assert.equal(f.error.attributes.role, 'alert');
    assert.equal(f.error.textContent, '<img src=x>');
    clearSignInError(f.root);
    assert.equal(f.error.style.display, 'none');
});

test('returning from a popup restores keyboard focus without stealing it from another control', () => {
    const f = uiFixture();
    let focused = 0;
    f.button.focus = () => focused++;
    f.root.body = {};
    f.root.activeElement = f.button;
    setSignInPending(true, f.root);
    f.root.activeElement = f.root.body;
    setSignInPending(false, f.root);
    assert.equal(focused, 1);
    f.root.activeElement = f.button;
    setSignInPending(true, f.root);
    f.root.activeElement = {};
    setSignInPending(false, f.root);
    assert.equal(focused, 1);
    f.root.activeElement = f.button;
    setSignInPending(true, f.root);
    f.root.activeElement = f.root.body;
    f.root.documentElement = { dataset: { authState: 'signed-in' } };
    setSignInPending(false, f.root);
    assert.equal(focused, 1);
});

function authFixture(popup) {
    const calls = [];
    const shell = loadBrowserModule('../../js/auth.js', {
        auth: {}, googleProvider: {}, t: key => key,
        signInWithPopup: popup,
        signOut: async () => calls.push('signOut'), onAuthStateChanged() {},
        isAuthorizedUser: user => user?.emailVerified === true,
        setSignInPending: value => calls.push(['pending', value]),
        clearSignInError: () => calls.push('clear'),
        showSignInError: (message, options) => calls.push(['error', message, options?.informational]),
        console: { log() {}, error() {} }
    }, 'globalThis.login = loginWithGoogle;');
    return { login: shell.login, calls };
}

test('closed popups restore sign-in controls and do not become persistent loading state', async () => {
    const f = authFixture(async () => { throw Object.assign(Error('closed'), { code: 'auth/popup-closed-by-user' }); });
    await assert.rejects(f.login(), /closed/);
    assert.deepEqual(f.calls, [['pending', true], 'clear', ['error', 'auth-popup-closed', true], ['pending', false]]);
    await assert.rejects(f.login(), /closed/);
    assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === 'pending').length, 4);
});

test('duplicate activation opens only one provider popup', async () => {
    let resolvePopup, count = 0;
    const popup = new Promise(resolve => resolvePopup = resolve);
    const f = authFixture(() => { count++; return popup; });
    const first = f.login(); await f.login();
    assert.equal(count, 1);
    resolvePopup({ user: { emailVerified: true } }); await first;
    assert.deepEqual(f.calls.at(-1), ['pending', false]);
});

test('unauthorized identities are still signed out before any success result', async () => {
    const f = authFixture(async () => ({ user: { emailVerified: false } }));
    await assert.rejects(f.login(), /auth\/unauthorized-user/);
    assert.ok(f.calls.includes('signOut'));
    assert.deepEqual(f.calls.at(-1), ['pending', false]);
});
