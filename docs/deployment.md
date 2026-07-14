# Sherpa Deployment Flow

This flow is for production changes to `https://padureanrazvan.github.io/WPS/`.

## Pre-Deploy

1. Confirm the working tree only contains the intended slice.
2. Confirm there is a recent Firestore backup before deploying production code. If the current backup is not acceptable for the risk level, create a fresh backup first.
3. Run the focused tests for the slice.
4. Run the full suite:

```powershell
node --test tests/*.test.mjs
npm --prefix functions run check
npm --prefix functions audit --omit=dev
```

5. Run whitespace checks before commit:

```powershell
git diff --check HEAD
git diff --cached --check
```

6. For AI or authorization changes, review `docs/ai-security.md`. Never place the Gemini key in Firestore, a local environment file, Git, or a browser prompt.

## Firebase Backend

Deploy Firestore Rules independently when their tests pass:

```powershell
npx firebase-tools@15.23.0 deploy --only firestore:rules --project wps-sherpa-database
```

The AI function requires the client-owned billing profile and the `GEMINI_API_KEY` Secret Manager secret. Set and deploy it using the hidden CLI prompt documented in `docs/ai-security.md`.

## Production Merge

1. Push the `codex/*` branch.
2. Open a draft PR with the scope, safety notes, and verification commands.
3. Wait for GitHub checks.
4. Mark the PR ready and merge to `main` only after local tests and remote checks pass.
5. Record the merge commit short SHA. Use that SHA as the version query for smoke checks.

## GitHub Pages Availability

After merge, wait for GitHub Pages to serve any new or changed runtime Module using the merge commit:

```powershell
Invoke-WebRequest https://padureanrazvan.github.io/WPS/js/<module>.js?v=<commit> -UseBasicParsing
```

The response should be `200` and contain an expected exported function or constant.

## Read-Only Production Smoke

Use one single external Chrome session with remote debugging on port `9227`. Do not use the in-app browser for Sherpa production smoke checks.

Run:

```powershell
node scripts/production-smoke.mjs --version <commit>
```

The smoke reuses the existing Sherpa tab when available. It does not open repeated tabs or windows. It performs no Firestore writes: no Save, Add, Delete, Undo, upload, clear-month, or confirmation actions.

Expected evidence:

- authenticated shell is visible
- key architecture Modules import with the version query
- Reports opens and refreshes
- no relevant console, runtime, log, or network errors are reported

If Chrome is logged out, log in once in the existing external Chrome tab and rerun the smoke.

## Rollback

For architecture slices that do not mutate Firestore data, rollback is to revert the merge commit and redeploy GitHub Pages:

```powershell
git switch main
git pull --ff-only
git revert -m 1 <merge-commit>
git push origin main
```

After rollback, run the same GitHub Pages availability check and `node scripts/production-smoke.mjs --version <rollback-commit>`.

If a future slice includes data writes or schema changes, write a specific rollback note before deploying that slice.
