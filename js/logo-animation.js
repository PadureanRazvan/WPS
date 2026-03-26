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
    const R = size * 0.34;

    // ── Earth texture ──
    let earthImg = null;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Blue_Marble_2002.png/600px-Blue_Marble_2002.png';
    img.onload = () => { earthImg = img; };

    // ── Particle system ──
    const numParticles = 160;
    const particles = [];

    const shapes = {
        sphere: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const phi = Math.acos(1 - 2 * (i + 0.5) / numParticles);
                const theta = Math.PI * (1 + Math.sqrt(5)) * i;
                pts.push({ phi, theta, r: R * 0.82 });
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
                const r = R * 0.82 * (1 - h * 0.7);
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

    // Init particles
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
    let currentMode = 0;
    let morphProgress = 1;
    let morphTimer = 0;
    let globeFade = 1;
    const morphDuration = 2.0;
    const holdDuration = 4;
    const globeHoldDuration = 7;

    function startMorph() {
        const nextMode = (currentMode + 1) % modes.length;
        if (modes[nextMode] !== 'globe') {
            const toPts = shapes[modes[nextMode]]();
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
    let lastTime = performance.now();

    // ── Render Earth globe using canvas clipping + scrolling texture ──
    function renderGlobe(alpha) {
        if (!earthImg) return;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Clip to circle
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Dark ocean background
        ctx.fillStyle = '#0a1628';
        ctx.fill();

        // Calculate how much of the texture to show based on rotation
        // The image is equirectangular: full width = 360°
        const imgAspect = earthImg.width / earthImg.height;
        const drawH = R * 2.2; // slightly larger than diameter for tilt effect
        const drawW = drawH * imgAspect;

        // Map rotation to horizontal scroll offset
        const totalScroll = drawW;
        const scrollX = ((rotationY / (Math.PI * 2)) * totalScroll) % totalScroll;

        const yOff = cy - drawH / 2 + R * 0.05; // slight vertical offset for tilt

        // Draw texture twice for seamless wrapping
        ctx.drawImage(earthImg, cx - R - scrollX, yOff, drawW, drawH);
        ctx.drawImage(earthImg, cx - R - scrollX + drawW, yOff, drawW, drawH);
        if (scrollX > 0) {
            ctx.drawImage(earthImg, cx - R - scrollX - drawW, yOff, drawW, drawH);
        }

        ctx.restore();

        // Sphere shading overlay — makes it look 3D
        ctx.save();
        const shading = ctx.createRadialGradient(
            cx - R * 0.3, cy - R * 0.2, R * 0.1,  // light source offset
            cx, cy, R
        );
        shading.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
        shading.addColorStop(0.4, 'rgba(255, 255, 255, 0.02)');
        shading.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');
        shading.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = shading;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Atmosphere glow
        ctx.save();
        ctx.globalAlpha = alpha * 0.7;
        const atmo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.2);
        atmo.addColorStop(0, 'rgba(80, 160, 255, 0.15)');
        atmo.addColorStop(0.5, 'rgba(60, 120, 220, 0.06)');
        atmo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = atmo;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ── Render particles ──
    function renderParticles(now, alpha) {
        if (alpha < 0.01) return;

        const cosRY = Math.cos(rotationY);
        const sinRY = Math.sin(rotationY);
        const cosRX = Math.cos(0.25);
        const sinRX = Math.sin(0.25);

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
        rotationY += dt * (isGlobe ? 0.15 : 0.5);

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
                globeFade = ease;
            } else if (modes[(currentMode - 1 + modes.length) % modes.length] === 'globe') {
                globeFade = 1 - ease;
            }

            if (!isGlobe && modes[(currentMode - 1 + modes.length) % modes.length] !== 'globe') {
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

        if ((isGlobe || globeFade > 0.01) && earthImg) {
            renderGlobe(globeFade);
        }
        if (!isGlobe || globeFade < 0.99) {
            renderParticles(now, isGlobe ? 1 - globeFade : 1);
        }

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}
