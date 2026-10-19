import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserModule } from './helpers/browser-module.mjs';
import * as themes from '../js/theme-system.js';

function fixture({ reduced = false, themePreference = 'dark', colorScheme = null } = {}) {
    function element(active = false) {
        const values = new Set(active ? ['active'] : []), attributes = {};
        return {
            attributes,
            classList: {
                add: (...names) => names.forEach(name => values.add(name)),
                remove: (...names) => names.forEach(name => values.delete(name)),
                contains: name => values.has(name),
                toggle(name, force) { const show = force ?? !values.has(name); if (show) values.add(name); else values.delete(name); return show; }
            },
            setAttribute: (key, value) => attributes[key] = value,
            removeAttribute: key => delete attributes[key]
        };
    }
    const ids = ['dashboard', 'planner', 'reports', 'logs'];
    const sections = Object.fromEntries(ids.map(id => [id, element(id === 'dashboard')]));
    const navigation = Object.fromEntries(ids.map(id => [id, { ...element(id === 'dashboard'), dataset: { tooltip: id } }]));
    const frames = [], calls = [];
    const root = {
        documentElement: { dataset: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, animate() { calls.push('theme-animation'); } },
        getElementById: id => sections[id],
        querySelector: () => null,
        querySelectorAll: selector => selector === '.nav-item' ? Object.values(navigation) : selector === '.section' ? Object.values(sections) : [],
        addEventListener() {},
        startViewTransition() { throw Error('Navigation must not take a page snapshot'); }
    };
    const shell = loadBrowserModule('../../js/ui.js', {
        ...themes, document: root,
        window: { matchMedia: query => query.includes('color-scheme') && colorScheme ? colorScheme : ({ matches: query.includes('reduced-motion') && reduced }), addEventListener() {} },
        localStorage: { getItem: key => key === 'theme' ? themePreference : 'en', setItem() {} },
        requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
        renderPlannerTable: () => calls.push('planner-render'), renderLogsSection: () => calls.push('logs-render')
    }, 'globalThis.ui = { showSection, setTheme };');
    return { ui: shell.ui, root, sections, navigation, frames, calls };
}

test('a navigation click updates the view and aria-current synchronously', () => {
    const f = fixture();
    f.ui.showSection('reports', f.navigation.reports);
    assert.equal(f.sections.reports.classList.contains('active'), true);
    assert.equal(f.sections.dashboard.classList.contains('active'), false);
    assert.equal(f.navigation.reports.attributes['aria-current'], 'page');
    assert.equal(f.sections.reports.classList.contains('section-enter'), true);
});

test('rapid navigation honors every click and the latest section wins', () => {
    const f = fixture();
    for (const id of ['reports', 'planner', 'logs', 'dashboard']) f.ui.showSection(id, f.navigation[id]);
    assert.equal(f.sections.dashboard.classList.contains('active'), true);
    f.frames.forEach(callback => callback());
    assert.ok(!f.calls.includes('planner-render'), 'an abandoned planner render should not block the new view');
    assert.ok(f.calls.includes('logs-render'));
});

test('reduced-motion navigation commits the same state without entrance motion', () => {
    const f = fixture({ reduced: true });
    f.ui.showSection('reports', f.navigation.reports);
    assert.equal(f.sections.reports.classList.contains('active'), true);
    assert.equal(f.sections.reports.classList.contains('section-enter'), false);
});

test('a superseded theme callback cannot overwrite the latest chosen palette', async () => {
    const f = fixture();
    let commit, resolveReady, resolveFinished, skipped = 0;
    f.root.startViewTransition = callback => {
        commit = callback;
        return { ready: new Promise(resolve => resolveReady = resolve), finished: new Promise(resolve => resolveFinished = resolve), skipTransition: () => skipped++ };
    };
    f.ui.setTheme('light');
    f.ui.setTheme('dark');
    commit(); resolveReady(); resolveFinished(); await Promise.resolve();
    assert.equal(f.root.documentElement.attributes['data-theme'], 'dark');
    assert.equal(skipped, 1);
    assert.ok(!f.calls.includes('theme-animation'));
});

test('System follows a live OS color change once, while an explicit palette stays selected', () => {
    let callback, bindings = 0;
    const colorScheme = { matches: false, addEventListener(_type, handler) { bindings++; callback = handler; } };
    const f = fixture({ reduced: true, themePreference: 'system', colorScheme });
    f.ui.setTheme('system');
    assert.equal(f.root.documentElement.attributes['data-theme'], 'light');
    colorScheme.matches = true; callback();
    assert.equal(f.root.documentElement.attributes['data-theme'], 'dark');
    f.ui.setTheme('aurora');
    colorScheme.matches = false; callback();
    assert.equal(f.root.documentElement.attributes['data-theme'], 'aurora');
    assert.equal(bindings, 1);
});
