# Sherpa security and data-integrity fixes

Implemented after the September 7, 2026 code review. This document describes the code changes and deployment considerations; it does not record a production deployment.

## Changes

- Stored Agent names, usernames, team labels, schedule values, and relevant HTML attributes are escaped in Users, Planner filters, Dashboard, and Productivity. Hydrated Agent IDs come from the Firestore document, never a stored `id` field.
- AI writes require an explicit, reviewable confirmation button. Refusal text cannot trigger deletion; Cancel, Clear, new messages, and logout invalidate pending proposals. Exact IDs and whole-proposal validation replace fuzzy matching and partial execution.
- Agent updates use Firestore transactions. Separate users can edit different cells or notes without overwriting each other. Changes to the same value reject when they conflict. Mixed AI proposals commit atomically. Deletion and month clearing reject stale records.
- Planner undo applies only the original change in reverse and refuses to erase a newer conflicting edit. Undo history and success messages are created only after a successful commit; a rejected undo preserves the history entry.
- Write errors propagate to the UI. Failed Planner saves leave the edit form open. Failed Productivity deletions preserve local data, and upload parsing no longer overwrites the subscribed state before saving. Ticket uploads replace only tickets; call uploads replace only calls.
- The Functions lockfile resolves `fast-xml-parser` to 5.11.1 and overrides `qs` to 6.16.0. The production dependency audit reports zero known vulnerabilities at implementation time.

## Verification

Local validation passed on Node 22.23.2: 429 app tests and 6 Functions tests, the Functions syntax check, the Chrome desktop/mobile regression check, and `git diff --check`. The Functions production dependency audit returned zero known vulnerabilities.

Use Node 22, matching the Functions runtime:

```powershell
node --test tests/*.test.mjs
npm --prefix functions run check
npm --prefix functions audit --omit=dev
node scripts/security-browser-smoke.mjs
git diff --check
```

The browser check requires Playwright and an installed Chromium browser. `SHERPA_PLAYWRIGHT_MODULE` can point to the installed Playwright package, and `SHERPA_BROWSER_PATH` can point to Chrome. It exercises the actual Users and chat shells plus the Productivity renderer using local fixtures, blocks external requests, and saves desktop/mobile confirmation screenshots under `output/security-smoke/`.

Transaction tests use a deterministic Firestore adapter with contention and retry simulation. They cover concurrent different-cell edits, same-cell conflicts, atomic multi-Agent failure, safe undo, stale deletion, first edits in a new month, hidden pre-hire days, and mixed AI commands. These tests do not connect to production or substitute for a Firebase emulator integration test.

## Rollout and rollback

Follow [the deployment flow](deployment.md), including its backup and release checks. Before deployment, cut a new release in `js/version.js`, update the frontend cache queries, and ensure the changed unversioned modules are fetched fresh. The version queries of parent ES modules do not automatically apply to their imports. Have active users reload after the frontend is available; an already-open old client can still overwrite a monthly array.

Deploy `generateSherpaChat` and the frontend as one coordinated release because the AI action and tool protocol now uses document IDs. Deploying the new function first makes old clients unable to resolve the new IDs; deploying the new frontend first makes it reject old name-based proposals. The short transition can interrupt AI actions, so complete both deployments before resuming them.

No Firestore schema migration or Rules change is required. Monthly schedules remain arrays and existing documents remain readable. Transactions require connectivity and fail visibly when offline; users must retry after reconnecting. Ordinary Productivity `setDoc` writes retain Firestore's pending-write behavior, with success feedback waiting for server acknowledgement.

Rollback restores the previous frontend and function together. Existing data remains compatible, but rollback restores the original confirmation and overwrite risks. Review pending writes and reload active clients before resuming work. No automatic rollback deletes or rewrites Firestore documents.

Role-specific Firestore permissions and App Check enforcement remain separate work requiring the intended staff permission model and App Check registration.
