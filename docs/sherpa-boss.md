# Sherpa boss companion

The bottom-right chat launcher is now an articulated Three.js character, modeled from the supplied portrait: chestnut waves, brown almond eyes, lilac blouse with rolled sleeves, plum paisley scarf and gold slide, silver necklace, gold earrings and watch. This is a stylized, manually modeled likeness, not a reconstructed scan. The trousers and shoes are inferred because the reference does not show a complete body. The original photograph is not copied into the site.

## Use

Everyday Sherpa (2026.10.25) removes the birthday hat from the mesh and regenerated fallback portrait. The Meet Sherpa button, right-click and M shortcuts, dialog, renderer and styles are removed. Waving, dragging, minimizing and chat remain available; existing account ragdoll preferences are still respected.

- Hover for a wave. Click or press Enter/Space to wave and open chat. Grab her head, arm, hand, leg or foot and drag; the selected part follows the pointer while her torso stays mostly upright with a little lean. Release for a gentler throw, small bounce, brief recovery and return to standing.
- A wave displays a speech cloud for six seconds, at most once every three minutes, on the miniature. Repeated clicks or hovers during that interval still wave but do not change the text, reopen the cloud or extend its display time. The first says exactly “Hello Rahela here, hope you are doing fine!”; eligible later waves cycle through “Rahela here. I manage the team. Gravity manages me.”, “This meeting could have been a wave.” and “Tiny boss. Big plans. Suspiciously little coffee.” without consecutive repeats. The cloud stays within the viewport and clears on dragging, minimizing, hiding or pausing. It also works with reduced motion.
- Fast direction reversals raise her inner brows, tighten her eyes and turn her smile into a mildly uncomfortable expression. Firmer contact with any screen edge causes a small flinch and little stars. Reactions fade quickly when she settles; gentle movement stays calm.
- The small minus button (or H) minimizes her to a feet-and-name dock at the bottom right. Click the dock or use Enter/Space to restore her. Minimized rendering stops completely.
- Shift + arrow keys move the miniature; Home restores its corner position.
- Chat thinking and reply gestures follow the actual conversation state. The speaking gesture has priority when the typing indicator ends. There is no audio playback.

## Implementation boundaries

`sherpa-boss-model.js` owns the dimensional meshes, articulated joints, reversible facial expressions, hair and local canvas scarf texture. `sherpa-boss-ragdoll.js` solves a 16-point body at 120 Hz with a rigid torso, distance-constrained limbs, weighted grip on the picked bone, gravity, contact impulses, damping and recovery. It simulates motion in the screen plane while the character remains fully 3D. `sherpa-boss-physics.js` retains basic positioning and the fallback throw. `sherpa-boss.js` owns mesh ray picking, pointer capture, gesture posing, local Three.js loading, lighting, and GPU cleanup. Its padded transparent canvas lets limbs rotate outside the normal launcher rectangle; only an actual mesh hit starts a grab there. The chat module remains responsible for all AI requests and write confirmation.

Opening chat hides the miniature, speech cloud, minimize button and dock, and suspends her rendering. Closing chat restores her previous position and returns keyboard focus. Drag release does not trigger chat. Mouse, touch and keyboard use the same bounded position rules. A local render of the character (`assets/sherpa-boss.png`) remains clickable if WebGL is unavailable. Reduced motion uses static poses and direct repositioning. Hidden tabs and paused controllers stop frame callbacks; logout disposes the renderer. Graphics context loss cancels capture and exposes the fallback.

The calmer ragdoll tuning transfers 75% of release momentum, caps free point velocity at 1200px/s, and reduces collision restitution from 0.28 to 0.16. Stronger damping, tighter elbow/knee folding and a 0.58-radian neck limit reduce flailing while keeping limb-specific grips. While held, an upright posture constraint rotates around the actual grip and gently draws free limbs toward their rest pose; a small velocity-based lean keeps dragging responsive. Release removes that support, leaving the articulated body free to tumble. Impact and shake expressions are softer and fade faster. Recovery starts after settling or at 3.4 seconds after release, followed by a smooth 1.05-second return to standing. The graphics fallback uses the same reduced throw momentum and gentler bounces.

The calmer motion pass passed 37 targeted controller, physics, ragdoll and chat-shell checks. In one identical simulated throw, total hip travel decreased from 1367px to 1010px and peak impact from 0.98 to 0.64; these compare that scenario, not every possible drag. Head/hand/foot attachment, all four wall contacts, recovery, frame-rate independence and reduced-motion behavior still pass.

## Account preference

`sherpa-boss-preferences.js` subscribes to `companion_preferences/{Firebase Auth UID}` through the existing Firestore connection. Its only stored field is the boolean `ragdollEnabled`. Each account owns its document; the rules deny reading another account's setting, collection listing, deletion and additional fields. No workforce records are involved. The preference is independent of AI permissions. With the studio removed, existing saved values are read and respected; this release does not offer a preference editor or write new settings.

The effect stays off until a server-confirmed account read arrives, so an empty offline cache cannot accidentally enable a previously disabled effect. A missing server document defaults to on. Live snapshots keep sessions for the same account in sync. Connection/read failures keep throws disabled until a later successful subscription. Auth changes and logout unsubscribe and ignore stale callbacks. Disabling during a drag or throw cancels capture and motion immediately. Production uses Firestore, with no local-storage-only fallback.

The original coordinated frontend and rules rollout is documented in [Birthday Spark](releases/2026-10-22-birthday-spark.md). Everyday Sherpa changes only the frontend; no rules or preference migration is required.

## Local review and checks

Start the existing offline server:

```powershell
node scripts/experience-studio.mjs --port=4173
```

Open `http://127.0.0.1:4173/?session=ready&boss=dashboard` for the miniature. This uses the existing offline Firebase fixture with no production calls or writes. The empty dashboard is fixture data.

For preference QA only, the offline fixture persists the companion boolean in browser storage under a simulated UID. Add `&preview-account=other` for an isolated account, `&preference-error=read` for a failed load, or `&preference-error=write` for a rejected save. Two tabs for the same simulated account receive updates. These are local simulations, not evidence of a deployed Firestore write.

```powershell
node --test --test-concurrency=2 tests/*.test.mjs
node scripts/refresh-release-assets.mjs --check
node scripts/sherpa-boss-browser-smoke.mjs
node scripts/sherpa-boss-ragdoll-smoke.mjs
```

The browser smoke script requires Playwright and Chrome; set `SHERPA_PLAYWRIGHT_PATH` to an installed Playwright package directory if it is not on the normal module path. It refuses non-localhost URLs. Evidence goes to `output/sherpa-boss/`.

The interaction review uses the same offline server and saves head/hand/foot grabs, shaking, all four wall contacts, a throw, landing, recovery, and minimized dock to `output/sherpa-boss-interactions/`. Unit coverage also checks frame-rate independence, stale fling cancellation, reversible face deformations, hover behavior, dock focus and sleeping renderers. A soft neck limit prevents the head folding through the collar when the body hangs upside down; the final targeted tests and interaction review were rerun after this visual correction.

Verified locally on 22 October 2026: 569 frontend tests passed. Both browser reviews passed without page errors: real WebGL rendering, all four gestures, body-part grabs, discomfort when shaken, all four wall contacts, throwing and recovery, drag/tap distinction, dock minimize/restore with pointer and keyboard, turntable and pause, reopening a paused studio, logout, mobile touch, 390px layout, a short 360px viewport with reduced motion, and a blocked-graphics fallback. Paused previews redraw once after resizing, graphics recovery or returning to visibility without restarting animation. Visual QA corrected inverted sleeve/leg surfaces, ankle gaps, crown coverage, lighting and pedestal placement. No release version was bumped and no production deployment was performed.

The transparent fallback is generated from the actual mesh using `scripts/fixtures/sherpa-boss-portrait.html`, with the local browser's canvas PNG export. Regenerate it after changing the model.

The portrait refinement lengthens and tapers the face, shapes the almond eyelids and brown irises, lowers the brows, softens the nose, and adds fuller rose lips with a slight asymmetric smile. Continuous chestnut hair surfaces preserve the side part and waves while removing overlapping bands; smoothed face seams remove hard shading creases. The fallback was regenerated after this pass. Final close-up and studio renders are in `output/sherpa-boss-face-after.png` and `output/sherpa-boss-studio.png`; the final mesh has 44,629 finite vertices and passed blink, speaking-pose and repeated-disposal checks, with no browser page errors.

The interactive refinement further narrows the chin and smile, adjusts the eyelids and asymmetrical brows, defines the nose tip and wings, and offsets the hair part to follow the reference. Worry and impact use reversible mouth and eyebrow vertex deformations rather than replacing the face with an icon. The portrait fixture accepts `?face=1&mood=shaken` or `?face=1&mood=impact` for close-up expression review.

The upright-drag and account-preference pass on 22 October 2026 passed all 579 frontend tests and the 103-module release asset check. Coverage includes upright head/hand/foot/torso grips, throw recovery and all walls, disabling during a drag, reduced motion, account reloads, same-account updates, account isolation, pending/rejected writes and logout races. The offline browser review confirmed the toggle survives reload, same-account tabs sync when re-enabled, a separate account keeps its own value, direct dragging with the effect off, throw/recovery with it on, and hiding/restoring the miniature when chat opens/closes. No browser error logs were captured. Test output: `output/sherpa-account-settings-tests.log`; settings screenshot: `output/sherpa-account-settings.png`.
