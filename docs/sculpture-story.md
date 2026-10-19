# Sherpa sculpture story

## Direction

The interface stays as it is. The sculptures tell a small, repeatable journey:

**FSP → heart → summit → globe → infinity → FSP**

Belonging gives us a starting point. Care gives progress a purpose. Small steps
reach a summit; a summit opens a wider horizon. The journey continues, returning
to the shared identity. This meaning lives in the sequence and movement; the
production interface gains no captions, onboarding panel or extra navigation.

## Rhythm

| Chapter | Meaning | Action | Hold | Handoff |
| --- | --- | --- | ---: | ---: |
| FSP | Belonging | A shallow arc catches the relief's light while keeping the lettering readable | 15 s | 1.9 s, gather inward |
| Heart | Care | Three soft double beats; a warm signal follows the gold inlay | 8.8 s | 2.1 s, rise |
| Summit | Progress | The light climbs a smooth route, reaches the top, holds, then rests | 10.5 s | 2.2 s, open the horizon |
| Globe | Possibility | A complete eased turn and a complete gold orbit | 14 s | 2.1 s, flow sideways |
| Infinity | Continuity | A highlight travels the entire ribbon before it rests | 10.8 s | 2.3 s, return to the identity |

The automatic story lasts **69.7 seconds**. Activating a figure uses a 1.4-second
handoff. Repeated activation accepts one follow-up and gives the intermediate
figure 180 ms to settle. The stage clock starts when the sculpture finishes
forming, so a climb or orbit does not spend its opening seconds hidden in a morph.

The earlier summit hold ended before its ascent could finish. The new timing
explicitly includes arrival, the complete action, a visible result and a quiet
departure. Heart, orbit and infinity details use the same chapter clock.

## Form and material

- The FSP contours, artwork, relief, brand colors and compact variant remain the
  approved identity. Its automatic arc avoids reversed lettering.
- Ruby uses a softer satin reflection. The beat changes depth along with width
  and height, keeping volume stable rather than inflating the whole sculpture.
- Mountain bevels are wider to catch light, snow is more neutral, and the
  ascent bends more gently at its turns. Arc-length sampling keeps the light
  from speeding up and slowing down at every route anchor.
- The Earth turns inside a steady orbital frame, so the turning geography and
  orbiting point remain easy to follow. The gold orbit has a rounder, slightly
  clearer cross-section. Tiny geographic engraving is omitted in the compact
  rail; the orbiting point stays
  legible there.
- The infinity ribbon narrows through the crossing and broadens around the
  loops. Surface normals include this taper; the two layers remain separate,
  closed and consistently oriented.

During a handoff, particles follow a bounded path specific to the story beat.
The solid surface releases and forms along that movement. Its direction is
coherent across overlapping materials; the two solid figures never intersect.
Pose interpolation preserves departure and arrival velocity instead of switching
rotation models halfway through a morph.

Light palettes use normal alpha blending for the transition particles. Additive
blending remains for dark palettes; adding light into an almost-white background
would otherwise erase much of the midpoint. Surface sweeps use one view-space
field across the independently transformed parts.

## Interaction and accessibility

Hover gives a small tilt. Drag gives a deeper, bounded inspection, with a
critically damped return when released. The chapter clock holds during a drag.
Its playback speed eases back in after release rather than jumping to full speed.
A drag never also selects the next sculpture. Touch preserves vertical scrolling
and pinch zoom; horizontal movement can inspect the sculpture.
Releasing outside the control returns to neutral even without a later pointer-leave
event, and cancellation of a second touch cannot steal the primary gesture.

Click, Enter and Space advance. P pauses or resumes; held keys do not repeatedly
toggle the state. Ctrl/Cmd/Alt shortcuts and keys already handled elsewhere pass
through. Instructions remain localized in Romanian, English and Italian.
Reduced motion uses a still, dimensional pose and immediate manual selection,
with no heartbeat, orbit or travelling highlight. Switching to it also clears
any queued advance.

Paused, hidden and offscreen scenes retain their place in the story and leave no
ongoing animation callback. Graphics recovery preserves the selection and pose;
disposal is idempotent. The small interface acknowledgement now rises and settles
smoothly, with a maximum scale change of 1.8%.

Resizing repaints the drawing buffer before the next paint. Switching between
the full identity and compact rail preserves an in-progress handoff and queued
selection. Image fallback artwork does not start a native image-drag operation.
The compact rail has a 2% camera margin so particle discs, shader shimmer and
the interface acknowledgement still fit together at the deepest drag angle.

## Local review

```powershell
node scripts/logo-studio.mjs --serve --port=0
node scripts/experience-studio.mjs --port=0
```

The gallery's **Play the story** control starts the complete sequence. **Time
(seconds)** and **Show moment** inspect an exact frame without an animation loop.
**Save sculpture frame** exports the actual canvas in its render frame, keeping
`preserveDrawingBuffer` disabled in normal use. Export waits for a hidden figure
to become visible and cancels cleanly if the scene is disposed. Existing theme,
size, pause and turn/tilt controls remain available. `--baseline=story` serves the saved figures
from immediately before this task, when that local snapshot is present.

Useful times for **Show moment**, measured from the story's beginning:

| Review | Time |
| --- | ---: |
| Readable FSP relief | 4 s |
| First heart beat | 18.16 s |
| Arrival at the summit | 35.2 s |
| Halfway through the Earth's turn | 47.5 s |
| Infinity flow | 61 s |
| Particle midpoints, in story order | 15.95 / 26.75 / 39.4 / 55.55 / 68.55 s |

The app preview uses local simulated sign-in and data. Nothing in this work
deploys to production, changes authentication, or writes live data.
To enter its dashboard, expand **Offline preview · Original Sherpa**, set
**Next sign-in** to **Success**, then use the existing sign-in button. No account
credentials are needed. The initial popup-closed scenario remains available for
checking cancellation feedback.

## Verification record

Work window completed: 2026-10-16 21:19:45 UTC to 2026-10-17 02:20:03 UTC (five hours).

Completed checks cover narrative timing, complete detail actions, bounded particle
paths, pose/velocity continuity, closed geometry, shared surface sampling, shader
attribute wiring, touch/keyboard/drag behavior, sleeping callbacks, responsive
framing, graphics recovery, and repeated disposal.

The scene-controller harness uses the real Three.js scene graph and geometry with
a recording renderer. It proves control flow and projected bounds; it does **not**
prove GPU rendering, shader compilation, visual quality or measured browser FPS.
At the end of the five-hour work window, browser inspection was unverified because
no browser surface was connected. The subsequent 17 October release-readiness
review below adds real browser observations without changing that historical audit.

Evidence under `output/sculpture-story-20261017/`:

- [tests-final.txt](../output/sculpture-story-20261017/tests-final.txt): all 523 frontend tests passed. Release mapping and
  whitespace checks also passed.
- [interaction-fuzz.json](../output/sculpture-story-20261017/interaction-fuzz.json): 51,200 deterministic mixed interaction events across
  32 seeds, with no failed state, listener, callback or finite-pose invariant.
- [geometry-study.png](../output/sculpture-story-20261017/geometry-study.png): actual mesh silhouettes at natural and held angles,
  rasterized on the CPU with simple diffuse light. Textures, reflections and
  production shaders are deliberately absent; this is a shape study, not a
  browser screenshot.
- [sweep-framing.json](../output/sculpture-story-20261017/sweep-framing.json): 56,560 projected poses across four slot sizes and two
  pixel densities, sampled every 50 ms plus chapter boundaries. The sweep
  includes maximum tilt, the full interface pulse, particle-disc radius and
  both shader-shimmer extremes. The widest compact pose uses 96.99% of its
  normalized half-frame; full slots stay within 93.16%. The soft background aura
  is intentionally excluded. This remains a CPU projection check.
- [lifecycle summary](../output/sculpture-story-20261017/lifecycle-120-minutes/summary.json): **passed**, 120 minutes, 553,177 assertions,
  all five figures and handoffs observed, 15 simulated graphics recoveries,
  three scene recreations and four clean disposals. Active geometry/material
  counts stayed at 19/22. Live array buffers stayed around 7.7–8.0 MiB during
  the run and fell to 0.037 MiB after final disposal. Earlier runs are marked
  interrupted and are not counted as completed evidence for the final source.
- [lifecycle chart PNG](../output/sculpture-story-20261017/lifecycle-trend.png) and [SVG](../output/sculpture-story-20261017/lifecycle-trend.svg): one-minute heap, process-memory and resource
  measurements from that completed run. Process observation started about
  1.45 minutes into the run; it does not measure browser or GPU memory.
- [verification-summary.json](../output/sculpture-story-20261017/verification-summary.json): the final audit's 27 source hashes, the framing
  sweep's 27 source hashes and the fuzz run's three core hashes all match the
  current files. It also reconciles the test totals and baseline snapshot.
- [change-manifest.json](../output/sculpture-story-20261017/change-manifest.json): 47 baseline copies verified; 24 existing scoped files
  changed and ten implementation/test/documentation files added. All 31
  unrelated tracked diff blocks that existed before this task remain intact.
- [sculpture-story.patch](../output/sculpture-story-20261017/sculpture-story.patch): a 34-file review patch against the saved pre-task
  working tree. A read-only reverse-application check passed; no patch was
  applied and no existing work was reverted.
- [remount-memory-comparison.json](../output/sculpture-story-20261017/remount-memory-comparison.json): two earlier diagnostic runs of 30 scene recreations
  each. Live array-buffer growth from the first to last disposal was zero in
  both. Limiting V8's semi-space reduced final reserved heap from 143.2 MiB to
  31.2 MiB while live heap stayed around 12.3–12.5 MiB. This supports allocator
  capacity as the reason process memory rose after recreation; it is not a GPU
  memory measurement. The flag was used only by the diagnostic subprocess; the
  application's runtime configuration remains unchanged.

## Release-readiness review — 17 October 2026

The user approved the visible sculpture direction. A connected in-app browser then
rendered the gallery and the original app preview without captured warning/error
logs. Offline success reached the dashboard; Sign Out returned to the original
sign-in screen with zero active data subscriptions, zero attempted data writes and
no unexpected external resources. This exercises local adapters, not Google OAuth
or production Firestore.

The gallery recorded 180 animation callbacks in 3,011 ms with one visible figure,
and zero callbacks during its paused-idle check. These are callback observations,
not a measured GPU frame-rate guarantee. Existing page diagnostics also recorded
23,486 ms to prepare all five gallery instances, a 1,315 ms longest task in the app
preview, and 1,889 ms of login-scene shader warm-up. Sign-in handler readiness was
143 ms. These sessions included background tabs and concurrent graphics work;
they do not establish a controlled cold-start regression, but first-use graphics
preparation deserves a focused check before a performance claim or release.

The frontend suite passed again with `--test-concurrency=2`; all six Functions
checks passed. Release-map and whitespace checks passed. The earlier endurance,
interaction and framing source hashes still matched the implementation. Remote
`main` remained `624847da3e3b733f51ede91a11e23960bac65ef6` at this review.

Production release gates remain:

- Bump the release identity from `2026.09.09` and regenerate browser asset URLs
  using the commands in [deployment](deployment.md).
- Triage the existing Functions dependency audit: `npm --prefix functions audit
  --omit=dev` exited 1 with two high and one critical alert. Installed versions
  were `@fastify/busboy@3.2.0` (high), `@grpc/grpc-js@1.14.4` (high), and
  `proxy-addr@2.0.7` (critical). No Functions, Firebase configuration or Firestore
  rules changed in this work. These are dependency alerts, not demonstrated
  exploitation of Sherpa or confirmation of the deployed dependency tree.
- Package the intended sign-in/performance and sculpture changes explicitly;
  exclude local `output/` artifacts and avoid sweeping unrelated artwork into a
  commit. The original 34-file task patch uses the pre-task working tree as its
  baseline and is not a standalone patch against `HEAD`.
- Follow the documented branch/PR/checks flow, backup requirement and external
  Chrome production sign-in smoke. Live Google authentication remains unverified.

No commit, push, PR, merge, dependency update or deployment was performed during
this readiness review. Runtime code remains unchanged.

## Sign-in composition diagnosis — 17 October 2026

Inspected the actual offline sign-in at 1280 × 720; this is not a claim about an
unobserved sidebar or another viewport. The card and sculpture slot are centered
on x = 640. Paused FSP, heart and infinity views keep the same slot, but their
different silhouette heights leave visibly different gaps above the title. The
220 × 184.94 px slot has a further 20 px box-to-heading gap; unused space inside
the canvas adds to the perceived separation. Adjust visual scale/anchor and the
stage-to-title spacing without moving the surrounding interface per chapter.

A reproduced layout defect is independent of the 3D motion: displaying the English
popup-closed message adds a 40 px feedback block and a 32 px flex gap. Card height
changes from 470.25 to 542.25 px, so vertical centering moves the card, logo, title
and sign-in button upward by 36 px. Retrying clears the message and moves them
down again. Reserve/adapt the feedback region so normal feedback does not move
the action under the pointer; retain scrolling for short screens and long text.

This browser session measured sign-in readiness at 168 ms, first paint at 428 ms,
worker preparation at 2326.7 ms, shader warm-up at 870.5 ms and a longest main-thread
task of 230 ms. These observations differ from the earlier session and do not
establish a constant 1.3-second stall. Startup remains worth separating from
steady motion; consider showing the first figure before preparing later figures
during its hold, with handoff readiness checked before advancing.

Design judgment: keep the requested story, but give each chapter one dominant
movement and quieter intervals; avoid treating the compact navigation mark as a
gallery preview. Existing geometry/framing tests establish bounds and mechanics,
not optical balance or how distracting the complete composition feels. Runtime
code was not changed by this diagnosis.

## Startup stall fix — 18 October 2026 (17 October UTC)

The entry delay came from work performed before the first moving frame: the
worker built all geometry plus a fresh GPU studio-reflection map, then the visible
renderer warmed every figure. Direct authenticated entry additionally built the
hidden sign-in renderer. The previously documented sign-in feedback positioning
issue is separate; this fix changes preparation and lifecycle behavior, not layout
or chapter choreography.

The original studio pixels now load from a validated 181 KB local asset, with the
original worker/main-thread lighting builders retained as fallbacks. FSP renders
first; other figures and handoff particles compile and warm individually during
its opening chapter. A click before its target is ready keeps the current figure
moving and retains at most one follow-up. Failed optional warming falls back to
normal rendering. Paused/hidden scenes defer background work; disposal and context
recovery invalidate old jobs. A restored session skips the hidden login renderer,
and signing out initializes it when visible.

Measured in the real in-app browser, using the actual app and offline Firebase
fixtures at 1280 × 720:

| Observation | Before this fix | Final local sign-in |
| --- | ---: | ---: |
| Visible fallback to first complete 3D frame | 1,640 ms | 919 ms |
| Sign-in handler ready | 76 ms | 50 ms |
| First contentful paint | 184 ms | 172 ms |
| Worker preparation | 823.8 ms | 332.9 ms |
| Initial shader warming | 428.7 ms | 194.4 ms |
| Longest recorded main-thread task | 82 ms | 237 ms |

These are observations from separate same-session reloads, not a controlled GPU
benchmark or a promise for every device. The first frame improved; the longest
task did not. Graphics-driver compilation remains a source of short entry stalls.
Other optimized sign-in runs measured 781–918 ms. Fresh dashboard entries measured
1,060–1,143 ms, with only the visible renderer created; a second, already prepared
renderer after sign-in is a different, warmer path. The user's approximate
five-second wait was not reproduced consistently in this session.

Verification: 535 frontend tests passed with `--test-concurrency=2` (16.14 seconds),
including new real-controller tests for first-frame ordering, early clicks during
a delayed compile, pause/visibility, failed warming, disposal and context-recovery
races. Those tests use a recording renderer and are not GPU frame-rate evidence.
The real-browser graphics recovery returned from `context-lost` to `three`, paused
idle produced zero animation callbacks over 1.5 seconds, and no browser errors or
unexpected external requests appeared. Rebuilding the lighting produced the exact
shipped file hash. Release import-map verification and `git diff --check` passed.

Evidence is under `output/logo-startup-20261017/`; the directory date is UTC.
The earlier two-hour endurance report predates this startup change and does not
validate these final source hashes. Authentication and data are local fixtures;
real OAuth, production rendering and deployment remain unverified. No commit,
push, PR, release bump or deployment was performed during that implementation
pass. See [Quiet Motion, 2026.10.19](releases/2026-10-19-quiet-motion.md) for the
subsequent combined release verification.

## Design reference

[IBM Carbon's motion choreography guidance](https://www.carbondesignsystem.com/building-blocks/foundations/motion/choreography)
emphasizes consistency, continuity and deliberate sequencing. Those principles
inform the shared movement and orderly handoffs here. The five-part story and
its sculpture choreography are Sherpa-specific design choices.

[Apple's motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion)
also favors purposeful, optional motion and brief, precise feedback. Here that
means a quiet repeated journey, direct response to a drag, a pause key, and a
still reduced-motion mode.

## Source boundaries

- `js/logo-story.js`: order, meaning, timing, poses, guidance progress and paths.
- `js/logo-interaction.js`: pointer intent, spring response and capture cleanup.
- `js/logo-animation.js`: rendering, stage clock, transitions and lifecycle.
- `js/logo-guidance-material.js`: one reusable warm inlay highlight program.
- `js/logo-cores.js` and the figure surface modules: sculpted forms and detail actions.

Existing source map and artwork attribution remain in [logo sculptures](logo-sculptures.md).
