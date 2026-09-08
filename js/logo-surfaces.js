// Pure surface descriptions are shared by solid meshes and morph particles.

/** Shallow globe lens; the approved artwork's XY coordinates stay unchanged. */
export const FSP_GLOBE_PROFILES = Object.freeze({
    full: Object.freeze({ x: -0.45, y: 0.25, radius: 0.817, height: 0.25 }),
    compact: Object.freeze({ x: -0.249, y: 0.005, radius: 0.925, height: 0.29 })
});

export function getFspRelief(x, y, variant = 'full') {
    const profile = FSP_GLOBE_PROFILES[variant] || FSP_GLOBE_PROFILES.full;
    const dx = (x - profile.x) / profile.radius;
    const dy = (y - profile.y) / profile.radius;
    const interior = Math.max(0, 1 - dx * dx - dy * dy);
    const height = profile.height * interior * interior;
    const slope = -4 * profile.height * interior / profile.radius;
    return { height, dx: slope * dx, dy: slope * dy };
}

export const FSP_BEVEL = Object.freeze({ depth: 0.035, size: 0.0035, thickness: 0.012 });
