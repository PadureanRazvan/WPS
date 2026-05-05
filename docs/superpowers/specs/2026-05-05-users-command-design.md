# Users Command Design

## Goal

Move Agent form/save rules out of `js/users.js` into a deeper, tested Module while keeping the browser shell responsible for DOM rendering, modal lifecycle, Firestore writes, and user messages.

## Design

`js/users-command.js` owns the Users Command:

- validate and build new Agent payloads from the create-Agent form
- normalize inline Agent field comparisons and decide whether an inline edit is a no-op, direct update, contract modal, primary-team modal, or validation error
- build contract-change update payloads, including current-month Planner day rewrites
- build primary-team change payloads, including Primary Team History and future monthly Planner rewrites
- build deactivate/reactivate payloads, including `DZ` application/clearing and activity metadata
- accept a `timestampFromDate` adapter for Firestore Timestamp conversion so tests can exercise command rules without importing Firebase

`js/users.js` remains the Users shell. It still owns Firestore subscriptions, table rendering, modal opening/closing, Litepicker instances, calls to `addAgent`/`updateAgent`/`deleteAgent`, `logActivity`, translated messages, and public exports.

## Scope

- Add `js/users-command.js`.
- Update `js/users.js` to consume Users Command helpers.
- Update shell cleanup tests so Users shell delegates through Users Command, and Users Command delegates Agent Lifecycle rules.
- Keep Users public exports stable.
- Do not change Firestore collection names, schema shape, delete behavior, modal controls, table markup, or Planner save/delete behavior.

## Verification

- Run Users Command tests.
- Run Users shell cleanup and Agent Lifecycle cleanup tests.
- Run the full Node test suite.
- Browser smoke should verify the Users tab renders and the create/edit modal controls still open without committing Agent writes unless explicitly approved.
