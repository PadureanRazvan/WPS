# Sherpa AI Security

Sherpa AI uses a callable Firebase Function named `generateSherpaChat`. The browser sends an authenticated conversation request to the function; only the function can read `GEMINI_API_KEY` from Google Cloud Secret Manager and call Gemini.

The function runs in `europe-west8` alongside the existing Milan Firestore database.

## Security Boundaries

- Firebase Authentication identifies the caller.
- Both Firestore Rules and the callable function require a verified account from `fspglobal.com`, `fsp-global.com`, or `sharpmindsglobal.com`. The approved Gmail identities `rahela231091@gmail.com`, `rahela.vlasa@gmail.com`, and `reizvanmail@gmail.com` are explicitly allowlisted.
- The callable function owns the system prompt, tool declarations, Gemini model, payload limits, and upstream error mapping.
- Each user is limited to 30 model rounds per minute. A normal chat request may use several rounds when Sherpa queries live planner data.
- CORS accepts the production GitHub Pages origin and local development origins.
- Gemini credentials are never stored in Firestore, committed to Git, or returned to the browser.
- The retired `config/gemini` document is denied by Firestore Rules and should remain deleted.

## Confirmed Agent Changes

Model responses can propose changes, but cannot execute them directly. The browser validates the entire proposal before showing any confirmation controls. All writes, including a single Planner Cell edit or a new Agent, require the **Apply changes** button. The confirmation lists the affected Agents and their usernames, dates, schedule values, contract details for new Agents, and a permanent-deletion warning where applicable.

`SET_CELL` and `DELETE_AGENT` use exact Firestore document IDs returned by `get_agent_list`. The `get_agent_schedule` tool takes `agent_id`. Empty, partial, and ambiguous identities are rejected. Invalid dates, schedule values, duplicate or conflicting actions, and proposals containing more than 15 action tags reject the whole proposal. Calendar dates use Europe/Bucharest.

Free-text replies never approve writes. A new message, Cancel, Clear, or logout invalidates the pending proposal. Responses arriving after Clear or logout are discarded. Apply consumes the proposal before awaiting persistence, preventing repeated clicks from committing it twice. Clear and logout do not reverse a transaction that was already approved and submitted.

Confirmed edits, additions, and deletions commit together in one Firestore transaction. A conflict or rejected write produces an error without a success response. These browser controls protect the AI interaction; Firestore Rules remain the authorization boundary for direct clients. Existing approved staff identities retain their current collection permissions.

Deploy the frontend and `generateSherpaChat` together when changing this protocol. Old name-based responses are rejected by the new client. See [the security-fix rollout notes](security-fixes.md).

## Activate A New Gemini Key

Do not paste the key into source code, Firestore, GitHub, or chat. After the client-owned billing profile and Gemini project are ready, run this from the repository root and paste the key only into the CLI's hidden prompt:

```powershell
npx firebase-tools@15.23.0 functions:secrets:set GEMINI_API_KEY --project wps-sherpa-database
npx firebase-tools@15.23.0 deploy --only functions:generateSherpaChat --project wps-sherpa-database
```

The function defaults to `gemini-2.5-flash`. To change it, configure `SHERPA_GEMINI_MODEL` through Firebase's parameter prompt during deployment or a project-specific Functions environment file. Do not place credentials in that file.

## Enable App Check

Authentication protects the function immediately. App Check is the final defense against scripted use of stolen user sessions and should be enabled after billing is active:

1. Register the Sherpa web app with Firebase App Check using reCAPTCHA Enterprise.
2. Allow `padureanrazvan.github.io` and the final client domain in the reCAPTCHA key.
3. Put the public site key in `appCheckSiteKey` in `js/firebase-environments.js`.
4. Deploy the frontend and confirm valid App Check traffic in the Firebase console.
5. Change `enforceAppCheck` to `true` in `functions/index.js` and redeploy the function.

Do not enforce App Check before the browser is producing valid tokens; doing so would block every Sherpa AI request.

## Ownership Cleanup

The new Gemini project, billing account, Secret Manager secret, and callable function must all belong to the client-controlled Google Cloud organization. After the support period, review the explicit Gmail exceptions in `js/auth-policy.js`, `functions/sherpa-ai-policy.js`, and `firestore.rules`, then redeploy the frontend, function, and rules together if the allowlist changes.
