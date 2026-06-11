// js/info-interactive.js
//
// Makes the Info version panel feel alive. The pointer drags a droplet through
// the liquid (it merges with the blobs via the goo filter), the whole mass
// drifts with a bit of parallax, and the hero typography tilts gently in 3D
// toward the mouse.
//
// Pure DOM + CSS custom properties: every visual lives in css/info.css, and
// this module only feeds it numbers. All smoothing is one requestAnimationFrame
// lerp, and every layout read + style write happens inside that frame so there
// is no read/write thrash. Idempotent (safe to call again) and DOM-only — no
// listeners that outlive the page, nothing to clean up. Honors
// prefers-reduced-motion by dropping the tilt/parallax and keeping only the
// pointer droplet.

const TILT_MAX = 4.5;    // max hero rotation (deg) at the edge of the stage
const PARALLAX = 20;     // px the liquid drifts against the pointer
const EASE = 0.16;       // lerp factor per frame (higher = snappier)

function lerp(a, b, t) { return a + (b - a) * t; }

export function initializeInfoInteractive(root = (typeof document !== 'undefined' ? document : null)) {
    if (!root || !root.getElementById) return;

    const stage = root.getElementById('versionStage');
    if (!stage || stage.dataset.interactiveBound === '1') return;

    const win = typeof window !== 'undefined' ? window : null;
    if (!win || !win.requestAnimationFrame) return;     // SSR / unsupported: leave the static panel
    stage.dataset.interactiveBound = '1';

    const reduce = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const tiltMax = reduce ? 0 : TILT_MAX;
    const parallaxMax = reduce ? 0 : PARALLAX;

    // Rendered values (cur) eased toward their targets (tgt) each frame.
    const cur = { cx: 0, cy: 0, tx: 0, ty: 0, lx: 0, ly: 0 };
    const tgt = { ...cur };
    const pointer = { x: 0, y: 0 };
    let active = false;
    let seeded = false;
    let raf = 0;

    function aimAtPointer() {
        const rect = stage.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const px = pointer.x - rect.left;            // pointer within the stage (px)
        const py = pointer.y - rect.top;
        const nx = px / rect.width - 0.5;            // -0.5 .. 0.5 from center
        const ny = py / rect.height - 0.5;

        tgt.ty = nx * tiltMax;                       // rotateY tracks horizontal motion
        tgt.tx = -ny * tiltMax;                      // rotateX tracks vertical motion
        tgt.lx = -nx * parallaxMax;                  // liquid drifts opposite the pointer
        tgt.ly = -ny * parallaxMax;
        tgt.cx = px - tgt.lx;                        // droplet sits under the cursor after parallax
        tgt.cy = py - tgt.ly;
    }

    function aimAtRest() {
        const rect = stage.getBoundingClientRect();
        tgt.tx = 0; tgt.ty = 0; tgt.lx = 0; tgt.ly = 0;
        tgt.cx = rect.width / 2; tgt.cy = rect.height / 2;
    }

    function settled() {
        return Math.abs(cur.tx - tgt.tx) < 0.01 &&
               Math.abs(cur.ty - tgt.ty) < 0.01 &&
               Math.abs(cur.lx - tgt.lx) < 0.1 &&
               Math.abs(cur.ly - tgt.ly) < 0.1;
    }

    function frame() {
        if (active) {
            aimAtPointer();
            if (!seeded) {                           // start the glow at the pointer, no streak from a corner
                cur.cx = tgt.cx; cur.cy = tgt.cy;
                seeded = true;
            }
        } else {
            aimAtRest();
        }

        cur.cx = lerp(cur.cx, tgt.cx, EASE);
        cur.cy = lerp(cur.cy, tgt.cy, EASE);
        cur.tx = lerp(cur.tx, tgt.tx, EASE);
        cur.ty = lerp(cur.ty, tgt.ty, EASE);
        cur.lx = lerp(cur.lx, tgt.lx, EASE);
        cur.ly = lerp(cur.ly, tgt.ly, EASE);

        const s = stage.style;
        s.setProperty('--cursor-x', cur.cx.toFixed(1) + 'px');
        s.setProperty('--cursor-y', cur.cy.toFixed(1) + 'px');
        s.setProperty('--tilt-x', cur.tx.toFixed(2) + 'deg');
        s.setProperty('--tilt-y', cur.ty.toFixed(2) + 'deg');
        s.setProperty('--liquid-px', cur.lx.toFixed(1) + 'px');
        s.setProperty('--liquid-py', cur.ly.toFixed(1) + 'px');

        raf = (active || !settled()) ? win.requestAnimationFrame(frame) : 0;
    }

    function start() { if (!raf) raf = win.requestAnimationFrame(frame); }

    function onMove(e) {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        if (!active) { active = true; stage.classList.add('is-hovering'); }
        start();
    }

    function onLeave() {
        active = false;
        seeded = false;
        stage.classList.remove('is-hovering');
        start();                                     // keep ticking until everything eases back to rest
    }

    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
    stage.addEventListener('pointercancel', onLeave);
}
