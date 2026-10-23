# Open Dialogue — 2026.10.23.2

Keep the Sherpa chat header and composer reachable after moving between screen sizes, browser zoom, or an on-screen keyboard. Pointer, touch and keyboard dragging, a position reset, and visual-viewport clamping replace fixed companion offsets. The simpler conversation surface includes a multiline composer, editable prompt suggestions, an expandable trail of actual operations, Stop waiting, and preserved reading position.

See [chat behavior and verification](../chat-experience.md). No package dependencies are added. Hidden animation pauses and geometry work is event-driven. Existing proposal confirmation and transaction acknowledgement remain required for data writes. Stop ignores a pending response; it cannot abort the Firebase request or interrupt an approved write.

## Rollout and verification

The release builds on `c2cafc5` (Luna Relay), preserving the Codex gateway, 330-second client callable timeout, error mappings, companion and Planner startup repair. All otherwise unrelated runtime diffs refresh the release query. No Functions, Cloud Run, Firestore rules, secrets, schema or workforce-data deployment is needed.

The feature commit passed 608 frontend tests, 25 Firebase callable tests and nine offline browser scenarios. The Functions dependency audit reported zero vulnerabilities. GitHub's Node 22 and container workflow also passed for the feature commit; the release commit must pass the same workflow before merge. Release-map and whitespace verification cover generated URLs.

Recent backup evidence is the 21 October verified snapshot recorded in the cloud and Birthday Spark runbooks: 18,335 documents across six collections. This frontend-only rollout does not change records or schema; rollback restores code rather than data. Keep private backup records outside Git.

After merge, verify GitHub Pages completed, compare the live index/version/chat assets with the tested checkout, and run the existing single-tab production smoke. Exercise chat opening, closing, drag/reset and activity controls without submitting AI requests or approving writes. Save the publication receipt and any screenshots in ignored `output/chat-experience/`.

## Rollback

Revert the release merge and let GitHub Pages publish the previous frontend. Keep the current Codex backend and Firestore data unchanged. Do not restore workforce records for this UI release.
