import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadBrowserModule } from './helpers/browser-module.mjs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [html, chat, styles, controller] = await Promise.all([
    read('index.html'), read('js/chat.js'), read('css/sherpa-boss.css'), read('js/sherpa-boss.js')
]);

test('the default chat launcher is compact and the companion remains in an inert template', () => {
    const button = html.match(/<button[^>]+id="chatBubble"[\s\S]*?<\/button>/)?.[0];
    assert.match(button, /aria-label="Open Sherpa AI"/);
    assert.match(button, /aria-controls="chatPanel"/);
    assert.match(button, /chat-launcher/);
    assert.doesNotMatch(button, /<canvas|<img|sherpa-boss|bossHelp/);
    const template = html.match(/<template id="chatCompanionTemplate">[\s\S]*?<\/template>/)?.[0];
    assert.match(template, /<canvas data-boss-canvas aria-hidden="true"/);
    assert.match(template, /assets\/sherpa-boss\.png/);
    assert.match(styles, /touch-action: none/);
    assert.match(styles, /prefers-reduced-motion: reduce/);
});

test('the global switch keeps companion loading optional and preserves its cleanup', () => {
    assert.match(chat, /const SHERPA_COMPANION_ENABLED = false/);
    assert.doesNotMatch(chat, /^import .*from '\.\/sherpa-boss/gm);
    assert.match(chat, /bossController \?\?= createSherpaBoss/);
    assert.match(chat, /onActivate: toggleChat/);
    assert.match(chat, /if \(!SHERPA_COMPANION_ENABLED\) bubble\.addEventListener\('click', toggleChat\)/);
    assert.match(chat, /bossController\?\.dispose\(\)/);
    assert.match(controller, /import\('\.\.\/assets\/vendor\/three\.module\.min\.js'\)/);
    assert.doesNotMatch(chat, /requestAnimationFrame/);
});

test('ending the typing indicator cannot overwrite a speaking reaction', () => {
    const states = [];
    const shell = loadBrowserModule('../../js/chat.js', {
        document: { querySelectorAll: () => [] }, functions: {}, httpsCallable: () => () => {},
        createSherpaChatService: () => ({}), capture: value => states.push(value)
    }, 'bossController = { setState: capture };');
    shell.setAvatarThinking(true);
    shell.setAvatarSpeaking(true);
    shell.setAvatarThinking(false);
    shell.setAvatarSpeaking(false);
    assert.deepEqual(states, ['thinking', 'speaking', 'speaking', 'idle']);
});

test('the photograph-inspired PNG does not receive the legacy SVG talking fragment', () => {
    const image = { dataset: {}, src: 'assets/sherpa-boss.png', getAttribute() { return this.src; }, setAttribute(_key, value) { this.src = value; } };
    const shell = loadBrowserModule('../../js/chat.js', {
        document: { querySelectorAll: selector => selector === '.chat-avatar' ? [image] : [] },
        functions: {}, httpsCallable: () => () => {}, createSherpaChatService: () => ({})
    });
    shell.setAvatarSpeaking(true);
    assert.equal(image.src, 'assets/sherpa-boss.png');
});
