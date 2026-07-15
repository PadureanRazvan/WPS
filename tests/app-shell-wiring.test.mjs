import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bindAppLifecycleEvents,
  bindAppRefreshEvents,
  bindAppShellInteractions,
  showAuthenticatedShell,
  showLoginScreen
} from '../js/app-shell-wiring.js';

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(className) {
    this.values.add(className);
  }

  remove(className) {
    this.values.delete(className);
  }

  contains(className) {
    return this.values.has(className);
  }

  toggle(className) {
    if (this.values.has(className)) {
      this.values.delete(className);
      return false;
    }
    this.values.add(className);
    return true;
  }
}

class FakeElement {
  constructor({ id = '', dataset = {}, classes = [], value = '', matchesInput = false } = {}) {
    this.id = id;
    this.dataset = dataset;
    this.value = value;
    this.src = '';
    this.textContent = '';
    this.style = { display: '' };
    this.attributes = {};
    this.focused = false;
    this.listeners = new Map();
    this.added = [];
    this.classList = new FakeClassList(classes);
    this.matchesInput = matchesInput;
  }

  addEventListener(type, handler) {
    this.added.push([type, handler]);
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  dispatch(type, event = {}) {
    const handlers = this.listeners.get(type) || [];
    handlers.forEach(handler => handler({
      ...event,
      currentTarget: this,
      target: event.target || this,
      preventDefault: event.preventDefault || (() => {}),
      stopPropagation: event.stopPropagation || (() => {})
    }));
  }

  closest(selector) {
    if (selector === '.language-option' && this.classList.contains('language-option')) return this;
    if (selector === '.theme-option' && this.classList.contains('theme-option')) return this;
    if (selector === '.theme-selector' && this.classList.contains('theme-selector')) return this;
    return null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  focus() {
    this.focused = true;
  }
}

function makeRoot({ ids = {}, selectors = {}, selectorLists = {}, documentElement } = {}) {
  return {
    documentElement: documentElement || {
      attributes: { 'data-theme': 'dark' },
      getAttribute(name) { return this.attributes[name]; }
    },
    getElementById(id) {
      return ids[id] || null;
    },
    querySelector(selector) {
      return selectors[selector] || null;
    },
    querySelectorAll(selector) {
      return selectorLists[selector] || [];
    }
  };
}

function makeEventTarget() {
  const target = new FakeElement();
  target.dispatchEventName = function dispatchEventName(type, event = {}) {
    this.dispatch(type, event);
  };
  return target;
}

function recorder() {
  const calls = [];
  const fn = (...args) => calls.push(args);
  fn.calls = calls;
  return fn;
}

test('showLoginScreen and showAuthenticatedShell toggle app visibility and sidebar user details', () => {
  const loginScreen = new FakeElement();
  const appContainer = new FakeElement();
  const avatar = new FakeElement();
  const userName = new FakeElement();
  const userEmail = new FakeElement();
  const root = makeRoot({
    ids: { loginScreen, appContainer, userAvatar: avatar, userName, userEmail }
  });

  showLoginScreen(root);
  assert.equal(loginScreen.style.display, 'flex');
  assert.equal(appContainer.style.display, 'none');

  showAuthenticatedShell({
    photoURL: 'https://example.test/avatar.png',
    displayName: 'Ada Planner',
    email: 'ada@example.test'
  }, root);

  assert.equal(loginScreen.style.display, 'none');
  assert.equal(appContainer.style.display, '');
  assert.equal(avatar.src, 'https://example.test/avatar.png');
  assert.equal(avatar.style.display, 'block');
  assert.equal(userName.textContent, 'Ada Planner');
  assert.equal(userEmail.textContent, 'ada@example.test');
});

test('bindAppShellInteractions wires navigation, theme, language, planner controls, sidebar, and logout', async () => {
  const navPlanner = new FakeElement({ dataset: { tooltip: 'planner' } });
  const navUsers = new FakeElement({ dataset: { tooltip: 'users' } });
  const themeToggle = new FakeElement();
  const themeMenu = new FakeElement();
  const auroraOption = new FakeElement({ classes: ['theme-option'], dataset: { themeChoice: 'aurora' } });
  const languageDropdown = new FakeElement();
  const languageMenu = new FakeElement();
  const englishOption = new FakeElement({ classes: ['language-option'], dataset: { lang: 'en' } });
  const sidebarToggle = new FakeElement();
  const logoutBtn = new FakeElement();
  const documentElement = {
    theme: 'dark',
    getAttribute(name) {
      return name === 'data-theme' ? this.theme : null;
    }
  };
  const root = makeRoot({
    documentElement,
    ids: { themeMenu, languageMenu, logoutBtn },
    selectors: {
      '.theme-toggle': themeToggle,
      '.language-dropdown': languageDropdown,
      '.sidebar-toggle': sidebarToggle
    },
    selectorLists: {
      '.nav-item': [navPlanner, navUsers]
    }
  });
  const actions = {
    showSection: recorder(),
    setTheme: recorder(),
    updateLanguageUI: recorder(),
    bindPlannerControls: recorder(),
    toggleSidebar: recorder(),
    logout: recorder(),
    setAppInitialized: recorder()
  };
  let currentLanguage = 'ro';

  bindAppShellInteractions({
    root,
    actions,
    getCurrentLanguage: () => currentLanguage,
    setCurrentLanguage: value => { currentLanguage = value; }
  });

  assert.deepEqual(actions.updateLanguageUI.calls, [['ro']]);
  assert.equal(actions.bindPlannerControls.calls.length, 1);

  navPlanner.dispatch('click');
  assert.equal(actions.showSection.calls[0][0], 'planner');
  assert.equal(actions.showSection.calls[0][1], navPlanner);

  themeToggle.dispatch('click');
  assert.equal(themeMenu.classList.contains('open'), true);
  assert.equal(themeToggle.getAttribute('aria-expanded'), 'true');
  themeMenu.dispatch('click', { target: auroraOption, clientX: 110, clientY: 40 });
  assert.deepEqual(actions.setTheme.calls[0], ['aurora', { x: 110, y: 40 }]);
  assert.equal(themeMenu.classList.contains('open'), false);
  assert.equal(themeToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(themeToggle.focused, true);

  languageDropdown.dispatch('click');
  assert.equal(languageMenu.classList.contains('open'), true);
  assert.equal(languageDropdown.classList.contains('open'), true);
  languageMenu.dispatch('click', { target: englishOption });
  assert.equal(currentLanguage, 'en');
  assert.deepEqual(actions.updateLanguageUI.calls.at(-1), ['en']);
  assert.equal(languageMenu.classList.contains('open'), false);
  assert.equal(languageDropdown.classList.contains('open'), false);

  sidebarToggle.dispatch('click');
  assert.equal(actions.toggleSidebar.calls.length, 1);

  logoutBtn.dispatch('click');
  await Promise.resolve();
  assert.equal(actions.logout.calls.length, 1);
  assert.deepEqual(actions.setAppInitialized.calls, [[false]]);
});

test('bindAppLifecycleEvents wires DOM boot, auth callbacks, and unload cleanup', async () => {
  const googleLoginBtn = new FakeElement();
  const rootTarget = makeEventTarget();
  rootTarget.getElementById = id => id === 'googleLoginBtn' ? googleLoginBtn : null;
  const windowTarget = makeEventTarget();
  const storage = {
    getItem(key) {
      return key === 'theme' ? 'light' : null;
    }
  };
  let loginCallback;
  let logoutCallback;
  const actions = {
    setTheme: recorder(),
    setDynamicGreeting: recorder(),
    initLogoAnimation: recorder(),
    loginWithGoogle: recorder(),
    onAuthChange(onLogin, onLogout) {
      loginCallback = onLogin;
      logoutCallback = onLogout;
    },
    onLogin: recorder(),
    onLogout: recorder(),
    cleanupBeforeUnload: recorder()
  };

  bindAppLifecycleEvents({ root: rootTarget, windowTarget, storage, actions });
  rootTarget.dispatchEventName('DOMContentLoaded');

  assert.deepEqual(actions.setTheme.calls, [['light']]);
  assert.equal(actions.setDynamicGreeting.calls.length, 1);
  assert.deepEqual(actions.initLogoAnimation.calls, [['loginLogo', 100]]);

  googleLoginBtn.dispatch('click');
  assert.equal(actions.loginWithGoogle.calls.length, 1);

  await loginCallback({ email: 'ada@example.test' });
  logoutCallback();
  assert.deepEqual(actions.onLogin.calls, [[{ email: 'ada@example.test' }]]);
  assert.equal(actions.onLogout.calls.length, 1);

  windowTarget.dispatchEventName('beforeunload');
  assert.equal(actions.cleanupBeforeUnload.calls.length, 1);
});

test('bindAppRefreshEvents wires Productivity refresh work and is safe without browser globals', () => {
  const eventTarget = makeEventTarget();
  const actions = {
    updateAverageProductivityCard: recorder(),
    initializeProductivityChart: recorder()
  };

  bindAppRefreshEvents({ eventTarget, actions });
  eventTarget.dispatchEventName('productivity-data-updated');

  assert.equal(actions.updateAverageProductivityCard.calls.length, 1);
  assert.equal(actions.initializeProductivityChart.calls.length, 1);

  assert.doesNotThrow(() => bindAppShellInteractions());
  assert.doesNotThrow(() => bindAppLifecycleEvents());
  assert.doesNotThrow(() => bindAppRefreshEvents());
  assert.doesNotThrow(() => showLoginScreen());
  assert.doesNotThrow(() => showAuthenticatedShell({}));
});
