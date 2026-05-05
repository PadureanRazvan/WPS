# App Shell Wiring Design

## Goal

Move app boot and top-level DOM wiring out of `js/main.js` into a deeper, tested Module. Keep `main.js` responsible for module initialization order, dynamic greeting generation, and concrete adapters such as auth, UI actions, logs, and cleanup functions.

## Design

`js/app-shell-wiring.js` owns App Shell Wiring:

- show or hide the authenticated app shell and login screen
- populate the sidebar user identity from the authenticated user
- bind navigation clicks to `showSection`
- bind theme toggles to `setTheme`
- bind language dropdown state and language selection updates
- bind logout button behavior while preserving the app-initialized flag reset
- bind DOMContentLoaded login-screen boot actions and auth callbacks
- bind before-unload cleanup
- bind cross-module Productivity refresh events
- tolerate missing DOM nodes and missing browser globals for tests and inactive screens

`js/main.js` remains the browser composition shell. It still owns the module initialization sequence, dynamic daily greeting fetch/write behavior, concrete auth/log/UI adapters, and public boot side effects.

## Scope

- Add `js/app-shell-wiring.js`.
- Update `js/main.js` to delegate App Shell Wiring.
- Keep auth flow, module initialization order, logout cleanup, dynamic greeting behavior, and feature Module writes unchanged.
- Do not change Firestore schema, Planner/User/Productivity command payloads, navigation markup, or modal behavior.

## Verification

- Run App Shell Wiring tests and shell cleanup tests.
- Run focused Planner interaction, Productivity controls, and Users Command regressions.
- Run the full Node test suite.
- Browser smoke should load production, verify the logged-in app shell is visible, switch between Dashboard/Users/Planner via nav, toggle language/theme without errors, and avoid write actions.
