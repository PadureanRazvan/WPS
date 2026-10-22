# Sherpa AI Security

Sherpa AI uses a callable Firebase Function named `generateSherpaChat`. The browser sends an authenticated conversation request to the function, which calls a private Cloud Run worker using a dedicated service identity. The worker runs pinned Codex with ChatGPT-managed authentication, model `gpt-6-luna`, and reasoning effort `max`. See [cloud setup and operations](sherpa-codex-cloud.md) for deployment gates and verified status.

The function runs in `europe-west8` alongside the existing Milan Firestore database.

## Security Boundaries

- Firebase Authentication identifies the caller.
- Both Firestore Rules and the callable function require a verified account from `fspglobal.com`, `fsp-global.com`, or `sharpmindsglobal.com`. The approved Gmail identities `rahela231091@gmail.com`, `rahela.vlasa@gmail.com`, and `reizvanmail@gmail.com` are explicitly allowlisted.
- The gateway validates payloads and caller identity. The worker owns the system prompt, seven allowed browser data-query declarations, model selection, structured response validation, and safe upstream error mapping. The legacy browser response shape is retained so existing proposal confirmations continue to work.
- Each user is limited to 30 model rounds per minute. A normal chat request may use several rounds when Sherpa queries live planner data.
- CORS accepts the production GitHub Pages origin and local development origins.
- The gateway has no model credentials. Only the dedicated worker identity can read and append versions of its dedicated Secret Manager authentication secret. Refreshed ChatGPT credentials are persisted before releasing the account lease; they never enter Firestore, Git, logs, images, or browser responses.
- A distributed account lease serializes runs across cold starts and overlapping deployments. Credential write-back failures quarantine the worker until the operator repairs its dedicated sign-in state. Each invocation uses an isolated temporary Codex home; the model has no shell, file, plugin, browser, or other host-tool access.
- Cloud Run requires IAM authentication, and the worker independently verifies the gateway's signed identity token. Public GitHub Actions never receive the ChatGPT session. Worker credentials are established through a separate sign-in, not copied from a concurrently active desktop session.
- The retired `config/gemini` document is denied by Firestore Rules and should remain deleted.

## Confirmed Agent Changes

Model responses can propose changes, but cannot execute them directly. The browser validates the entire proposal before showing any confirmation controls. All writes, including a single Planner Cell edit or a new Agent, require the **Apply changes** button. The confirmation lists the affected Agents and their usernames, dates, schedule values, contract details for new Agents, and a permanent-deletion warning where applicable.

`SET_CELL` and `DELETE_AGENT` use exact Firestore document IDs returned by `get_agent_list`. The `get_agent_schedule` tool takes `agent_id`. Empty, partial, and ambiguous identities are rejected. Invalid dates, schedule values, duplicate or conflicting actions, and proposals containing more than 15 action tags reject the whole proposal. Calendar dates use Europe/Bucharest.

Free-text replies never approve writes. A new message, Cancel, Clear, or logout invalidates the pending proposal. Responses arriving after Clear or logout are discarded. Apply consumes the proposal before awaiting persistence, preventing repeated clicks from committing it twice. Clear and logout do not reverse a transaction that was already approved and submitted.

Confirmed edits, additions, and deletions commit together in one Firestore transaction. A conflict or rejected write produces an error without a success response. These browser controls protect the AI interaction; Firestore Rules remain the authorization boundary for direct clients. Existing approved staff identities retain their current collection permissions.

Deploy the frontend and `generateSherpaChat` together when changing this protocol. Old name-based responses are rejected by the new client. See [the security-fix rollout notes](security-fixes.md).

## Activate Subscription-Authenticated Codex

The Firebase project must have an active billing account (Blaze). Deployment and initial dedicated ChatGPT sign-in are separate steps; follow the [cloud runbook](sherpa-codex-cloud.md). Model usage consumes the signed-in account's Codex allowance; Google hosting is billed separately. A renewed interactive sign-in may occasionally be required if the dedicated session is revoked or expires.

```powershell
./scripts/deploy-sherpa-codex-cloud.ps1
```

The callable configuration contains only `SHERPA_CODEX_WORKER_URL` and `SHERPA_GATEWAY_SERVICE_ACCOUNT`. Neither is a credential. The former Gemini key is not needed or mounted by this deployment. The shared policy retains compatibility helpers for old request fixtures; they are not called by the live Codex gateway.

## Enable App Check

Authentication protects the function immediately. App Check is the final defense against scripted use of stolen user sessions and should be enabled after billing is active:

1. Register the Sherpa web app with Firebase App Check using reCAPTCHA Enterprise.
2. Allow `padureanrazvan.github.io` and the final client domain in the reCAPTCHA key.
3. Put the public site key in `appCheckSiteKey` in `js/firebase-environments.js`.
4. Deploy the frontend and confirm valid App Check traffic in the Firebase console.
5. Change `enforceAppCheck` to `true` in `functions/index.js` and redeploy the function.

Do not enforce App Check before the browser is producing valid tokens; doing so would block every Sherpa AI request.

## Ownership Cleanup

The billing account, Cloud Run service, Secret Manager secret, and callable function must belong to the client-controlled Google Cloud project. ChatGPT account ownership and permitted users must also be reviewed before widening service access. After the support period, review the explicit Gmail exceptions in `js/auth-policy.js`, `functions/sherpa-ai-policy.js`, and `firestore.rules`, then redeploy the frontend, function, and rules together if the allowlist changes.
