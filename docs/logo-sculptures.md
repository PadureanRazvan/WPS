# Sherpa logo sculptures

Sherpa cycles through five local Three.js sculptures in the login and sidebar logo controls. The original FSP Global artwork remains the brand source and the loading/error fallback. No image-generation service, remote model, HDR texture, authentication, or database access is needed to render the figures.

## Design

| Figure | Form and finish | Motion |
| --- | --- | --- |
| FSP Global | Original contours, colors, white oceans and lettering; curved globe relief and shallow enamel bevels | Full turn with more time on the readable front |
| Orbital globe | Deep blue ocean, raised jade continents, coastal walls, polar ice, faint geographic engravings and a gold orbital ring | Slow rotation and an orbiting gold bead |
| Ruby heart | Rounded solid front and back, soft shoulders and cleft, ruby enamel and a rose-gold pulse inlay | Restrained double beat and gentle depth sway |
| Alpine summit | Three asymmetric peaks, beveled jade facets, irregular snow caps, a closed cut base and a gold climbing route | Small highlight climbs the route, pauses, then fades before resetting |
| Infinity ribbon | Continuous twisted band, teal-to-indigo enamel, rounded gold edges and a separated over-under crossing | Gentle angled sway and a subtle travelling highlight |

All figures share locally generated softbox reflections and directional lighting. Bodies remain opaque at rest. During each 1.9-second morph, the departing surface dissolves into 768 matched particles, then the incoming surface forms. The two solid bodies never overlap at the same transition time. FSP holds for 14 seconds; the other figures hold for about six seconds each.

The 150 px sidebar and 220 px login views use the full FSP identity, with framing that accommodates its lower word line during turns and pointer tilt. The compact 44 px sidebar uses its approved globe-and-star variant. Soft shadows adapt to the application themes; logo colors remain tied to the identity and sculpture materials.

## Source map

- `js/logo-animation.js`: controller, clock, keyboard/pointer interaction, morph correspondence, responsive sizing, startup preparation, graphics recovery and disposal.
- `js/logo-materials.js`: common material coverage and locally generated studio lighting.
- `js/logo-shapes.js`: deterministic particle sampling and nearest-neighbour matching. Particle positions use the same surface definitions as the solids.
- `js/logo-fsp-core.js`, `logo-surfaces.js`: FSP relief and artwork mapping. Preserve `assets/branding/fsp-shape-data.js` and the approved raster artwork when changing presentation.
- `js/logo-globe-surface.js`, `logo-globe-geometry.js`: spherical geography, ocean surface and orbital path.
- `js/logo-heart-surface.js`, `logo-heart-geometry.js`: implicit heart surface, normals and pulse inlay.
- `js/logo-summit-surface.js`, `logo-summit-geometry.js`: terrain, connected snow boundaries and climbing route.
- `js/logo-infinity-surface.js`, `logo-infinity-geometry.js`, `logo-infinity-material.js`: periodic ribbon frame, closed rounded profile, gold/body groups and moving highlight.
- `js/logo-surface-grid.js`, `logo-tube-geometry.js`: shared surface subdivision and capped inlay tubes.
- `js/logo-cores.js`: figure assembly, physical finishes and figure-specific animation callbacks.

Geometry templates retain CPU data, while each controller owns its cloned GPU buffers. Hidden figures are prepared before the canvas replaces the approved image, avoiding a first-use shader stall. The controller stops drawing when paused, offscreen or in a hidden document. A lost WebGL context reveals the FSP fallback and restores the selected figure, materials and pause state when graphics return.

Activate a logo with a click, Enter or Space to select the next figure. P pauses or resumes motion. Pausing preserves the exact pose; selecting a new figure while paused gives it a readable pose. Reduced motion starts with a static FSP identity and permits immediate, static shape selection. It also disables heartbeat, ascent travel and the infinity highlight. Romanian and English accessible labels follow the document language.

## Geography credit

The globe uses [Natural Earth's public-domain 110m land data](https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/), not the FSP artwork's map. The generated module records its source URLs and SHA-256. Regenerate from a locally extracted `ne_110m_land.shp` with:

```powershell
node scripts/build-logo-earth-data.mjs path/to/ne_110m_land.shp
```

See Natural Earth's [terms of use](https://www.naturalearthdata.com/about/terms-of-use/).

## Offline visual review

Run the dependency-free studio server:

```powershell
node scripts/logo-studio.mjs --serve
```

Open the printed localhost URL. The gallery provides all five themes, real logo sizes, a close view, pause, automatic cycling, and turn/tilt inspection. The natural-pose control restores the animation's own orientation. Inspection controls exist only in this developer fixture.

For screenshots, interaction checks or WebM recordings, install Playwright locally or set `SHERPA_PLAYWRIGHT_MODULE` to an existing Playwright module. Set `SHERPA_BROWSER_PATH` to an existing Chrome/Chromium executable when needed. No project dependency installation is required for the server.

```powershell
node scripts/logo-studio.mjs --label=collection --theme=light --view=grid --verify
node scripts/logo-studio.mjs --label=ribbon-back --shape=infinity --view=single --yaw=145 --pitch=-18
node scripts/logo-studio.mjs --label=sidebar --app=sidebar --shape=heart --verify
node scripts/logo-studio.mjs --label=mobile --app=compact --shape=summit --mobile --reduced
node scripts/logo-studio.mjs --label=morph --shape=summit --view=single --morph=0.78
node scripts/logo-studio.mjs --label=motion --shape=infinity --view=single --video=16 --transition-at=11
node scripts/logo-studio.mjs --label=cycle --app=login --video=52 --cycle-video
```

Captures go to `output/logo-studio/<label>/`. The actual-shell fixture removes app scripts and blocks external requests, so visual checks cannot authenticate or write application data. Browser errors and unexpected warnings fail the capture. The known Chrome/ANGLE X4122 precision warning from Three's environment generation is recorded separately.

Video metadata includes visible states and local JavaScript/render-submission/capture timings. These timings do not measure complete GPU execution or establish a frame-rate guarantee on other devices. WebM capture is limited to 60 seconds, 30 frames per second and 720 px. A recording omits the canvas element's CSS shadow.

## Validation and release

```powershell
node --test tests/logo-*.test.mjs
node --test tests/*.test.mjs
node scripts/refresh-release-assets.mjs --check
```

Geometry checks cover closed surfaces, outward winding, finite normals, FSP letter holes, land/ocean coverage, connected snow, crossing clearance, particle/surface agreement and instance buffer ownership. Browser checks cover keyboard controls, paused selection, reduced motion, resizing, themes, graphics recovery, resource stability and interrupted initialization. Pixel checks inspect complete automatic cycles at sidebar and compact sizes, including pointer tilt, to catch clipped silhouettes.

Follow [the deployment flow](deployment.md) when shipping. Update the release identity in `js/version.js`, refresh the import map and cache queries, and verify the released modules. These visual changes require only the frontend deployment; they do not change Firestore data, rules or the AI function.
