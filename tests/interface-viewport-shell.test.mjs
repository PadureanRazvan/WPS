import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const baseSource = await readFile(new URL('../css/base.css', import.meta.url), 'utf8');
const chatSource = await readFile(new URL('../css/chat.css', import.meta.url), 'utf8');
const componentsSource = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const infoSource = await readFile(new URL('../css/info.css', import.meta.url), 'utf8');
const layoutSource = await readFile(new URL('../css/layout.css', import.meta.url), 'utf8');
const plannerSource = await readFile(new URL('../css/planner.css', import.meta.url), 'utf8');
const responsiveSource = await readFile(new URL('../css/responsive.css', import.meta.url), 'utf8');
const versionSource = await readFile(new URL('../js/version.js', import.meta.url), 'utf8');

test('viewport opts into device safe areas and exposes shared inset tokens', () => {
  assert.match(indexSource, /name="viewport"[^>]*content="[^"]*viewport-fit=cover/);

  for (const side of ['top', 'right', 'bottom', 'left']) {
    assert.match(
      baseSource,
      new RegExp(`--safe-area-${side}:\\s*env\\(safe-area-inset-${side},\\s*0px\\)`)
    );
  }
});

test('full-height application surfaces use dynamic viewport units with fallbacks', () => {
  assert.match(baseSource, /body\s*\{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/s);
  assert.match(baseSource, /\.app-container\s*\{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/s);
  assert.match(layoutSource, /\.sidebar\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;/s);
  assert.match(layoutSource, /\.main-content\s*\{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/s);
  assert.match(plannerSource, /#planner\.section\.active\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;/s);
  assert.match(infoSource, /#info\.section\.active\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;/s);
  assert.match(componentsSource, /\.login-screen\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;/s);
});

test('responsive navigation keeps the rail and content clear of the left safe area', () => {
  for (const width of ['60px', '50px', '44px']) {
    assert.match(
      responsiveSource,
      new RegExp(`sidebar\\.collapsed[\\s\\S]*?width:\\s*calc\\(${width} \\+ var\\(--safe-area-left\\)\\)`)
    );
    assert.match(
      responsiveSource,
      new RegExp(`sidebar\\.collapsed ~ \\.main-content[\\s\\S]*?margin-left:\\s*calc\\(${width} \\+ var\\(--safe-area-left\\)\\)`)
    );
  }
});

test('fixed interaction surfaces respect safe areas and dynamic viewport height', () => {
  assert.match(chatSource, /\.chat-bubble\s*\{[^}]*--safe-area-bottom[^}]*--safe-area-right/s);
  assert.match(chatSource, /\.chat-panel\s*\{[^}]*100dvh[^}]*--safe-area-top[^}]*--safe-area-bottom/s);
  assert.match(chatSource, /max-height:\s*min\(70dvh,/);
  assert.match(chatSource, /\.chat-messages\s*\{[^}]*overscroll-behavior:\s*contain/s);
  assert.match(componentsSource, /\.edit-modal-content\s*\{[^}]*max-height:[^}]*80dvh/s);
  assert.match(componentsSource, /\.selection-counter\s*\{[^}]*--safe-area-bottom[^}]*--safe-area-right/s);
});

test('safe viewport release assets share one cache identity', () => {
  assert.match(versionSource, /number:\s*'2026\.07\.15\.7'/);
  assert.match(versionSource, /codename:\s*'Living Compass'/);

  for (const asset of ['css/chat.css', 'css/info.css', 'js/main.js']) {
    assert.match(indexSource, new RegExp(`${asset.replace('.', '\\.')}\\?v=2026\\.07\\.15\\.7`));
  }
});
