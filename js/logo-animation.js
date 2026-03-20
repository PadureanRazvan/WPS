// Sherpa Logo — Morphing particle sphere animation
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
    const numParticles = 90;
    const particles = [];

    // Shape definitions — spherical coordinates for each target shape
    const shapes = {
        sphere: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const phi = Math.acos(1 - 2 * (i + 0.5) / numParticles);
                const theta = Math.PI * (1 + Math.sqrt(5)) * i;
                pts.push({ phi, theta, r: 30 });
            }
            return pts;
        },
        torus: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const t = (i / numParticles) * Math.PI * 2;
                const p = (i * 7.3) % (Math.PI * 2);
                pts.push({ phi: Math.PI / 2 + Math.sin(p) * 0.6, theta: t, r: 22 + Math.cos(p) * 10 });
            }
            return pts;
        },
        mountain: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const angle = (i / numParticles) * Math.PI * 2;
                const h = (i % 3) / 3;
                const r = 30 * (1 - h * 0.7);
                pts.push({ phi: Math.PI * 0.3 + h * Math.PI * 0.5, theta: angle, r });
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
                pts.push({ phi, theta, r: 18, offsetX: half * 14 });
            }
            return pts;
        }
    };

    const shapeKeys = Object.keys(shapes);
    let currentShape = 0;
    let nextShape = 1;
    let morphProgress = 1;
    let morphTimer = 0;
    const morphDuration = 1.5; // seconds
    const holdDuration = 3; // seconds between morphs

    // Initialize particles
    const targetA = shapes[shapeKeys[0]]();
    const targetB = shapes[shapeKeys[1]]();

    for (let i = 0; i < numParticles; i++) {
        const t = targetA[i];
        particles.push({
            // Current spherical coords
            phi: t.phi,
            theta: t.theta,
            r: t.r,
            offsetX: t.offsetX || 0,
            // Targets
            fromPhi: t.phi, fromTheta: t.theta, fromR: t.r, fromOffsetX: t.offsetX || 0,
            toPhi: t.phi, toTheta: t.theta, toR: t.r, toOffsetX: t.offsetX || 0,
            // Visual
            size: 1.2 + Math.random() * 1.2,
            alpha: 0.5 + Math.random() * 0.5,
            pulse: Math.random() * Math.PI * 2
        });
    }

    function startMorph() {
        nextShape = (currentShape + 1) % shapeKeys.length;
        const fromPts = shapes[shapeKeys[currentShape]]();
        const toPts = shapes[shapeKeys[nextShape]]();
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
        morphProgress = 0;
        currentShape = nextShape;
    }

    function easeInOut(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    let rotationY = 0;
    let rotationX = 0.3;
    let lastTime = performance.now();

    function animate(now) {
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        rotationY += dt * 0.6;
        rotationX = 0.3 + Math.sin(now * 0.0003) * 0.15;

        // Morph timing
        if (morphProgress >= 1) {
            morphTimer += dt;
            if (morphTimer >= holdDuration) {
                morphTimer = 0;
                startMorph();
            }
        } else {
            morphProgress = Math.min(1, morphProgress + dt / morphDuration);
            const ease = easeInOut(morphProgress);
            for (let i = 0; i < numParticles; i++) {
                const p = particles[i];
                p.phi = p.fromPhi + (p.toPhi - p.fromPhi) * ease;
                p.theta = p.fromTheta + (p.toTheta - p.fromTheta) * ease;
                p.r = p.fromR + (p.toR - p.fromR) * ease;
                p.offsetX = p.fromOffsetX + (p.toOffsetX - p.fromOffsetX) * ease;
            }
        }

        // Clear
        ctx.clearRect(0, 0, size, size);

        // Project and sort particles by depth
        const projected = [];
        const cosRY = Math.cos(rotationY);
        const sinRY = Math.sin(rotationY);
        const cosRX = Math.cos(rotationX);
        const sinRX = Math.sin(rotationX);

        for (let i = 0; i < numParticles; i++) {
            const p = particles[i];
            // Spherical to cartesian
            let x = p.r * Math.sin(p.phi) * Math.cos(p.theta) + p.offsetX;
            let y = p.r * Math.cos(p.phi);
            let z = p.r * Math.sin(p.phi) * Math.sin(p.theta);

            // Rotate Y
            const x2 = x * cosRY - z * sinRY;
            const z2 = x * sinRY + z * cosRY;
            // Rotate X
            const y2 = y * cosRX - z2 * sinRX;
            const z3 = y * sinRX + z2 * cosRX;

            const scale = 80 / (80 + z3);
            const sx = cx + x2 * scale;
            const sy = cy + y2 * scale;

            const pulse = Math.sin(now * 0.003 + p.pulse) * 0.3 + 0.7;

            projected.push({
                x: sx, y: sy, z: z3,
                size: p.size * scale * (0.8 + pulse * 0.4),
                alpha: p.alpha * scale * pulse,
                i
            });
        }

        // Sort back-to-front
        projected.sort((a, b) => a.z - b.z);

        // Draw connections between nearby particles
        ctx.lineWidth = 0.3;
        for (let i = 0; i < projected.length; i++) {
            for (let j = i + 1; j < projected.length; j++) {
                const a = projected[i];
                const b = projected[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 18) {
                    const lineAlpha = (1 - dist / 18) * 0.15 * Math.min(a.alpha, b.alpha);
                    ctx.strokeStyle = `rgba(232, 168, 73, ${lineAlpha})`;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }

        // Draw particles
        for (const p of projected) {
            const depth = (p.z + 35) / 70; // normalize depth 0-1
            const r = Math.round(232 - depth * 30);
            const g = Math.round(168 - depth * 50);
            const b = Math.round(73 + depth * 40);

            // Glow
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.6})`);
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}
