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
    const R = size * 0.28;
    const numParticles = 200;
    const particles = [];

    // Dense continent coastline data [lon, lat] — enough points to be recognizable
    // Each sub-array is one continuous coastline segment
    const continents = [
        // ── EUROPE ──
        [-10,36],[-9,38],[-8,40],[-9,43],[-4,43],[-2,43],[0,43],[3,43],[5,44],
        [7,44],[9,45],[13,45],[14,44],[16,43],[19,42],[20,40],[24,38],[26,40],
        [29,41],[28,43],[30,45],[27,47],[24,48],[21,48],[17,48],[14,48],[12,47],
        [10,48],[8,49],[6,51],[4,52],[1,51],[-1,50],[-3,48],[-5,48],[-8,44],
        [-10,44],[-10,40],
        // Scandinavia
        [5,58],[8,58],[10,59],[12,56],[12,58],[15,59],[18,60],[18,63],[15,65],
        [14,68],[16,69],[20,69],[25,67],[28,65],[30,62],[27,60],[24,58],[20,56],
        [18,56],[14,56],[10,56],
        // UK/Ireland
        [-6,50],[-5,52],[-4,54],[-3,56],[-5,57],[-3,58],[-2,56],[0,53],[1,52],
        [-1,51],[-3,51],[-5,51],
        [-10,52],[-9,54],[-8,55],[-9,53],[-10,52],
        // ── AFRICA ──
        [-17,15],[-16,13],[-15,11],[-8,5],[-5,5],[0,5],[2,6],[5,4],[8,4],
        [10,2],[10,0],[9,-3],[12,-5],[13,-8],[14,-12],[16,-18],[18,-23],
        [20,-28],[22,-30],[25,-33],[28,-34],[30,-32],[32,-28],[35,-25],
        [37,-20],[40,-15],[42,-12],[44,-10],[46,-8],[48,-5],[50,-2],[50,2],
        [48,5],[45,8],[43,10],[42,12],[40,15],[38,18],[35,20],[33,22],
        [32,30],[33,32],[35,35],[32,37],[30,35],[25,35],[20,35],[15,35],
        [10,35],[5,36],[0,35],[-5,35],[-10,35],[-13,28],[-17,22],[-17,15],
        // ── ASIA ──
        [30,35],[35,37],[40,40],[42,42],[45,40],[50,38],[52,42],[55,45],
        [58,48],[60,50],[65,52],[68,55],[70,58],[72,60],[75,62],[80,65],
        [85,68],[90,70],[100,72],[110,70],[120,68],[130,65],[135,60],
        [140,55],[142,50],[145,45],[142,42],[140,40],[135,35],[130,32],
        [125,30],[120,28],[118,25],[115,22],[110,18],[108,15],[106,12],
        [105,10],[103,8],[102,5],[100,2],[98,0],[95,5],[90,8],[85,10],
        [80,12],[78,15],[75,18],[72,20],[70,22],[68,25],[65,28],[62,30],
        [58,32],[55,35],[50,37],[45,38],[42,40],
        // India
        [68,28],[70,25],[72,22],[74,18],[76,14],[78,10],[80,8],[80,12],
        [78,16],[76,20],[74,24],[72,26],
        // Japan
        [130,32],[132,34],[134,36],[136,38],[138,40],[140,42],[142,44],
        [140,40],[138,36],[136,34],[134,32],
        // ── NORTH AMERICA ──
        [-170,65],[-165,63],[-160,60],[-155,58],[-148,62],[-140,60],
        [-135,56],[-130,52],[-125,48],[-123,45],[-120,40],[-118,35],
        [-115,32],[-110,30],[-105,28],[-100,26],[-98,28],[-95,30],
        [-92,29],[-90,28],[-88,25],[-85,22],[-82,18],[-80,15],
        [-85,18],[-88,20],[-90,25],[-88,28],[-85,30],[-82,32],
        [-80,35],[-78,38],[-76,40],[-74,41],[-72,42],[-70,43],
        [-68,45],[-66,47],[-64,48],[-60,47],[-58,50],[-55,52],
        [-58,55],[-60,58],[-65,60],[-70,62],[-80,64],[-90,65],
        [-100,66],[-110,68],[-120,70],[-135,70],[-150,68],[-160,66],
        // Greenland
        [-45,60],[-42,62],[-38,65],[-35,68],[-30,72],[-25,75],[-22,78],
        [-25,80],[-30,82],[-38,82],[-45,80],[-50,76],[-52,72],[-50,68],
        [-48,64],[-45,60],
        // ── SOUTH AMERICA ──
        [-80,10],[-78,8],[-76,5],[-74,2],[-72,0],[-70,-2],[-68,-5],
        [-65,-8],[-62,-10],[-58,-12],[-55,-15],[-50,-18],[-48,-20],
        [-45,-22],[-43,-24],[-42,-26],[-44,-28],[-46,-30],[-48,-32],
        [-50,-34],[-52,-36],[-55,-38],[-58,-40],[-60,-42],[-62,-44],
        [-65,-46],[-68,-50],[-70,-52],[-72,-50],[-73,-46],[-74,-42],
        [-75,-38],[-74,-35],[-72,-30],[-70,-25],[-72,-20],[-75,-15],
        [-78,-10],[-80,-5],[-80,0],[-80,5],[-80,10],
        // ── AUSTRALIA ──
        [114,-22],[116,-20],[118,-18],[120,-16],[125,-14],[130,-13],
        [135,-12],[138,-14],[140,-16],[142,-14],[145,-16],[148,-18],
        [150,-22],[152,-26],[153,-28],[152,-32],[150,-35],[148,-38],
        [145,-38],[140,-37],[138,-35],[135,-34],[132,-33],[128,-32],
        [124,-30],[120,-28],[118,-26],[115,-25],[114,-22],
        // New Zealand
        [172,-38],[174,-40],[176,-42],[174,-44],[172,-46],[170,-44],
        [168,-42],[170,-40],[172,-38],
    ];

    function latLonToSpherical(lon, lat) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lon + 180) * Math.PI / 180;
        return { phi, theta, r: R };
    }

    function generateGlobePoints() {
        const pts = [];
        const landCount = Math.floor(numParticles * 0.75);

        // Sample from continent data with interpolation
        for (let i = 0; i < landCount; i++) {
            const idx = (i / landCount) * continents.length;
            const i0 = Math.floor(idx) % continents.length;
            const i1 = (i0 + 1) % continents.length;
            const frac = idx - Math.floor(idx);

            const lon = continents[i0][0] + (continents[i1][0] - continents[i0][0]) * frac;
            const lat = continents[i0][1] + (continents[i1][1] - continents[i0][1]) * frac;

            // Small jitter for organic look
            const jLon = lon + (Math.random() - 0.5) * 3;
            const jLat = lat + (Math.random() - 0.5) * 3;
            const sp = latLonToSpherical(jLon, jLat);
            pts.push({ ...sp, isLand: true });
        }

        // Ocean particles — evenly distributed on sphere
        while (pts.length < numParticles) {
            const phi = Math.acos(1 - 2 * Math.random());
            const theta = Math.random() * Math.PI * 2;
            pts.push({ phi, theta, r: R, isLand: false });
        }

        return pts;
    }

    // Other morphing shapes
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
                pts.push({ phi: Math.PI / 2 + Math.sin(p) * 0.6, theta: t, r: R * 0.7 + Math.cos(p) * R * 0.35 });
            }
            return pts;
        },
        mountain: () => {
            const pts = [];
            for (let i = 0; i < numParticles; i++) {
                const angle = (i / numParticles) * Math.PI * 2;
                const h = (i % 4) / 4;
                const r = R * (1 - h * 0.7);
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
                pts.push({ phi, theta, r: R * 0.6, offsetX: half * R * 0.5 });
            }
            return pts;
        }
    };

    const shapeKeys = Object.keys(shapes);
    let currentShape = 0;
    let morphProgress = 1;
    let morphTimer = 0;
    const morphDuration = 2.0;
    const holdDuration = 4;

    const initPts = shapes.globe();
    for (let i = 0; i < numParticles; i++) {
        const t = initPts[i];
        particles.push({
            phi: t.phi, theta: t.theta, r: t.r,
            offsetX: t.offsetX || 0,
            fromPhi: t.phi, fromTheta: t.theta, fromR: t.r, fromOffsetX: 0,
            toPhi: t.phi, toTheta: t.theta, toR: t.r, toOffsetX: 0,
            size: 0.8 + Math.random() * 1.0,
            alpha: 0.5 + Math.random() * 0.5,
            pulse: Math.random() * Math.PI * 2,
            isLand: t.isLand || false
        });
    }

    function startMorph() {
        const nextShape = (currentShape + 1) % shapeKeys.length;
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
    let rotationX = 0.25;
    let lastTime = performance.now();

    function isDarkTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark'
            || document.body.classList.contains('dark-theme')
            || window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function animate(now) {
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        const dark = isDarkTheme();
        const isGlobe = shapeKeys[currentShape] === 'globe';

        rotationY += dt * (isGlobe ? 0.25 : 0.5);
        rotationX = 0.25 + Math.sin(now * 0.00025) * 0.1;

        if (morphProgress >= 1) {
            morphTimer += dt;
            if (morphTimer >= (isGlobe ? 7 : holdDuration)) {
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

        // Globe atmosphere glow
        if (isGlobe && morphProgress >= 1) {
            const glow = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.4);
            glow.addColorStop(0, dark ? 'rgba(40, 100, 200, 0.08)' : 'rgba(20, 80, 160, 0.06)');
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx, cy, R * 1.4, 0, Math.PI * 2);
            ctx.fill();
        }

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
                alpha: p.alpha * scale * (Math.sin(now * 0.002 + p.pulse) * 0.2 + 0.8),
                isLand: p.isLand
            });
        }

        projected.sort((a, b) => a.z - b.z);

        // Draw connections
        ctx.lineWidth = 0.3;
        for (let i = 0; i < projected.length; i++) {
            for (let j = i + 1; j < projected.length; j++) {
                const a = projected[i], b = projected[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxD = isGlobe ? 10 : 16;
                if (dist < maxD) {
                    const la = (1 - dist / maxD) * 0.1 * Math.min(a.alpha, b.alpha);
                    if (isGlobe && a.isLand && b.isLand) {
                        ctx.strokeStyle = dark
                            ? `rgba(60, 180, 100, ${la * 2.5})`
                            : `rgba(30, 130, 60, ${la * 2.5})`;
                    } else if (isGlobe) {
                        ctx.strokeStyle = dark
                            ? `rgba(50, 120, 200, ${la * 0.5})`
                            : `rgba(30, 80, 170, ${la * 0.5})`;
                    } else {
                        ctx.strokeStyle = `rgba(232, 168, 73, ${la})`;
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
                // Green continents
                r = dark ? 50 + depth * 40 : 20 + depth * 30;
                g = dark ? 160 + depth * 50 : 110 + depth * 40;
                b = dark ? 80 + depth * 20 : 40 + depth * 20;
            } else if (isGlobe) {
                // Blue ocean
                r = dark ? 30 + depth * 20 : 15 + depth * 15;
                g = dark ? 90 + depth * 30 : 60 + depth * 25;
                b = dark ? 180 + depth * 40 : 150 + depth * 35;
            } else {
                // Amber (Sherpa brand)
                r = 232 - Math.round(depth * 30);
                g = 168 - Math.round(depth * 50);
                b = 73 + Math.round(depth * 40);
            }

            r = Math.max(0, Math.min(255, Math.round(r)));
            g = Math.max(0, Math.min(255, Math.round(g)));
            b = Math.max(0, Math.min(255, Math.round(b)));

            // Glow
            const gs = isGlobe && p.isLand ? p.size * 4 : p.size * 2.5;
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, gs);
            grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.5})`);
            grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, gs, 0, Math.PI * 2);
            ctx.fill();

            // Core dot
            const cs = isGlobe && p.isLand ? p.size * 1.4 : p.size;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, cs, 0, Math.PI * 2);
            ctx.fill();
        }

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}
