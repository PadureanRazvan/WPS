// js/info-version.js
//
// Fills the Info section's version panel from the single source of truth in
// version.js. The panel markup is static (see index.html #info); this only
// populates the dynamic fields once at init. DOM-only — no Firestore, no
// listeners, nothing to clean up. Safe to call again (idempotent).

import { SHERPA_VERSION, computeBuildFingerprint, formatVersionLabel } from './version.js?v=2026.07.16';

function setText(root, id, value) {
    const el = root && root.getElementById ? root.getElementById(id) : null;
    if (el) el.textContent = value;
}

export function initializeInfoVersion(root = (typeof document !== 'undefined' ? document : null)) {
    if (!root) return;

    const version = SHERPA_VERSION;
    setText(root, 'versionNumber', `v${version.number}`);

    // Also surface it in the console so the live build is verifiable without
    // navigating the UI.
    if (typeof console !== 'undefined' && console.log) {
        console.log(`🏔️ Sherpa ${formatVersionLabel(version)} (build ${computeBuildFingerprint(version)})`);
    }
}
