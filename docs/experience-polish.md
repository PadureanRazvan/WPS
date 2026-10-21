# Sherpa experience polish

Status: implemented and verified locally, 16 October 2026. Frontend deployment and live Google OAuth smoke verification have not been performed.

The existing interface, palettes and five sculpture designs remain the product direction. The earlier standalone redesign concept is excluded from this implementation.

The 18 October startup follow-up reuses the original studio lighting asset,
publishes FSP before preparing later figures and skips the hidden sign-in renderer
on direct dashboard entry. See [the startup measurements and verification](sculpture-story.md#startup-stall-fix--18-october-2026-17-october-utc);
the earlier performance observations below describe the preceding implementation.

## Implementation

- `main.js`, `firebase-session.js` and `app-startup.js` own the lightweight sign-in path. The single Firebase app, provider, authorization checks, App Check configuration and Functions region are preserved. Firestore, Functions, operational views and external chart/calendar/archive libraries load with the authenticated workspace. Downloads overlap the account chooser without moving the provider call outside the user's activation.
- `app-runtime.js` binds navigation before loading workspace dependencies, yields between startup groups, and removes shell, refresh, data and shortcut listeners on sign-out. Session initialization is serialized and stale completions cannot reopen or clean up a newer session. An activity-log upload no longer blocks sign-out. Unsaved edit UI and preference popovers close with the session.
- `productivity.js` settles a canceled first-snapshot wait and guards asynchronous fallback/manual loads by session. The reproduced failure was sign-out before the first snapshot leaving the next serialized initialization waiting forever; a delayed old fallback could also replace a newer session's data. Tests first failed on both behaviors and pass with cancellation and revision checks. Data formats, calculations and write payloads are unchanged.
- `sign-in-ui.js` retains the Google mark and stable button geometry, localizes its label, restores it on every outcome and distinguishes cancellation from failure. Popup return restores keyboard focus without stealing it from another control. Error text wraps inside the existing card width. Saved appearance and language apply before authentication modules finish loading. The button remains disabled until its handler is wired, and an entry-module download failure gives a localized reload message beside it.
- Sign-in scrolls safely on short screens and retains 44 px touch targets. The existing Sign Out icon remains available in compact/mobile navigation; localization updates its text and accessible name without deleting the SVG. The workspace has a thin palette-colored loading cue. System appearance responds to OS color changes while explicit palettes stay selected.
- The existing meshes are generated in `logo-prepare.worker.js` and transferred as CPU templates. The versioned local studio asset reuses the original half-float reflections; missing or invalid assets retain the OffscreenCanvas/main-thread lighting fallback. Each controller owns its cloned GPU buffers and environment texture. FSP renders before background preparation of the remaining figures; an early transition waits for its target while the current figure keeps moving. The approved image stays visible until the first complete frame. Direct authenticated entry skips the hidden sign-in renderer, which initializes on sign-out instead.
- `animation-scheduler.js` leaves no frame callbacks pending while paused, offscreen or hidden. Resume starts from the frozen pose. Shape handoffs and pointer tilt ease continuously. Automatic morphs retain 1.9 seconds; manual activation uses 1.25 seconds and accepts one additional queued advance. Navigation and theme changes give a small acknowledgement without forcing a new shape.
- Section navigation commits immediately and uses local content/active-marker motion instead of a full-page snapshot. Abandoned Planner renders are skipped. Rapid palette changes retain the latest choice and navigation can interrupt a theme animation.

## Evidence and boundaries

Original working changes were snapshotted before editing under `output/experience-polish-20261016/baseline/`; existing favicon and artwork changes are outside this slice.

`scripts/audit-startup.mjs` reports the static entry evaluation graph: 86 local modules / 918,730 source bytes before and 15 / 123,900 after. This excludes downloaded external SDK bytes, browser cache/network behavior and later background sculpture preparation. The saved comparison is `output/experience-polish-20261016/startup-graph.json`; a fresh checkout without the local baseline reports only the current graph. An optional `--baseline=<directory>` selects another snapshot.

An initial localhost pass observed sign-in readiness at 252 ms before and 68 ms after. Later working-tree passes observed 50–148 ms. A 1.5-second paused interval recorded 90 animation-frame callbacks before and zero after; the final sign-out check again recorded zero callbacks and zero active data subscriptions. The initial longest task comparison was 1,304 ms before and 396 ms after; later worker-lighting passes observed 82–288 ms. Browser load, cache state and concurrent graphics work varied, so these are observations rather than a controlled benchmark, production network timing, complete GPU timing or a frame-rate guarantee.

The baseline navigation sequence Reports → Users → Dashboard recorded Reports and Dashboard, with commit observations of 29.7 and 22.5 ms; Users was missed while the page snapshot animation was active. The revised path recorded all three at 23.7, 13.0 and 7.5 ms. Functional tests independently verify synchronous state updates and the latest-click outcome.

Browser checks verified:

- English button width stayed 246.65625 px before, during and after popup cancellation. Italian network failure retained keyboard focus, restored the enabled button and showed a translated alert without widening the card.
- Sign-in at 320 × 568, 390 × 844 and 844 × 390 remained reachable; short-landscape spacing leaves a scroll path for longer messages. All five palettes were inspected across sign-in/workspace passes. The 44 × 44 compact FSP variant and the phone Sign Out target were inspected; the latter signed out successfully.
- Enter and Space each advanced one paused figure. P resumed motion. Three rapid activations produced the current handoff plus one queued follow-up instead of an accumulating animation backlog.
- Forced WebGL loss revealed the approved identity; restoration returned the exact paused heart rotation and selected shape with its own reflection texture. Paused pixels remained visible with the default framebuffer configuration.
- With the first Productivity snapshot delayed three seconds, sign-out while the workspace was busy followed by another sign-in reached `ready`. No data subscriptions remained after final sign-out. Old fallback-response isolation is also covered by the real-module tests.
- A deliberately failed entry download showed a reload message with the sign-in action disabled. With a 2.5-second artificial entry delay, the original sign-in screen painted before readiness, and the button became enabled only after handler binding.
- A 51.96-second recording captured a complete cycle at a 155 × 130 login canvas. Eighteen decoded samples spanning the five figures and their handoffs retained visible silhouette margins. Browser video-frame timestamps were checked during extraction. `sherpa-sculpture-cycle.webm`, `sherpa-sculpture-frames.png` and the desktop `sherpa-original-polished.jpg` are under `output/experience-polish-20261016/`. This is a local visual check, not exhaustive all-device/GPU validation.

The offline experience server rewrites every Firebase SDK import to local adapters and sends a CSP that blocks external connections. Chart/calendar behavior is stubbed; displayed data is synthetic or empty. No production data or real Google sign-in is exercised. No unexpected external resource or data-write attempts were observed in the initial passes.

The final validation comprises 499 frontend tests, six Functions checks, the release-map check and `git diff --check`. Coverage includes byte-identical worker geometries, independent resource disposal, unavailable/stalled worker fallback, sleeping clocks, session cancellation, authorization preservation, library retries, immediate navigation and rapid theme selection. Reduced motion is covered by motion/scheduler and navigation tests; a native OS accessibility setting was not changed during this run.

One parallel repetition stopped two Node processes with `[low_level_alloc.cc : 554] RAW: Check new_pages != nullptr failed: VirtualAlloc failed`. Both affected files passed individually; the final complete run passed with `--test-concurrency=2` in 16.75 seconds. The failed-run output is retained separately beside the final test log. A failed optional video-decoder install left no project dependency; frame extraction uses the browser's own decoder.

## Local review

```powershell
node scripts/experience-studio.mjs --port=0
node scripts/experience-studio.mjs --port=0 --baseline
node scripts/experience-studio.mjs --port=0 --entry-failure
node scripts/experience-studio.mjs --port=0 --entry-delay=2500
```

Each command prints its own unused loopback port. The original app is displayed with a small developer-only Offline preview control. Choose Success before activating Google sign-in to inspect the actual authenticated shell with local adapters. Add `?snapshot-delay=3000` to exercise cancellation while the initial Productivity response is pending. The sculpture gallery remains available through `node scripts/logo-studio.mjs --serve --port=0`.

For operational Planner checks, open the printed address with
`?session=ready&language=en&planner-fixture=1&real-calendar=1`. This adds one
synthetic agent with weekday schedules in the previous, current and next months,
and loads the real production Litepicker script and stylesheet from
`cdn.jsdelivr.net`. Firebase remains replaced, `connect-src` remains restricted
to the local origin, and business writes remain blocked. The default preview is
still offline with an empty roster and a calendar stub. The real-calendar mode
is necessary to verify date selection, both month arrows, search and actual CSV
downloads; the default visual preview does not validate those controls.
Diagnostics record the browser timezone at startup and at inspection so a
timezone change during a long session is visible.

Use **Reload signed-in preview** or `?session=ready` for a fresh page with a
simulated restored session. This tests dashboard startup without warming the
sign-in renderer first. **Capture export → Save diagnostics** records entry
timings and controller state; **Rebuild studio lighting asset** regenerates the
original lighting pixels for validation.

The preview's recording and screenshot export controls save local artifacts. `/scripts/fixtures/recording-review.html` can decode the saved cycle through the preview server, which supports byte ranges for accurate seeking. Preview-only controls and adapters are never imported by the production entry.

The observations above describe the original implementation pass. The complete
approved experience, sculpture story and browser icons are packaged together in
[Quiet Motion, 2026.10.19](releases/2026-10-19-quiet-motion.md).

The later [Planner startup incident and health review](health/2026-10-21-planner-startup.md)
records an operational regression missed by the original visual checks.

## Implementation references

The worker and lighting paths follow the platform's [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) and [WebGL readPixels](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/readPixels) APIs and the local Three r185 [PMREM generator](https://threejs.org/docs/pages/PMREMGenerator.html). Error-card sizing uses [inline-size containment](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/contain), which isolates message width while preserving its natural wrapped height.
