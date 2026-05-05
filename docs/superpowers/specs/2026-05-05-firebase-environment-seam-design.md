# Firebase Environment Seam Design

## Goal

Make production Firestore usage explicit and safe before deeper WPS architecture refactors.

## Design

The first slice adds a small Firebase environment module. Production remains the default and keeps the existing `wps-sherpa-database` config unchanged. Development exists as a named environment, but it is intentionally unconfigured until a clone Firebase project is approved and wired in.

The active environment is resolved from an explicit runtime value such as `window.WPS_FIREBASE_ENV`. If no value is provided, the app uses `production`. Unknown environments fail fast. Selecting `development` before clone credentials exist also fails fast, so the app cannot silently drift into an incomplete or accidental Firebase target.

## Scope

- Add a pure Firebase environment module with a small interface:
  - resolve the active environment name
  - return the Firebase config for that environment
  - report whether an environment is configured
- Wire the existing Firebase initialization through that module.
- Add Node tests around the environment-selection rules.
- Do not enable Firestore, create buckets, attach billing, or write to any cloud project.

## Verification

- Run the new environment tests.
- Run the full existing Node test suite.
- Reload external Chrome at `http://localhost:3000/` and confirm the app still reaches the login screen.
- Do not perform logged-in write flows against production.
