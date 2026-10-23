# Sherpa chat experience

Implemented and validated on 23 October 2026. Release identity and rollout details are in [Open Dialogue](releases/2026-10-23-open-dialogue.md). The review uses offline AI/Firestore fixtures; production verification is read-only.

## Floating window

`js/chat-window.js` owns geometry and input independently of conversation state. The previous mouse-only handler left `top: 800px` unchanged when viewport height fell to `480px`; it had no resize handler. The fixed companion offset and mobile `!important` positioning also restricted recovery.

The panel now clamps its complete rectangle to the available visual viewport and safe-area insets on opening, browser resize, visual viewport resize/scroll, and panel size changes. Manual placement survives closing and reopening. Header dragging supports mouse, touch and pen; buttons keep their own behavior. Focus the header and use arrows (Shift for larger moves), Home, or the Reset position button. Pointer cancellation, lost capture, blur and screen changes release dragging. Logout disposes listeners, observers and pending geometry work.

The composer and header remain fixed while messages scroll. Container height queries also fit the panel when an on-screen keyboard shrinks the visual viewport without changing layout viewport media queries.

## Conversation and activity

- A compact, expandable activity trail records actual request, tool-read, response, proposal and approved-save events. Reads use the currently loaded planner/productivity data; labels do not claim a fresh database query. Private model reasoning, tool arguments and raw results are not displayed.
- Activity uses English, Romanian or Italian labels, retains at most 12 steps and has no timers or polling. Only its current label is announced as a live status. Errors and unavailable reads remain distinct from completion; proposals remain distinct from saved changes.
- A multiline composer supports Enter to send and Shift + Enter for a line break, including composition-input protection. Suggestions fill an editable prompt without sending it. Empty/busy sends are disabled.
- Stop waiting releases the conversation UI and invalidates late responses, subsequent tool rounds and proposals from that request. The Firebase callable already in flight cannot be aborted. Stop and Clear cannot interrupt an approved write awaiting acknowledgement.
- Replies append to existing message nodes, preserving earlier messages and the reader's scroll position. Latest message restores following new replies. Escape closes the panel and restores the launcher focus; the closed panel is inert.
- Existing action validation and explicit Apply changes remain the only path to a write. Success follows persistence acknowledgement. No AI transport, backend configuration, authorization or data schema changed.

The changes use existing browser APIs and theme tokens with no additional runtime dependencies. Geometry work is event-driven; hidden chat animations pause, and reduced-motion preferences suppress panel animation. The companion remains integrated and its independent controls are preserved.

## Verification

- `node --test tests/*.test.mjs`: **603 passed, 0 failed**.
- Final focused chat, viewport, confirmation and security checks: **48 passed, 0 failed** after the small-height and animation fixes.
- `node scripts/refresh-release-assets.mjs --check`: passed; both new modules are present in the release import map.
- `git diff --check`: passed.
- `scripts/chat-experience-smoke.mjs`: **9 browser scenario groups, 0 uncaught errors**, using the real UI with local Firebase/AI fixtures. Evidence is in `output/chat-experience/browser-results.json` and adjacent PNGs.
- Covered pointer/touch/keyboard dragging, 1440×1000 to 900×500 resize, 320px-wide layout, short screens, expanded activity with a multiline composer, visual viewport zoom, Stop/Clear races, explicit approval, scroll retention, logout, hidden-animation pause and reduced motion.
- Independent DOM review also modeled 180/200/220/260px visual viewport heights with an unchanged layout viewport and expanded activity plus a multiline draft. Header and composer controls remained reachable; at 180px, messages temporarily collapse to make room for those controls.

Run the browser check against the offline server only:

```powershell
node scripts/experience-studio.mjs --port=4173
# In another terminal; use an existing Playwright installation if necessary:
$env:SHERPA_PLAYWRIGHT_PATH = '<installed Playwright package directory>'
node scripts/chat-experience-smoke.mjs --url=http://127.0.0.1:4173
```

Physical monitor hotplug/DPI transitions and a live production AI round were not exercised. Browser viewport changes, zoom and visual viewport offsets were exercised locally; no claim of a bug-free application is implied.

## Push verification — 23 October 2026

The 14-file chat update was applied on top of `origin/main` at `c2cafc5` in an isolated checkout. This preserves the current Codex gateway, callable timeout of 330,000 ms, error mappings, existing companion, calendar preview support and release identity. Unrelated changes in the original workspace are excluded.

The current-base run passed 608 frontend tests, 25 Firebase callable tests, all nine browser smoke groups, release asset verification and whitespace checks. The locked Functions dependency install reported zero vulnerabilities. Local checks used Node 24.14.1; the repository CI checks Node 22. Evidence remains in ignored `output/chat-experience/` files. The subsequent authorized rollout uses release `2026.10.23.2` with refreshed browser cache identities.
