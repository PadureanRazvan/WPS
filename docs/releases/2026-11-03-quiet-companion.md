# Quiet Companion — 2026.11.03

Deactivate Rahela's 3D figure for every account and leave a static 44px AI chat button. The header also uses a neutral chat symbol. Mouse, touch and keyboard activation open the existing conversation panel; closing returns focus to the button. Opening now fades opacity only, so the composer is immediately visible to keyboard focus and Escape works without an extra click.

`SHERPA_COMPANION_ENABLED = false` in `js/chat.js` gates both companion creation and its lazy imports. Account preferences cannot enable it. The figure's markup is preserved in an inert template, and the character modules, model, portrait, physics, styles and Firestore preferences are retained. No figure is rendered and no companion preference read or write starts while disabled.

The release starts from production merge `1fd11b1`. Backend, authorization, AI transport, Firestore rules and records are unchanged. Other JavaScript changes only refresh the release cache key. Existing browser sessions receive the change on reload.

## Verification and rollout

- 608 frontend tests and 25 backend checks passed. Release-map verification covers all 104 local modules; whitespace checks passed.
- Nine offline chat browser scenario groups passed with no uncaught errors, including keyboard activation, desktop/mobile layout, resizing, chat activity, Stop/Clear, explicit action confirmation and logout. Each startup also verifies the 44px launcher, absence of mounted character controls and zero companion JavaScript/portrait downloads.
- A separate launcher review passed for two simulated accounts at 1440px and 390px: pointer/touch activation, Space, immediate composer focus, Escape/focus return, close, logout and signing back in. Both accounts made zero companion downloads/subscriptions; visual screenshots show the compact button and no figure.
- The unchanged Functions dependency audit reports one high (`body-parser`) and two moderate (`qs` and its `express` dependency path) findings. This is not a passing audit; backend dependency remediation remains separate from this frontend-only release.
- The existing 21 October Firestore backup was reverified against its SHA-256 manifest: 18,335 documents across six collections. That snapshot is sufficient for this visual change because rollback restores frontend code, with no data/schema migration or backend deployment.

Follow the existing branch, PR, checks and GitHub Pages deployment flow. Production verification compares served assets with the release commit and checks the available external Chrome session without sending chat messages or writing records. Local evidence is under ignored `output/quiet-companion/` and `output/chat-experience/`.

## Restoration and rollback

To restore the figure in a later approved release, set the global constant to `true`, update the release identity, refresh the assets and rerun companion/browser checks. Its original markup and saved preferences will be used. To roll back this whole release, revert its merge commit and let GitHub Pages republish. Neither procedure requires deleting or restoring Firestore data.
