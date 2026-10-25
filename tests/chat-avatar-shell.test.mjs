import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadBrowserModule } from './helpers/browser-module.mjs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [html, chat, styles, controller] = await Promise.all([
    read('index.html'), read('js/chat.js'), read('css/sherpa-boss.css'), read('js/sherpa-boss.js')
]);

test('the chat launcher is an accessible 3D companion with a local image fallback', () => {
    const button = html.match(/<button[^>]+id="chatBubble"[\s\S]*?<\/button>/)?.[0];
    assert.match(button, /aria-label="Open Sherpa AI"/);
    assert.match(button, /aria-controls="chatPanel"/);
    assert.match(button, /aria-describedby="bossHelp"/);
    assert.match(button, /<canvas data-boss-canvas aria-hidden="true"/);
    assert.match(button, /assets\/sherpa-boss\.png/);
    assert.doesNotMatch(button, /sherpa-ai-avatar\.svg/);
    assert.match(styles, /touch-action: none/);
    assert.match(styles, /prefers-reduced-motion: reduce/);
});

test('chat delegates rendering and input to the companion and disposes it on logout', () => {
    assert.match(chat, /bossController \?\?= createSherpaBoss/);
    assert.match(chat, /onActivate: toggleChat/);
    assert.doesNotMatch(chat, /bubble\.addEventListener\('click', toggleChat\)/);
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
