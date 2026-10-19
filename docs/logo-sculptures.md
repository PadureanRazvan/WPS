# Sherpa logo sculptures

Sherpa cycles through five local Three.js sculptures in the login and sidebar logo controls. The original FSP Global artwork remains the brand source and the loading/error fallback. No image-generation service, remote model, HDR texture, authentication, or database access is needed to render the figures.

## Design

| Figure | Form and finish | Motion |
| --- | --- | --- |
| FSP Global | Original contours, colors, white oceans and lettering; curved globe relief and shallow enamel bevels | Readable welcoming arc: belonging |
| Ruby heart | Rounded solid front and back, satin ruby finish and a rose-gold pulse inlay | Three soft double beats and a travelling warm signal: care |
| Alpine summit | Three asymmetric peaks, beveled jade facets, neutral snow caps, a closed cut base and a rounded gold route | Complete climb, a pause at the summit, then rest: progress |
| Orbital globe | Deep blue ocean, raised jade continents, coastal walls, polar ice, faint geographic engravings and a gold orbital ring | A complete eased turn and orbit: wider possibilities |
| Infinity ribbon | Tapered continuous band, teal-to-indigo enamel, rounded gold edges and a separated over-under crossing | Gentle angled sway and a complete travelling highlight: continuity |

All figures share locally generated softbox reflections and directional lighting. Bodies remain opaque at rest. The 69.7-second story runs FSP → heart → summit → globe → infinity → FSP. Each automatic handoff takes 1.9–2.3 seconds and has a directed particle path; manual activation takes 1.4 seconds and accepts one additional queued advance after a short settling pause. The two solid bodies never overlap. Complete detail actions and quiet pauses determine each hold, from 8.8 to 15 seconds. Pose handoffs preserve angular velocity; pointer tilt has a damped return. Navigation and palette changes give a small acknowledgement without forcing a new figure. See [sculpture story](sculpture-story.md) for chapter timing, form changes and verification status.

The 150 px sidebar and 220 px login views use the full FSP identity, with framing that accommodates its lower word line during turns and pointer tilt. The compact 44 px sidebar uses its approved globe-and-star variant. Soft shadows adapt to the application themes; logo colors remain tied to the identity and sculpture materials.

## Source map

- `js/logo-animation.js`: controller, clock, keyboard/pointer interaction, morph correspondence, responsive sizing, startup preparation, graphics recovery and disposal.
- `js/logo-story.js`: narrative order, chapter timing, complete detail actions, continuous poses and directed particle paths.
- `js/logo-interaction.js`: hover, drag intent, pointer capture, touch scrolling and frame-rate-independent spring response.
- `js/logo-guidance-material.js`: shared warm highlight along the heart and summit inlays.
- `js/logo-materials.js`: common material coverage and locally generated studio lighting.
- `js/logo-prepare.worker.js`, `logo-preparation.js`, `logo-geometry-cache.js`: byte-identical mesh preparation, validated reusable studio reflections, transferable CPU templates and original-builder fallbacks. Worker imports carry the release query because document import maps do not apply there. The versioned `assets/branding/sherpa-studio-lighting-v1.bin.gz` contains the original half-float studio pixels; it avoids creating a second WebGL/PMREM pipeline at every page entry. Missing or invalid assets retain the original procedural lighting path.
- `createVisibleLogoStarter` in `js/app-startup.js` skips the hidden sign-in sculpture on direct dashboard entry and retries when sign-out shows it. In `logo-animation.js`, only FSP gates the first rendered frame; later figures and handoff particles warm in separate yielding steps. Early activation keeps FSP moving until its target is ready. Pausing, visibility changes, disposal and graphics recovery govern those background jobs too.

- `js/animation-scheduler.js`: dirty-frame scheduling, paused/hidden sleep and a frozen-clock resume.
- `js/logo-shapes.js`: deterministic particle sampling and nearest-neighbour matching. Particle positions use the same surface definitions as the solids.
- `js/logo-fsp-core.js`, `logo-surfaces.js`: FSP relief and artwork mapping. Preserve `assets/branding/fsp-shape-data.js` and the approved raster artwork when changing presentation.
- `js/logo-globe-surface.js`, `logo-globe-geometry.js`: spherical geography, ocean surface and orbital path.
- `js/logo-heart-surface.js`, `logo-heart-geometry.js`: implicit heart surface, normals and pulse inlay.
- `js/logo-summit-surface.js`, `logo-summit-geometry.js`: terrain, connected snow boundaries and climbing route.
- `js/logo-infinity-surface.js`, `logo-infinity-geometry.js`, `logo-infinity-material.js`: periodic ribbon frame, closed rounded profile, gold/body groups and moving highlight.
- `js/logo-surface-grid.js`, `logo-tube-geometry.js`: shared surface subdivision and capped inlay tubes.
- `js/logo-cores.js`: figure assembly, physical finishes and figure-specific animation callbacks.

Geometry templates retain CPU data, while each controller owns its cloned GPU buffers and environment texture. The validated local lighting asset skips repeated studio generation. If unavailable, the worker transfers procedurally generated half-float pixels when OffscreenCanvas WebGL2 readback is available; otherwise the original main-thread lighting path remains available. Both FSP variants compile before the first complete canvas frame crossfades over the approved image; other figures prepare afterward. Paused, offscreen and hidden figures leave no animation callbacks pending; resize/theme changes can request one static frame. Resizing also refreshes device-pixel density. A lost WebGL context reveals the FSP fallback and restores the selected figure, materials and pause state when graphics return.

To regenerate the lighting after changing the studio or bundled Three.js version,
run the offline experience preview and choose **Capture export → Rebuild studio
lighting asset**. This explicitly runs the original worker lighting generator;
it does not export the already loaded asset. Validate the downloaded file with
`tests/logo-preparation.test.mjs`, increment the asset filename for changed pixels,
update its loader URL, and visually review every sculpture. The packed format is
a four-byte little-endian JSON-header length, the UTF-8 header, and RGBA half-float
pixels, then gzip compression. The current asset is 181,311 bytes compressed and
decodes to 384 × 512 RGBA pixels. Regeneration on the verification browser produced
the identical SHA-256: `8a798b6971de6c8a151a60dab329be4a46878bae1f5c851ca3f71c914744e888`.

Activate a logo with a click, Enter or Space to select the next figure. P pauses or resumes motion. Dragging tilts the sculpture and holds the chapter clock; release returns smoothly without selecting another figure. Touch keeps vertical scrolling and pinch zoom available. Pausing preserves the exact pose; selecting a new figure while paused gives it a readable pose. Reduced motion starts with a static FSP identity and permits immediate, static shape selection. It disables heartbeat, ascent travel, orbit and the infinity highlight, and clears queued motion. Romanian, English and Italian accessible labels follow the document language.

## Geography credit

The globe uses [Natural Earth's public-domain 110m land data](https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/), not the FSP artwork's map. The generated module records its source URLs and SHA-256. Regenerate from a locally extracted `ne_110m_land.shp` with:

```powershell
node scripts/build-logo-earth-data.mjs path/to/ne_110m_land.shp
```

See Natural Earth's [terms of use](https://www.naturalearthdata.com/about/terms-of-use/).

## Browser tab icon

The favicon uses a static export of the approved compact FSP Global 3D globe
and compass star. Its transparent square frame preserves the artwork's aspect
ratio and keeps the mark legible at tab sizes. The self-contained SVG, 32 px PNG,
16/32/48 px ICO and white-background 180 px touch icon share the same artwork.

To regenerate the files, install `sharp` locally or set `SHERPA_SHARP_MODULE`
to an existing module, then run `node scripts/build-browser-icons.mjs`.
The release helper `node scripts/refresh-release-assets.mjs` updates every
favicon and touch-icon query in `index.html` to `SHERPA_VERSION.number`.

## Offline visual review

Run the dependency-free studio server:

```powershell
node scripts/logo-studio.mjs --serve
```

Open the printed localhost URL. The gallery provides all five themes, real logo sizes, a close view, pause, automatic cycling, and turn/tilt inspection. The natural-pose control restores the animation's own orientation. Inspection controls exist only in this developer fixture.

For the actual sign-in and authenticated shell with synthetic data, run `node scripts/experience-studio.mjs --port=0`. See [experience polish](experience-polish.md) for the isolated adapters, startup measurements, failure modes and recorded motion review.

For screenshots, interaction checks or WebM recordings, install Playwright locally or set `SHERPA_PLAYWRIGHT_MODULE` to an existing Playwright module. Set `SHERPA_BROWSER_PATH` to an existing Chrome/Chromium executable when needed. No project dependency installation is required for the server.

```powershell
node scripts/logo-studio.mjs --label=collection --theme=light --view=grid --verify
node scripts/logo-studio.mjs --label=ribbon-back --shape=infinity --view=single --yaw=145 --pitch=-18
node scripts/logo-studio.mjs --label=sidebar --app=sidebar --shape=heart --verify
node scripts/logo-studio.mjs --label=mobile --app=compact --shape=summit --mobile --reduced
node scripts/logo-studio.mjs --label=morph --shape=summit --view=single --morph=0.78
node scripts/logo-studio.mjs --label=motion --shape=infinity --view=single --video=16 --transition-at=11
node scripts/logo-studio.mjs --label=cycle --app=login --video=72 --cycle-video
```

Captures go to `output/logo-studio/<label>/`. The actual-shell fixture removes app scripts and blocks external requests, so visual checks cannot authenticate or write application data. Browser errors and unexpected warnings fail the capture. The known Chrome/ANGLE X4122 precision warning from Three's environment generation is recorded separately.

Video metadata includes visible states and local JavaScript/render-submission/capture timings. These timings do not measure complete GPU execution or establish a frame-rate guarantee on other devices. WebM capture is limited to 120 seconds, 30 frames per second and 720 px. A recording omits the canvas element's CSS shadow.

## Validation and release

```powershell
node --test --test-concurrency=2 tests/logo-*.test.mjs
node --test --test-concurrency=2 tests/*.test.mjs
node scripts/refresh-release-assets.mjs --check
```

Geometry checks cover closed surfaces, outward winding, finite normals, FSP letter holes, land/ocean coverage, connected snow, crossing clearance, particle/surface agreement and instance buffer ownership. Browser checks cover keyboard controls, paused selection, reduced motion, resizing, themes, graphics recovery, resource stability and interrupted initialization. Pixel checks inspect complete automatic cycles at sidebar and compact sizes, including pointer tilt, to catch clipped silhouettes.

Follow [the deployment flow](deployment.md) when shipping. Update the release identity in `js/version.js`, refresh the import map and cache queries, and verify the released modules. These visual changes require only the frontend deployment; they do not change Firestore data, rules or the AI function.
