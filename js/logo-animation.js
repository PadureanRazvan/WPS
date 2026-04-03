// Sherpa Logo — Morphing particle animation with electric discharges
// Rebuilt with: Cartesian morphing, nearest-neighbor matching, smooth color blending
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
    const N = 200;

    // ── Continent polygon loops [lon, lat] — separate closed polygons ──
    const continentLoops = [
        // Europe + Western Russia
        [[-10,36],[-9,38],[-8,40],[-9,43],[-4,43],[-2,43],[0,43],[3,43],[5,44],
         [7,44],[9,45],[13,45],[14,44],[16,43],[19,42],[20,40],[24,38],[26,40],
         [29,41],[28,43],[30,45],[27,47],[24,48],[21,48],[17,48],[14,48],[12,47],
         [10,48],[8,49],[6,51],[4,52],[1,51],[-1,50],[-3,48],[-5,48],[-8,44],[-10,44]],
        // Scandinavia
        [[5,58],[8,58],[10,59],[12,56],[12,58],[15,59],[18,60],[18,63],[15,65],
         [14,68],[16,69],[20,69],[25,67],[28,65],[30,62],[27,60],[24,58],[20,56],
         [18,56],[14,56],[10,56]],
        // British Isles
        [[-6,50],[-5,52],[-4,54],[-3,56],[-5,57],[-3,58],[-2,56],[0,53],[1,52],[-1,51],[-3,51]],
        // Africa
        [[-17,15],[-16,13],[-15,11],[-8,5],[-5,5],[0,5],[2,6],[5,4],[8,4],
         [10,2],[10,0],[9,-3],[12,-5],[13,-8],[14,-12],[16,-18],[18,-23],
         [20,-28],[22,-30],[25,-33],[28,-34],[30,-32],[32,-28],[35,-25],
         [37,-20],[40,-15],[42,-12],[44,-10],[46,-8],[48,-5],[50,-2],[50,2],
         [48,5],[45,8],[43,10],[42,12],[40,15],[38,18],[35,20],[33,22],
         [32,30],[33,32],[35,35],[32,37],[30,35],[25,35],[20,35],[15,35],
         [10,35],[5,36],[0,35],[-5,35],[-10,35],[-13,28],[-17,22]],
        // Asia (main mass)
        [[30,35],[35,37],[40,40],[42,42],[45,40],[50,38],[52,42],[55,45],
         [58,48],[60,50],[65,52],[68,55],[70,58],[72,60],[75,62],[80,65],
         [85,68],[90,70],[100,72],[110,70],[120,68],[130,65],[135,60],
         [140,55],[142,50],[145,45],[142,42],[140,40],[135,35],[130,32],
         [125,30],[120,28],[118,25],[115,22],[110,18],[108,15],[106,12],
         [105,10],[103,8],[102,5],[100,2],[98,0],[95,5],[90,8],[85,10],
         [80,12],[78,15],[75,18],[72,20],[70,22],[68,25],[65,28],[62,30],
         [58,32],[55,35],[50,37],[45,38],[42,40]],
        // North America
        [[-170,65],[-165,63],[-160,60],[-155,58],[-148,62],[-140,60],
         [-135,56],[-130,52],[-125,48],[-123,45],[-120,40],[-118,35],
         [-115,32],[-110,30],[-105,28],[-100,26],[-98,28],[-95,30],
         [-92,29],[-90,28],[-88,25],[-85,22],[-82,18],[-80,15],
         [-85,18],[-88,20],[-90,25],[-88,28],[-85,30],[-82,32],
         [-80,35],[-78,38],[-76,40],[-74,41],[-72,42],[-70,43],
         [-68,45],[-66,47],[-64,48],[-60,47],[-58,50],[-55,52],
         [-58,55],[-60,58],[-65,60],[-70,62],[-80,64],[-90,65],
         [-100,66],[-110,68],[-120,70],[-135,70],[-150,68],[-160,66]],
        // Greenland
        [[-45,60],[-42,62],[-38,65],[-35,68],[-30,72],[-25,75],[-22,78],
         [-25,80],[-30,82],[-38,82],[-45,80],[-50,76],[-52,72],[-50,68],[-48,64]],
        // South America
        [[-80,10],[-78,8],[-76,5],[-74,2],[-72,0],[-70,-2],[-68,-5],
         [-65,-8],[-62,-10],[-58,-12],[-55,-15],[-50,-18],[-48,-20],
         [-45,-22],[-43,-24],[-42,-26],[-44,-28],[-46,-30],[-48,-32],
         [-50,-34],[-52,-36],[-55,-38],[-58,-40],[-60,-42],[-62,-44],
         [-65,-46],[-68,-50],[-70,-52],[-72,-50],[-73,-46],[-74,-42],
         [-75,-38],[-74,-35],[-72,-30],[-70,-25],[-72,-20],[-75,-15],
         [-78,-10],[-80,-5],[-80,0],[-80,5]],
        // Australia
        [[114,-22],[116,-20],[118,-18],[120,-16],[125,-14],[130,-13],
         [135,-12],[138,-14],[140,-16],[142,-14],[145,-16],[148,-18],
         [150,-22],[152,-26],[153,-28],[152,-32],[150,-35],[148,-38],
         [145,-38],[140,-37],[138,-35],[135,-34],[132,-33],[128,-32],
         [124,-30],[120,-28],[118,-26],[115,-25]],
        // New Zealand
        [[172,-38],[174,-40],[176,-42],[174,-44],[172,-46],[170,-44],[168,-42],[170,-40]],
    ];

    // Point-in-polygon test (ray casting)
    function pointInPoly(px, py, loop) {
        let inside = false;
        for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
            const xi = loop[i][0], yi = loop[i][1];
            const xj = loop[j][0], yj = loop[j][1];
            if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    // Get bounding box of a polygon loop
    function loopBounds(loop) {
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const [lon, lat] of loop) {
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        }
        return { minLon, maxLon, minLat, maxLat };
    }

    // Sample a random interior point within a polygon
    function sampleInLoop(loop) {
        const { minLon, maxLon, minLat, maxLat } = loopBounds(loop);
        for (let tries = 0; tries < 50; tries++) {
            const lon = minLon + Math.random() * (maxLon - minLon);
            const lat = minLat + Math.random() * (maxLat - minLat);
            if (pointInPoly(lon, lat, loop)) return { lon, lat };
        }
        // Fallback: random point on coastline
        const idx = Math.floor(Math.random() * loop.length);
        return { lon: loop[idx][0], lat: loop[idx][1] };
    }

    // ── Coordinate helpers ────────────────────────────────────────

    function latLonTo3D(lon, lat, r) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lon + 180) * Math.PI / 180;
        return {
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.cos(phi),
            z: r * Math.sin(phi) * Math.sin(theta)
        };
    }

    function sphericalTo3D(phi, theta, r) {
        return {
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.cos(phi),
            z: r * Math.sin(phi) * Math.sin(theta)
        };
    }

    // ── Shape generators ──────────────────────────────────────────
    // Each returns array of {x, y, z, isLand, size}

    function generateGlobe() {
        const pts = [];
        const landCount = Math.floor(N * 0.8);

        // Total coastline length for proportional distribution
        const loopLengths = continentLoops.map(l => l.length);
        const totalLen = loopLengths.reduce((a, b) => a + b, 0);

        // Coastline particles — distributed proportionally per loop, no cross-loop interpolation
        const coastCount = Math.floor(landCount * 0.5);
        let coastRemain = coastCount;
        for (let li = 0; li < continentLoops.length; li++) {
            const loop = continentLoops[li];
            const share = li < continentLoops.length - 1
                ? Math.round(coastCount * loopLengths[li] / totalLen)
                : coastRemain;
            coastRemain -= share;
            for (let i = 0; i < share; i++) {
                const idx = (i / share) * loop.length;
                const i0 = Math.floor(idx) % loop.length;
                const i1 = (i0 + 1) % loop.length;
                const f = idx - Math.floor(idx);
                const lon = loop[i0][0] + (loop[i1][0] - loop[i0][0]) * f + (Math.random() - 0.5) * 1.5;
                const lat = loop[i0][1] + (loop[i1][1] - loop[i0][1]) * f + (Math.random() - 0.5) * 1.5;
                const p = latLonTo3D(lon, lat, R);
                p.isLand = true;
                p.size = 1.5 + Math.random() * 0.3;
                pts.push(p);
            }
        }
        // Interior fill — rejection-sampled inside polygon loops
        const fillCount = landCount - pts.length;
        for (let i = 0; i < fillCount; i++) {
            // Pick a random loop weighted by area (approximated by perimeter)
            const li = Math.floor(Math.random() * continentLoops.length);
            const loop = continentLoops[li];
            const { lon, lat } = sampleInLoop(loop);
            const p = latLonTo3D(lon, lat, R);
            p.isLand = true;
            p.size = 1.3 + Math.random() * 0.3;
            pts.push(p);
        }
        // Ocean — uniform sphere, sparse
        while (pts.length < N) {
            const phi = Math.acos(1 - 2 * Math.random());
            const theta = Math.random() * Math.PI * 2;
            const p = sphericalTo3D(phi, theta, R);
            p.isLand = false;
            p.size = 0.7 + Math.random() * 0.3;
            pts.push(p);
        }
        return pts;
    }

    function generateHeart() {
        const pts = [];
        const s = R / 17;

        // 2D heart implicit test: (x² + y² - 1)³ - x²y³ ≤ 0 (unit heart)
        function insideHeart(hx, hy) {
            const a = hx * hx + hy * hy - 1;
            return a * a * a - hx * hx * hy * hy * hy <= 0;
        }

        // 3D "pillow" heart: 2D heart silhouette extruded with elliptical z-depth
        // Z thickness varies: thickest at center, zero at edges
        const shellN = Math.floor(N * 0.4);
        const fillN = N - shellN;
        const maxDepth = R * 0.35;

        // Shell particles — on the surface outline at various z slices
        for (let i = 0; i < shellN; i++) {
            const t = (i / shellN) * Math.PI * 2;
            const hx = 16 * Math.pow(Math.sin(t), 3);
            const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
            // Z depth: elliptical cross-section, thicker near center
            const distFromCenter = Math.sqrt(hx * hx + hy * hy) / 17;
            const zEnvelope = maxDepth * Math.sqrt(Math.max(0, 1 - distFromCenter * distFromCenter));
            const zAngle = Math.random() * Math.PI * 2;
            const zr = zEnvelope * (0.8 + Math.random() * 0.2);
            pts.push({
                x: hx * s + (Math.random() - 0.5) * 0.4,
                y: -hy * s - R * 0.05 + (Math.random() - 0.5) * 0.4,
                z: Math.sin(zAngle) * zr,
                isLand: false, size: 1.15 + Math.random() * 0.1
            });
        }
        // Volume fill — rejection-sample inside the 2D heart, with 3D z depth
        let placed = 0;
        for (let tries = 0; tries < fillN * 30 && placed < fillN; tries++) {
            // Sample in normalized heart space [-1.3, 1.3]
            const nx = (Math.random() - 0.5) * 2.6;
            const ny = -1.2 + Math.random() * 2.5;
            if (insideHeart(nx, ny)) {
                const distFromCenter = Math.sqrt(nx * nx + ny * ny) / 1.3;
                const zEnvelope = maxDepth * Math.sqrt(Math.max(0, 1 - distFromCenter));
                const z = (Math.random() - 0.5) * 2 * zEnvelope;
                pts.push({
                    x: nx * R * 0.62,
                    y: -ny * R * 0.62 - R * 0.05,
                    z: z,
                    isLand: false, size: 0.9 + Math.random() * 0.3
                });
                placed++;
            }
        }
        // Fallback
        while (pts.length < N) {
            const t = Math.random() * Math.PI * 2;
            const fill = 0.1 + Math.random() * 0.8;
            const hx = 16 * Math.pow(Math.sin(t), 3) * fill;
            const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * fill;
            pts.push({
                x: hx * s, y: hy * s - R * 0.05, z: (Math.random() - 0.5) * R * 0.15,
                isLand: false, size: 0.9
            });
        }
        return pts;
    }

    function generateSphere() {
        const pts = [];
        // Fibonacci sphere — optimal uniform distribution
        const golden = Math.PI * (1 + Math.sqrt(5));
        for (let i = 0; i < N; i++) {
            const phi = Math.acos(1 - 2 * (i + 0.5) / N);
            const theta = golden * i;
            const p = sphericalTo3D(phi, theta, R);
            p.isLand = false;
            p.size = 0.8 + Math.sin(phi) * 0.35;
            pts.push(p);
        }
        return pts;
    }

    // ── Greedy nearest-neighbor particle matching ─────────────────
    // Minimizes total travel distance during morphs to prevent chaotic crossings

    function matchParticles(fromPositions, toPoints) {
        const n = toPoints.length;
        const assignment = new Array(n);
        const used = new Set();

        // For each target point, find the closest available source particle
        // Sort targets by distance to center so center particles match first
        const indices = Array.from({ length: n }, (_, i) => i);
        indices.sort((a, b) => {
            const da = toPoints[a].x ** 2 + toPoints[a].y ** 2 + toPoints[a].z ** 2;
            const db = toPoints[b].x ** 2 + toPoints[b].y ** 2 + toPoints[b].z ** 2;
            return da - db;
        });

        for (const ti of indices) {
            const tp = toPoints[ti];
            let bestIdx = -1, bestDist = Infinity;
            for (let si = 0; si < n; si++) {
                if (used.has(si)) continue;
                const sp = fromPositions[si];
                const dx = sp.x - tp.x, dy = sp.y - tp.y, dz = sp.z - tp.z;
                const d = dx * dx + dy * dy + dz * dz;
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = si;
                }
            }
            assignment[ti] = bestIdx;
            used.add(bestIdx);
        }
        return assignment;
    }

    // Swap-based refinement: reduce total travel distance after greedy matching
    function improveAssignment(assign, from, to, passes) {
        const dist2 = (a, b) => {
            const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
            return dx * dx + dy * dy + dz * dz;
        };
        for (let pass = 0; pass < passes; pass++) {
            let changed = false;
            for (let i = 0; i < assign.length; i++) {
                for (let j = i + 1; j < assign.length; j++) {
                    const ai = assign[i], aj = assign[j];
                    const before = dist2(from[ai], to[i]) + dist2(from[aj], to[j]);
                    const after = dist2(from[ai], to[j]) + dist2(from[aj], to[i]);
                    if (after < before) {
                        assign[i] = aj;
                        assign[j] = ai;
                        changed = true;
                    }
                }
            }
            if (!changed) break;
        }
        return assign;
    }

    // ── Particle state ────────────────────────────────────────────

    const shapeGens = [generateGlobe, generateHeart, generateSphere];
    const shapeNames = ['globe', 'heart', 'sphere'];
    let currentShape = 0;
    let morphProgress = 1;
    let morphTimer = 0;
    const morphDuration = 2.2;
    const holdDuration = 4.5;
    const globeHoldDuration = 7;

    // Initialize particles from globe
    const initPts = generateGlobe();
    const particles = initPts.map((p, i) => ({
        // Current 3D position
        x: p.x, y: p.y, z: p.z,
        // Morph from/to
        fx: p.x, fy: p.y, fz: p.z,
        tx: p.x, ty: p.y, tz: p.z,
        // Visual
        size: p.size,
        fromSize: p.size, toSize: p.size,
        alpha: 0.5 + Math.random() * 0.5,
        pulse: Math.random() * Math.PI * 2,
        breath: Math.random() * Math.PI * 2,
        // Color: 0 = amber, 1 = globe-land, 2 = globe-ocean
        colorFrom: p.isLand ? 1 : 2,
        colorTo: p.isLand ? 1 : 2,
        colorBlend: 1,
        // Stagger: random delay for wave effect
        stagger: Math.random() * 0.25,
        isLand: p.isLand
    }));

    // Spring easing with slight overshoot
    function spring(t) {
        if (t >= 1) return 1;
        if (t <= 0) return 0;
        return 1 - Math.exp(-6 * t) * Math.cos(2.8 * t * Math.PI);
    }

    function startMorph() {
        const nextIdx = (currentShape + 1) % shapeGens.length;
        const toShape = shapeGens[nextIdx]();
        const isToGlobe = shapeNames[nextIdx] === 'globe';
        const isToHeart = shapeNames[nextIdx] === 'heart';

        // Get current positions for matching, then refine with swaps
        const fromPos = particles.map(p => ({ x: p.x, y: p.y, z: p.z }));
        const assignment = matchParticles(fromPos, toShape);
        improveAssignment(assignment, fromPos, toShape, 3);

        for (let ti = 0; ti < N; ti++) {
            const si = assignment[ti];
            const p = particles[si];
            const tp = toShape[ti];

            p.fx = p.x; p.fy = p.y; p.fz = p.z;
            p.tx = tp.x; p.ty = tp.y; p.tz = tp.z;
            p.fromSize = p.size;
            p.toSize = tp.size;
            p.colorFrom = p.colorTo;
            p.colorTo = isToGlobe ? (tp.isLand ? 1 : 2) : isToHeart ? 3 : 0;
            p.colorBlend = 0;
            p.isLand = tp.isLand;
            p.stagger = Math.random() * 0.2;
        }

        morphProgress = 0;
        currentShape = nextIdx;
    }

    // ── Electric discharge system ─────────────────────────────────

    const bolts = [];
    let boltCooldown = 3 + Math.random() * 2;

    function generateBoltPath(x1, y1, x2, y2, gens, maxOff) {
        let pts = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
        for (let g = 0; g < gens; g++) {
            const next = [pts[0]];
            const off = maxOff / (1 << g);
            for (let j = 0; j < pts.length - 1; j++) {
                const a = pts[j], b = pts[j + 1];
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                const dx = b.x - a.x, dy = b.y - a.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const disp = (Math.random() - 0.5) * 2 * off;
                next.push({ x: mx + (-dy / len) * disp, y: my + (dx / len) * disp });
                next.push(b);
            }
            pts = next;
        }
        return pts;
    }

    function createBolt(proj) {
        if (proj.length < 20) return;
        const i1 = Math.floor(Math.random() * proj.length);
        const p1 = proj[i1];
        let best = null, bestS = Infinity;
        for (let t = 0; t < 12; t++) {
            const i2 = Math.floor(Math.random() * proj.length);
            if (i2 === i1) continue;
            const p2 = proj[i2];
            const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            const s = Math.abs(d - R * 0.8);
            if (d > 8 && d < R * 2 && s < bestS) { best = p2; bestS = s; }
        }
        if (!best) return;

        const main = generateBoltPath(p1.x, p1.y, best.x, best.y, 4, R * 0.25);
        const branches = [];
        if (Math.random() > 0.4 && main.length > 4) {
            const bs = main[Math.floor(main.length * 0.3 + Math.random() * main.length * 0.4)];
            branches.push(generateBoltPath(bs.x, bs.y,
                bs.x + (Math.random() - 0.5) * R * 0.6,
                bs.y + (Math.random() - 0.5) * R * 0.6, 3, R * 0.15));
        }
        bolts.push({ main, branches, life: 0, maxLife: 0.12 + Math.random() * 0.18,
            sp: { x: p1.x, y: p1.y }, ep: { x: best.x, y: best.y } });
    }

    function drawPath(path, w) {
        if (path.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.lineWidth = w;
        ctx.stroke();
    }

    // ── Color palettes ────────────────────────────────────────────

    function isDarkTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark'
            || document.body.classList.contains('dark-theme')
            || window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // Returns [r, g, b] for a color type at given depth
    // 0 = amber/gold, 1 = globe land, 2 = globe ocean, 3 = heart red
    function getColor(type, depth, dark) {
        if (type === 0) { // amber/gold
            return [232 - depth * 30, 168 - depth * 50, 73 + depth * 40];
        } else if (type === 1) { // globe land (green)
            return dark
                ? [50 + depth * 40, 160 + depth * 50, 80 + depth * 20]
                : [20 + depth * 30, 110 + depth * 40, 40 + depth * 20];
        } else if (type === 2) { // globe ocean (blue)
            return dark
                ? [30 + depth * 20, 90 + depth * 30, 180 + depth * 40]
                : [15 + depth * 15, 60 + depth * 25, 150 + depth * 35];
        } else { // heart red
            return dark
                ? [210 + depth * 30, 50 + depth * 25, 50 + depth * 20]
                : [190 + depth * 30, 35 + depth * 20, 40 + depth * 15];
        }
    }

    // ── Main animation loop ───────────────────────────────────────

    let rotY = 0, lastTime = performance.now();

    function animate(now) {
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        const dark = isDarkTheme();
        const isGlobe = shapeNames[currentShape] === 'globe';
        const isHeart = shapeNames[currentShape] === 'heart';

        // Smooth blend factors for each shape
        const globeFactor = isGlobe
            ? (morphProgress < 1 ? morphProgress : 1)
            : (morphProgress < 1 ? 1 - morphProgress : 0);
        const heartFactor = isHeart
            ? (morphProgress < 1 ? morphProgress : 1)
            : (morphProgress < 1 ? 1 - morphProgress : 0);

        // Rotation — heart eases to face camera (nearest multiple of 2PI)
        if (heartFactor > 0.5) {
            // Ease rotY toward nearest front-facing angle (multiple of 2*PI)
            const target = Math.round(rotY / (Math.PI * 2)) * Math.PI * 2;
            rotY += (target - rotY) * dt * 3 * heartFactor;
        } else {
            const rotSpeed = 0.3 + (1 - globeFactor) * 0.2;
            rotY += dt * rotSpeed;
        }
        const rotX = 0.25 + Math.sin(now * 0.00025) * (1 - heartFactor * 0.7) * 0.1;

        // Morph timing + settle pulse
        let settlePulse = 1;
        if (morphProgress >= 1) {
            morphTimer += dt;
            // Subtle 2% scale bounce when shape settles in
            if (morphTimer < 0.4) {
                settlePulse = 1 + 0.02 * Math.sin(morphTimer / 0.4 * Math.PI) * (1 - morphTimer / 0.4);
            }
            const hold = isGlobe ? globeHoldDuration : holdDuration;
            if (morphTimer >= hold) { morphTimer = 0; startMorph(); }
        } else {
            morphProgress = Math.min(1, morphProgress + dt / morphDuration);
            for (const p of particles) {
                const localT = Math.max(0, Math.min(1, (morphProgress - p.stagger) / (1 - p.stagger)));
                const e = spring(localT);
                p.x = p.fx + (p.tx - p.fx) * e;
                p.y = p.fy + (p.ty - p.fy) * e;
                p.z = p.fz + (p.tz - p.fz) * e;
                p.size = p.fromSize + (p.toSize - p.fromSize) * e;
                p.colorBlend = e;
            }
        }

        ctx.clearRect(0, 0, size, size);

        // Shape-specific atmosphere glow
        const glowStrength = Math.max(globeFactor, heartFactor * 0.5, (1 - globeFactor - heartFactor) * 0.3);
        if (glowStrength > 0.01) {
            const glow = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.35);
            // Blend glow color: blue for globe, warm red for heart, amber for sphere
            const gr = Math.round(40 * globeFactor + 180 * heartFactor + 200 * (1 - globeFactor - heartFactor));
            const gg = Math.round(100 * globeFactor + 50 * heartFactor + 150 * (1 - globeFactor - heartFactor));
            const gb = Math.round(200 * globeFactor + 50 * heartFactor + 80 * (1 - globeFactor - heartFactor));
            const a = (dark ? 0.07 : 0.05) * glowStrength;
            glow.addColorStop(0, `rgba(${gr},${gg},${gb},${a})`);
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
            ctx.fill();
        }

        // 3D projection
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        const perspD = 120;

        const proj = [];
        for (const p of particles) {
            const x2 = p.x * cosY - p.z * sinY;
            const z2 = p.x * sinY + p.z * cosY;
            const y2 = p.y * cosX - z2 * sinX;
            const z3 = p.y * sinX + z2 * cosX;
            const sc = perspD / (perspD + z3) * settlePulse;
            const breath = 1 + Math.sin(now * 0.0012 + p.breath) * 0.06;

            proj.push({
                x: cx + x2 * sc,
                y: cy + y2 * sc,
                z: z3,
                size: p.size * sc * breath,
                alpha: p.alpha * sc * (Math.sin(now * 0.002 + p.pulse) * 0.15 + 0.85),
                colorFrom: p.colorFrom,
                colorTo: p.colorTo,
                colorBlend: p.colorBlend,
                isLand: p.isLand
            });
        }

        proj.sort((a, b) => a.z - b.z);

        // Connection lines — grid-accelerated, capped per particle, back-hemisphere fade
        ctx.lineWidth = 0.3;
        const maxConn = 10 + (1 - globeFactor) * 6;
        const maxConnSq = maxConn * maxConn;
        const cellSize = maxConn;
        const grid = new Map();

        for (let i = 0; i < proj.length; i++) {
            const gx = Math.floor(proj[i].x / cellSize);
            const gy = Math.floor(proj[i].y / cellSize);
            const key = (gx << 16) | (gy & 0xFFFF);
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(i);
        }

        for (const [key, indices] of grid) {
            const gx = key >> 16;
            const gy = (key << 16) >> 16;
            for (const i of indices) {
                const a = proj[i];
                // Skip back-hemisphere particles when globe is showing
                if (globeFactor > 0.3 && a.z < -R * 0.15) continue;
                let links = 0;
                for (let ox = -1; ox <= 1; ox++) {
                    for (let oy = -1; oy <= 1; oy++) {
                        const nk = ((gx + ox) << 16) | ((gy + oy) & 0xFFFF);
                        const bucket = grid.get(nk);
                        if (!bucket) continue;
                        for (const j of bucket) {
                            if (j <= i) continue;
                            const b = proj[j];
                            if (globeFactor > 0.3 && b.z < -R * 0.15) continue;
                            const dx = a.x - b.x, dy = a.y - b.y;
                            const d2 = dx * dx + dy * dy;
                            if (d2 >= maxConnSq) continue;

                            const d = Math.sqrt(d2);
                            const la = (1 - d / maxConn) * 0.12 * Math.min(a.alpha, b.alpha);
                            // Per-particle color blend (avg of both particles)
                            const blend = (a.colorBlend + b.colorBlend) / 2;
                            const cType = (a.isLand && b.isLand) ? 1 : (a.isLand || b.isLand) ? 2 : 0;
                            const landAlpha = la * (cType === 1 ? 2.2 : cType === 2 ? 0.8 : 1);
                            const blendFactor = globeFactor * blend;
                            const finalAlpha = la + (landAlpha - la) * blendFactor;
                            if (blendFactor > 0.3) {
                                const c = cType === 1
                                    ? (dark ? [60, 180, 100] : [30, 130, 60])
                                    : (dark ? [50, 120, 200] : [30, 80, 170]);
                                const r = 232 + (c[0] - 232) * blendFactor;
                                const g = 168 + (c[1] - 168) * blendFactor;
                                const bv = 73 + (c[2] - 73) * blendFactor;
                                ctx.strokeStyle = `rgba(${r|0},${g|0},${bv|0},${finalAlpha})`;
                            } else {
                                ctx.strokeStyle = `rgba(232,168,73,${finalAlpha})`;
                            }
                            ctx.beginPath();
                            ctx.moveTo(a.x, a.y);
                            ctx.lineTo(b.x, b.y);
                            ctx.stroke();
                            if (++links >= 3) break;
                        }
                        if (links >= 3) break;
                    }
                    if (links >= 3) break;
                }
            }
        }

        // Draw particles — solid core + optional faint halo (crisp at small sizes)
        for (const p of proj) {
            const depth = (p.z + R + 5) / (R * 2 + 10);
            const cFrom = getColor(p.colorFrom, depth, dark);
            const cTo = getColor(p.colorTo, depth, dark);
            const bl = p.colorBlend;
            const r = Math.round(Math.max(0, Math.min(255, cFrom[0] + (cTo[0] - cFrom[0]) * bl)));
            const g = Math.round(Math.max(0, Math.min(255, cFrom[1] + (cTo[1] - cFrom[1]) * bl)));
            const b = Math.round(Math.max(0, Math.min(255, cFrom[2] + (cTo[2] - cFrom[2]) * bl)));

            // Snap to half-pixels for crisp dots
            const px = Math.round(p.x) + 0.5;
            const py = Math.round(p.y) + 0.5;
            const coreR = Math.max(0.7, p.size * 0.5);

            // Solid core — sharp and legible
            ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`;
            ctx.beginPath();
            ctx.arc(px, py, coreR, 0, Math.PI * 2);
            ctx.fill();

            // Faint halo — only for larger particles, using additive blend
            if (p.size > 0.9) {
                const haloR = p.size * 1.8;
                const halo = ctx.createRadialGradient(px, py, coreR, px, py, haloR);
                halo.addColorStop(0, `rgba(${r},${g},${b},${p.alpha * 0.18})`);
                halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = halo;
                ctx.beginPath();
                ctx.arc(px, py, haloR, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
        }

        // Electric discharges
        boltCooldown -= dt;
        if (boltCooldown <= 0 && proj.length > 20) {
            createBolt(proj);
            boltCooldown = morphProgress < 1
                ? 0.08 + Math.random() * 0.15
                : 2.5 + Math.random() * 4;
        }

        // Shape-tinted lightning bolts
        // Blend bolt color: cyan for globe/sphere, warm red-pink for heart
        const bltR1 = Math.round(120 + heartFactor * 100);
        const bltG1 = Math.round(200 - heartFactor * 120);
        const bltB1 = Math.round(255 - heartFactor * 130);
        const bltR2 = Math.round(140 + heartFactor * 90);
        const bltG2 = Math.round(210 - heartFactor * 120);
        const bltB2 = Math.round(255 - heartFactor * 130);
        const bltR3 = Math.round(230 + heartFactor * 20);
        const bltG3 = Math.round(250 - heartFactor * 100);
        const bltB3 = Math.round(255 - heartFactor * 80);

        ctx.save();
        for (let i = bolts.length - 1; i >= 0; i--) {
            const bolt = bolts[i];
            bolt.life += dt;
            if (bolt.life >= bolt.maxLife) { bolts.splice(i, 1); continue; }

            const prog = bolt.life / bolt.maxLife;
            const a = prog < 0.2 ? prog / 0.2 : 1 - (prog - 0.2) / 0.8;

            ctx.shadowColor = `rgba(${bltR1},${bltG1},${bltB1},${a * 0.6})`;
            ctx.shadowBlur = 6;
            ctx.strokeStyle = `rgba(${bltR2},${bltG2},${bltB2},${a * 0.6})`;
            drawPath(bolt.main, 1.8);

            for (const br of bolt.branches) {
                ctx.strokeStyle = `rgba(${bltR2},${bltG2},${bltB2},${a * 0.35})`;
                drawPath(br, 0.8);
            }

            ctx.shadowBlur = 3;
            ctx.shadowColor = `rgba(${bltR3},${bltG3},${bltB3},${a * 0.8})`;
            ctx.strokeStyle = `rgba(${bltR3},${bltG3},${bltB3},${a * 0.85})`;
            drawPath(bolt.main, 0.6);

            if (a > 0.3) {
                const sr = 2.5 * a;
                for (const pt of [bolt.sp, bolt.ep]) {
                    const sg = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, sr);
                    sg.addColorStop(0, `rgba(255,255,255,${a * 0.9})`);
                    sg.addColorStop(0.4, `rgba(${bltR2},${bltG2},${bltB2},${a * 0.5})`);
                    sg.addColorStop(1, `rgba(${bltR1},${bltG1},${bltB1},0)`);
                    ctx.fillStyle = sg;
                    ctx.shadowBlur = 4;
                    ctx.shadowColor = `rgba(${bltR1},${bltG1},${bltB1},${a * 0.6})`;
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, sr, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        ctx.restore();

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}
