// js/version.js
//
// Single source of truth for the Sherpa release identity.
//
// ============================ HOW TO CUT A RELEASE ============================
// On every deploy that changes the app, bump the three fields in SHERPA_VERSION:
//   1. number   — CalVer "YYYY.MM.DD" (the deploy date; append ".2", ".3", ...
//                 for a second/third release on the same day).
//   2. codename — a fresh, memorable two-word name, unique to this release.
//   3. released — the ISO date this build shipped.
//
// The build fingerprint is DERIVED automatically from those three fields, so any
// change produces a new id you can eyeball. Open Info in the app and match the
// codename / build id against the latest release to confirm you are 100% on the
// newest deploy.
// =============================================================================

export const SHERPA_VERSION = Object.freeze({
    number: '2026.07.15.6',
    codename: 'Safe Horizon',
    released: '2026-07-15'
});

// FNV-1a (32-bit) over the identifying fields -> short, stable hex fingerprint.
// Deterministic: the same version always yields the same id, and any edit to the
// fields above changes it. Not cryptographic — it is a human-checkable build tag.
export function computeBuildFingerprint(version = SHERPA_VERSION) {
    const input = `${version.number}|${version.codename}|${version.released}`;
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

// "v2026.06.10 · Liquid Aurora" — the one-line human label (logs, tooltips).
export function formatVersionLabel(version = SHERPA_VERSION) {
    return `v${version.number} · ${version.codename}`;
}
