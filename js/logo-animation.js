// Sherpa Logo — Morphing particle animation with FSP Global globe
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
    const R = size * 0.26; // globe radius
    const numParticles = 140;
    const particles = [];

    // Simplified continent outlines as [lat, lon] pairs (degrees)
    // These trace the coastlines of major landmasses
    const continentData = [
        // Europe
        [-10, 35], [0, 38], [10, 37], [15, 40], [20, 40], [25, 37], [30, 36],
        [25, 45], [30, 50], [25, 55], [30, 60], [25, 65], [20, 62], [10, 60],
        [5, 52], [0, 50], [-5, 48], [-10, 44],
        // Africa
        [-10, 32], [-5, 25], [0, 10], [5, 5], [10, 0], [15, -5], [20, -15],
        [25, -25], [30, -30], [35, -33], [30, -28], [25, -20], [20, -10],
        [30, -5], [35, 0], [40, 5], [45, 10], [50, 12], [40, 20], [35, 30],
        [30, 32], [20, 35], [15, 33],
        // Asia
        [35, 35], [40, 40], [50, 45], [60, 50], [70, 55], [80, 50], [90, 48],
        [100, 45], [110, 40], [120, 35], [125, 38], [130, 35], [130, 40],
        [135, 45], [140, 43], [135, 35], [120, 25], [110, 20], [105, 15],
        [100, 10], [105, 5], [100, 0], [80, 10], [75, 15], [70, 25], [60, 30],
        [50, 30], [45, 32],
        // North America
        [-170, 65], [-160, 60], [-150, 55], [-140, 50], [-130, 48], [-125, 42],
        [-120, 35], [-115, 30], [-105, 25], [-100, 20], [-95, 18], [-90, 20],
        [-85, 25], [-82, 30], [-80, 35], [-75, 40], [-70, 43], [-65, 45],
        [-60, 48], [-55, 50], [-65, 55], [-75, 58], [-85, 60], [-95, 62],
        [-110, 64], [-130, 67], [-150, 68],
        // South America
        [-80, 10], [-75, 5], [-70, 0], [-75, -5], [-80, -10], [-70, -15],
        [-65, -20], [-60, -25], [-55, -30], [-50, -25], [-45, -20], [-40, -15],
        [-38, -10], [-35, -5], [-40, 0], [-50, 5], [-60, 8], [-70, 10],
        // Australia
        [115, -15], [120, -18], [130, -15], [140, -18], [145, -20], [150, -25],
        [152, -30], [148, -35], [140, -37], [135, -35], [130, -32], [120, -30],
        [115, -25], [113, -20],
    ];

    // Convert lat/lon to spherical coords on globe
    function latLonToSpherical(lon, lat) {
        const phi = (90 - lat) * Math.PI / 180; // polar angle from top
        const theta = (lon + 180) * Math.PI / 180; // azimuthal angle
        return { phi, theta, r: R };
    }

    // Generate globe points from continent data
    function generateGlobePoints() {
        const pts = [];

        // Add continent coastline particles (main feature)
        for (let i = 0; i < Math.min(continentData.length, numParticles * 0.7); i++) {
            const [lon, lat] = continentData[i % continentData.length];
            // Add slight randomization for natural look
            const jitterLon = lon + (Math.random() - 0.5) * 4;
            const jitterLat = lat + (Math.random() - 0.5) * 4;
            const sp = latLonToSpherical(jitterLon, jitterLat);
            pts.push({ ...sp, isLand: true });
        }

        // Fill remaining with ocean grid particles (sparser)
        while (pts.length < numParticles) {
            const phi = Math.acos(1 - 2 * Math.random());
            const theta = Math.random() * Math.PI * 2;
            pts.push({ phi, theta, r: R, isLand: false });
        }

        return pts;
    }

    // Shape definitions
    const shapes = {
        globe: () => generateGlobePoints(),
        sphere: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const phi = Math.acos(1 - 2 * (i + 0.5) / numParticles);
                const theta = Math.PI * (1 + Math.sqrt(5)) * i;
                pts.push({ phi, theta, r: R });
            }
            return pts;
        },
        torus: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const t = (i / numParticles) * Math.PI * 2;
                const p = (i * 7.3) % (Math.PI * 2);
                pts.push({ phi: Math.PI / 2 + Math.sin(p) * 0.6, theta: t, r: R * 0.75 + Math.cos(p) * R * 0.35 });
            }
            return pts;
        },
        mountain: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const angle = (i / numParticles) * Math.PI * 2;
                const h = (i % 3) / 3;
                const r = R * (1 - h * 0.7);
                pts.push({ phi: Math.PI * 0.3 + h * Math.PI * 0.5, theta: angle, r });
            }
            return pts;
        },
        dna: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const t = (i / numParticles) * Math.PI * 4;
                const strand = i % 2 === 0 ? 1 : -1;
                const yPos = (i / numParticles - 0.5) * R * 2;
                const phi = Math.PI / 2 + Math.atan2(yPos, R);
                const theta = t + (strand > 0 ? 0 : Math.PI);
                const r = R * 0.6;
                pts.push({ phi, theta, r });
            }
            return pts;
        }
    };

    const shapeKeys = Object.keys(shapes);
    let currentShape = 0;
    let nextShape = 1;
    let morphProgress = 1;
    let morphTimer = 0;
    const morphDuration = 2.0;
    const holdDuration = 4;

    // Initialize particles with globe shape
    const initPts = shapes.globe();
    for (let i = 0; i < numParticles; i++) {
        const t = initPts[i];
        particles.push({
            phi: t.phi, theta: t.theta, r: t.r,
            offsetX: t.offsetX || 0,
            fromPhi: t.phi, fromTheta: t.theta, fromR: t.r, fromOffsetX: 0,
            toPhi: t.phi, toTheta: t.theta, toR: t.r, toOffsetX: 0,
            size: 1.0 + Math.random() * 1.3,
            alpha: 0.5 + Math.random() * 0.5,
            pulse: Math.random() * Math.PI * 2,
            isLand: t.isLand || false
        });
    }

    function startMorph() {
        nextShape = (currentShape + 1) % shapeKeys.length;
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
            p.isLand = toPts[i].isLand || false;
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

    // Detect theme
    function isDarkTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark'
            || document.body.classList.contains('dark-theme')
            || window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function animate(now) {
        const dt = Math.min((now - lastTime) / 1000, 0.1); // cap dt
        lastTime = now;

        const dark = isDarkTheme();
        const isGlobe = shapeKeys[currentShape] === 'globe';

        // Slower rotation during globe for appreciation
        const rotSpeed = isGlobe ? 0.3 : 0.6;
        rotationY += dt * rotSpeed;
        rotationX = 0.3 + Math.sin(now * 0.0003) * 0.12;

        // Morph timing
        if (morphProgress >= 1) {
            morphTimer += dt;
            const hold = isGlobe ? 6 : holdDuration;
            if (morphTimer >= hold) {
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

        ctx.clearRect(0, 0, size, size);

        // Color palette based on theme
        const colors = dark ? {
            landR: 80, landG: 180, landB: 120,    // Green continents
            oceanR: 60, oceanG: 130, oceanB: 210,  // Blue ocean
            accentR: 232, accentG: 168, accentB: 73, // Amber (Sherpa)
            textColor: 'rgba(232, 168, 73, ',       // Amber text
            bgGlow: 'rgba(60, 130, 210, 0.03)',
            lineColor: [60, 130, 210]
        } : {
            landR: 34, landG: 120, landB: 60,      // Darker green
            oceanR: 30, oceanG: 90, oceanB: 180,    // Darker blue
            accentR: 30, accentG: 90, accentB: 180,
            textColor: 'rgba(30, 90, 180, ',
            bgGlow: 'rgba(30, 90, 180, 0.03)',
            lineColor: [30, 90, 180]
        };

        // Draw subtle globe aura during globe phase
        if (isGlobe && morphProgress >= 1) {
            const auraGrad = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.5);
            auraGrad.addColorStop(0, dark ? 'rgba(60, 130, 210, 0.06)' : 'rgba(30, 90, 180, 0.06)');
            auraGrad.addColorStop(0.5, dark ? 'rgba(60, 130, 210, 0.02)' : 'rgba(30, 90, 180, 0.02)');
            auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = auraGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Project particles
        const projected = [];
        const cosRY = Math.cos(rotationY);
        const sinRY = Math.sin(rotationY);
        const cosRX = Math.cos(rotationX);
        const sinRX = Math.sin(rotationX);

        for (let i = 0; i < numParticles; i++) {
            const p = particles[i];
            let x = p.r * Math.sin(p.phi) * Math.cos(p.theta) + (p.offsetX || 0);
            let y = p.r * Math.cos(p.phi);
            let z = p.r * Math.sin(p.phi) * Math.sin(p.theta);

            const x2 = x * cosRY - z * sinRY;
            const z2 = x * sinRY + z * cosRY;
            const y2 = y * cosRX - z2 * sinRX;
            const z3 = y * sinRX + z2 * cosRX;

            const perspD = 100;
            const scale = perspD / (perspD + z3);
            const sx = cx + x2 * scale;
            const sy = cy + y2 * scale;

            const pulse = Math.sin(now * 0.003 + p.pulse) * 0.25 + 0.75;

            projected.push({
                x: sx, y: sy, z: z3,
                size: p.size * scale * (0.8 + pulse * 0.3),
                alpha: p.alpha * scale * pulse,
                isLand: p.isLand,
                i
            });
        }

        projected.sort((a, b) => a.z - b.z);

        // Draw connections
        ctx.lineWidth = 0.3;
        const maxConnDist = isGlobe ? 14 : 18;
        for (let i = 0; i < projected.length; i++) {
            for (let j = i + 1; j < projected.length; j++) {
                const a = projected[i];
                const b = projected[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < maxConnDist) {
                    const lineAlpha = (1 - dist / maxConnDist) * 0.12 * Math.min(a.alpha, b.alpha);
                    if (isGlobe && a.isLand && b.isLand) {
                        ctx.strokeStyle = `rgba(${colors.landR}, ${colors.landG}, ${colors.landB}, ${lineAlpha * 2})`;
                    } else if (isGlobe) {
                        ctx.strokeStyle = `rgba(${colors.oceanR}, ${colors.oceanG}, ${colors.oceanB}, ${lineAlpha * 0.6})`;
                    } else {
                        ctx.strokeStyle = `rgba(${colors.accentR}, ${colors.accentG}, ${colors.accentB}, ${lineAlpha})`;
                    }
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }

        // Draw particles
        for (const p of projected) {
            const depth = (p.z + R + 5) / (R * 2 + 10);
            let r, g, b;

            if (isGlobe && p.isLand) {
                r = colors.landR + Math.round(depth * 40);
                g = colors.landG + Math.round(depth * 30);
                b = colors.landB - Math.round(depth * 20);
            } else if (isGlobe) {
                r = colors.oceanR - Math.round(depth * 20);
                g = colors.oceanG - Math.round(depth * 20);
                b = colors.oceanB + Math.round(depth * 30);
            } else {
                r = colors.accentR - Math.round(depth * 30);
                g = colors.accentG - Math.round(depth * 50);
                b = colors.accentB + Math.round(depth * 40);
            }

            r = Math.max(0, Math.min(255, r));
            g = Math.max(0, Math.min(255, g));
            b = Math.max(0, Math.min(255, b));

            const glowSize = isGlobe && p.isLand ? p.size * 3.5 : p.size * 2.5;
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.5})`);
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
            ctx.fill();

            const coreSize = isGlobe && p.isLand ? p.size * 1.3 : p.size;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, coreSize, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw "FSP GLOBAL" text during globe phase
        if (isGlobe && morphProgress >= 1) {
            const textAlpha = Math.min(1, morphTimer / 1.0); // fade in over 1s
            if (textAlpha > 0.01) {
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // "FSP" — larger, bold
                const fspSize = Math.round(size * 0.13);
                ctx.font = `900 ${fspSize}px "Segoe UI", Arial, sans-serif`;
                ctx.fillStyle = dark
                    ? `rgba(255, 255, 255, ${textAlpha * 0.85})`
                    : `rgba(20, 60, 120, ${textAlpha * 0.9})`;
                ctx.shadowColor = dark ? 'rgba(60, 130, 210, 0.6)' : 'rgba(30, 90, 180, 0.3)';
                ctx.shadowBlur = 8;
                ctx.fillText('FSP', cx, cy - size * 0.02);

                // "GLOBAL" — smaller, below
                const globalSize = Math.round(size * 0.075);
                ctx.font = `700 ${globalSize}px "Segoe UI", Arial, sans-serif`;
                ctx.fillStyle = dark
                    ? `rgba(200, 220, 255, ${textAlpha * 0.7})`
                    : `rgba(40, 80, 140, ${textAlpha * 0.75})`;
                ctx.shadowBlur = 4;
                ctx.fillText('GLOBAL', cx, cy + size * 0.1);

                ctx.shadowBlur = 0;
                ctx.restore();
            }
        }

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}
