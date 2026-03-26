// Sherpa Logo — 3D Globe with NASA Earth texture + morphing particle shapes
export function initLogoAnimation(canvasId = 'sherpaLogo', canvasSize = 120) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    const size = canvasSize;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.32;

    // ── Earth texture loading ──
    let earthImg = null;
    let earthData = null;
    let earthW = 0, earthH = 0;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    // NASA Blue Marble — public domain
    img.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Blue_Marble_2002.png/600px-Blue_Marble_2002.png';
    img.onload = () => {
        // Draw to offscreen canvas to get pixel data
        const oc = document.createElement('canvas');
        oc.width = img.width;
        oc.height = img.height;
        const octx = oc.getContext('2d');
        octx.drawImage(img, 0, 0);
        earthData = octx.getImageData(0, 0, img.width, img.height).data;
        earthW = img.width;
        earthH = img.height;
        earthImg = img;
    };

    // ── Particle system for non-globe shapes ──
    const numParticles = 160;
    const particles = [];

    const shapes = {
        sphere: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const phi = Math.acos(1 - 2 * (i + 0.5) / numParticles);
                const theta = Math.PI * (1 + Math.sqrt(5)) * i;
                pts.push({ phi, theta, r: R * 0.85 });
            }
            return pts;
        },
        torus: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const t = (i / numParticles) * Math.PI * 2;
                const p = (i * 7.3) % (Math.PI * 2);
                pts.push({ phi: Math.PI / 2 + Math.sin(p) * 0.6, theta: t, r: R * 0.55 + Math.cos(p) * R * 0.3 });
            }
            return pts;
        },
        mountain: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const angle = (i / numParticles) * Math.PI * 2;
                const h = (i % 4) / 4;
                const r = R * 0.85 * (1 - h * 0.7);
                pts.push({ phi: Math.PI * 0.25 + h * Math.PI * 0.55, theta: angle, r });
            }
            return pts;
        },
        double: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const half = i < numParticles / 2 ? -1 : 1;
                const idx = i % (numParticles / 2);
                const phi = Math.acos(1 - 2 * (idx + 0.5) / (numParticles / 2));
                const theta = Math.PI * (1 + Math.sqrt(5)) * idx;
                pts.push({ phi, theta, r: R * 0.5, offsetX: half * R * 0.45 });
            }
            return pts;
        }
    };

    // Initialize particles for non-globe shapes
    const initPts = shapes.sphere();
    for (let i = 0; i < numParticles; i++) {
        const t = initPts[i];
        particles.push({
            phi: t.phi, theta: t.theta, r: t.r,
            offsetX: t.offsetX || 0,
            fromPhi: t.phi, fromTheta: t.theta, fromR: t.r, fromOffsetX: 0,
            toPhi: t.phi, toTheta: t.theta, toR: t.r, toOffsetX: 0,
            size: 0.8 + Math.random() * 1.2,
            alpha: 0.5 + Math.random() * 0.5,
            pulse: Math.random() * Math.PI * 2
        });
    }

    // ── State ──
    const modes = ['globe', 'sphere', 'torus', 'mountain', 'double'];
    let currentMode = 0; // start with globe
    let morphProgress = 1;
    let morphTimer = 0;
    let globeFade = 1; // 1 = full globe, 0 = full particles
    const morphDuration = 2.0;
    const holdDuration = 4;
    const globeHoldDuration = 7;

    function startMorph() {
        const nextMode = (currentMode + 1) % modes.length;
        if (modes[nextMode] !== 'globe') {
            // Morphing between particle shapes
            const shapeKey = modes[nextMode];
            const toPts = shapes[shapeKey]();
            for (let i = 0; i < numParticles; i++) {
                const p = particles[i];
                p.fromPhi = p.phi;
                p.fromTheta = p.theta;
                p.fromR = p.r;
                p.fromOffsetX = p.offsetX;
                p.toPhi = toPts[i].phi;
                p.toTheta = toPts[i].theta;
                p.toR = toPts[i].r;
                p.toOffsetX = toPts[i].offsetX || 0;
            }
        }
        morphProgress = 0;
        currentMode = nextMode;
    }

    function easeInOut(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    let rotationY = 0;
    let rotationX = 0.2;
    let lastTime = performance.now();

    // ── Render textured 3D globe ──
    function renderGlobe(alpha) {
        if (!earthData) return;

        const imgOut = ctx.createImageData(size * dpr, size * dpr);
        const out = imgOut.data;
        const cosRX = Math.cos(rotationX);
        const sinRX = Math.sin(rotationX);
        const cosRY = Math.cos(-rotationY);
        const sinRY = Math.sin(-rotationY);

        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                const dx = px - cx;
                const dy = py - cy;
                const distSq = dx * dx + dy * dy;
                if (distSq > R * R) continue;

                // Map screen pixel to sphere surface point
                const dz = Math.sqrt(R * R - distSq);

                // Undo view rotation to get original sphere coords
                let x = dx;
                let y = dy * cosRX + dz * sinRX;
                let z = -dy * sinRX + dz * cosRX;

                const x2 = x * cosRY - z * sinRY;
                const z2 = x * sinRY + z * cosRY;

                // Convert to lat/lon for texture lookup
                const lat = Math.asin(Math.max(-1, Math.min(1, y / R)));
                const lon = Math.atan2(x2, z2);

                // Map to texture coords
                const u = ((lon / Math.PI + 1) / 2) * earthW;
                const v = (0.5 - lat / Math.PI) * earthH;

                const tx = Math.floor(u) % earthW;
                const ty = Math.max(0, Math.min(earthH - 1, Math.floor(v)));
                const ti = (ty * earthW + tx) * 4;

                // Lighting: simple diffuse based on z depth
                const light = 0.4 + 0.6 * (dz / R);

                // Atmosphere edge glow
                const edgeDist = Math.sqrt(distSq) / R;
                const atmo = edgeDist > 0.85 ? (edgeDist - 0.85) / 0.15 : 0;

                for (let sy = 0; sy < dpr; sy++) {
                    for (let sx = 0; sx < dpr; sx++) {
                        const oi = ((py * dpr + sy) * size * dpr + (px * dpr + sx)) * 4;
                        const er = earthData[ti];
                        const eg = earthData[ti + 1];
                        const eb = earthData[ti + 2];

                        // Blend earth color with atmosphere blue at edges
                        out[oi] = Math.round((er * light) * (1 - atmo) + 100 * atmo);
                        out[oi + 1] = Math.round((eg * light) * (1 - atmo) + 160 * atmo);
                        out[oi + 2] = Math.round((eb * light) * (1 - atmo) + 255 * atmo);
                        out[oi + 3] = Math.round(255 * alpha);
                    }
                }
            }
        }

        ctx.putImageData(imgOut, 0, 0);

        // Atmosphere glow overlay
        const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25);
        glow.addColorStop(0, `rgba(100, 180, 255, ${0.08 * alpha})`);
        glow.addColorStop(0.5, `rgba(80, 140, 220, ${0.04 * alpha})`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Render particles ──
    function renderParticles(now, alpha) {
        const cosRY = Math.cos(rotationY);
        const sinRY = Math.sin(rotationY);
        const cosRX = Math.cos(rotationX);
        const sinRX = Math.sin(rotationX);

        const projected = [];
        for (let i = 0; i < numParticles; i++) {
            const p = particles[i];
            let x = p.r * Math.sin(p.phi) * Math.cos(p.theta) + (p.offsetX || 0);
            let y = p.r * Math.cos(p.phi);
            let z = p.r * Math.sin(p.phi) * Math.sin(p.theta);

            const x2 = x * cosRY - z * sinRY;
            const z2 = x * sinRY + z * cosRY;
            const y2 = y * cosRX - z2 * sinRX;
            const z3 = y * sinRX + z2 * cosRX;

            const perspD = 120;
            const scale = perspD / (perspD + z3);

            projected.push({
                x: cx + x2 * scale,
                y: cy + y2 * scale,
                z: z3,
                size: p.size * scale,
                alpha: p.alpha * scale * (Math.sin(now * 0.002 + p.pulse) * 0.2 + 0.8) * alpha
            });
        }

        projected.sort((a, b) => a.z - b.z);

        // Connections
        ctx.lineWidth = 0.3;
        for (let i = 0; i < projected.length; i++) {
            for (let j = i + 1; j < projected.length; j++) {
                const a = projected[i], b = projected[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 16) {
                    const la = (1 - dist / 16) * 0.12 * Math.min(a.alpha, b.alpha);
                    ctx.strokeStyle = `rgba(232, 168, 73, ${la})`;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }

        // Dots
        for (const p of projected) {
            const depth = (p.z + R + 5) / (R * 2 + 10);
            const r = 232 - Math.round(depth * 30);
            const g = 168 - Math.round(depth * 50);
            const b = 73 + Math.round(depth * 40);

            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.5);
            grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.5})`);
            grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Main loop ──
    function animate(now) {
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        const isGlobe = modes[currentMode] === 'globe';
        rotationY += dt * (isGlobe ? 0.2 : 0.5);
        rotationX = 0.2 + Math.sin(now * 0.0002) * 0.08;

        // Morph timing
        if (morphProgress >= 1) {
            morphTimer += dt;
            const hold = isGlobe ? globeHoldDuration : holdDuration;
            if (morphTimer >= hold) {
                morphTimer = 0;
                startMorph();
            }
        } else {
            morphProgress = Math.min(1, morphProgress + dt / morphDuration);
            const ease = easeInOut(morphProgress);

            if (isGlobe) {
                // Fade in globe
                globeFade = ease;
            } else if (modes[(currentMode - 1 + modes.length) % modes.length] === 'globe') {
                // Fading out from globe
                globeFade = 1 - ease;
            }

            if (!isGlobe && modes[currentMode] !== 'globe') {
                // Normal particle morph
                for (let i = 0; i < numParticles; i++) {
                    const p = particles[i];
                    p.phi = p.fromPhi + (p.toPhi - p.fromPhi) * ease;
                    p.theta = p.fromTheta + (p.toTheta - p.fromTheta) * ease;
                    p.r = p.fromR + (p.toR - p.fromR) * ease;
                    p.offsetX = p.fromOffsetX + (p.toOffsetX - p.fromOffsetX) * ease;
                }
            }
        }

        ctx.clearRect(0, 0, size, size);

        // Render based on current state
        if (isGlobe && earthData) {
            renderGlobe(globeFade);
            if (globeFade < 1) renderParticles(now, 1 - globeFade);
        } else if (globeFade > 0.01 && earthData) {
            renderGlobe(globeFade);
            renderParticles(now, 1 - globeFade);
        } else {
            globeFade = 0;
            renderParticles(now, 1);
        }

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}
