# Runtime Deploy Hardening Design

## Goal

Make production deployment safer and less manual by adding a repeatable Runtime Deploy Hardening Module for smoke checks, versioned GitHub Pages validation, rollback notes, and no-write production verification.

## Design

`scripts/production-smoke.mjs` owns the runtime smoke Interface:

- build a versioned production URL from a merge commit
- reuse an existing Chrome CDP page target, preferring an already-open Sherpa tab
- refuse to open duplicate tabs or windows
- import key architecture Modules with the version query
- verify the authenticated shell is visible
- navigate to Reports and click refresh only
- report console, runtime, log, and network errors after filtering expected browser noise

`docs/deployment.md` owns the deployment checklist: backup, tests, PR/checks, GitHub Pages availability, single external Chrome smoke, and rollback.

## Scope

- Add `scripts/production-smoke.mjs`.
- Add deployment docs and the Runtime Deploy Hardening term to `CONTEXT.md`.
- Add tests for the smoke helpers and deployment docs.
- Do not change app runtime behavior, Firestore schema, persistence commands, or production data.

## Verification

- Run the new Runtime Deploy Hardening tests.
- Run the production smoke script against the current production merge commit.
- Run the full Node test suite.
- Run git whitespace checks before commit.
