// Account-owned preference state. Firebase is injected so session boundaries,
// delayed writes and live updates can be checked without production access.
export function createBossPreferences({ uid, db, firestore, isCurrent = () => true, onChange = () => {} }) {
    if (typeof uid !== 'string' || !uid || uid.includes('/')) throw new TypeError('A signed-in account is required');
    const reference = firestore.doc(db, 'companion_preferences', uid);
    let disposed = false, revision = 0, unsubscribe = null, confirmedEnabled = false;
    let state = { enabled: false, ready: false, saving: false, status: 'loading' };
    const active = () => !disposed && isCurrent();
    const emit = () => { if (active()) onChange({ ...state }); };

    function subscribe() {
        if (!active() || state.saving) return;
        const current = ++revision;
        unsubscribe?.();
        state = { enabled: false, ready: false, saving: false, status: 'loading' };
        emit();
        const fail = () => {
            if (!active() || current !== revision) return;
            state = { ...state, enabled: false, ready: false, status: 'load-error' };
            emit();
        };
        try {
            unsubscribe = firestore.onSnapshot(reference, { includeMetadataChanges: true }, snapshot => {
                if (!active() || current !== revision || snapshot.metadata?.hasPendingWrites) return;
                // An empty local cache is not proof that this account enabled
                // ragdoll. Wait for the server before enabling the effect.
                if (snapshot.metadata?.fromCache) {
                    if (!state.ready && !state.saving) { state.status = 'waiting'; emit(); }
                    return;
                }
                confirmedEnabled = !snapshot.exists() || snapshot.data().ragdollEnabled === true;
                if (!state.saving) {
                    state = { enabled: confirmedEnabled, ready: true, saving: false, status: 'ready' };
                    emit();
                }
            }, fail);
        } catch { fail(); }
    }

    subscribe();
    return {
        uid,
        getState: () => ({ ...state }),
        retry: subscribe,
        async setEnabled(enabled) {
            if (!active() || !state.ready || state.saving || typeof enabled !== 'boolean') return false;
            if (enabled === state.enabled) return true;
            const current = revision;
            state = { ...state, enabled, saving: true, status: 'saving' };
            emit();
            try {
                await firestore.setDoc(reference, { ragdollEnabled: enabled }, { merge: true });
                if (!active() || current !== revision) return false;
                confirmedEnabled = enabled;
                state = { enabled, ready: true, saving: false, status: 'saved' };
                emit();
                return true;
            } catch {
                if (!active() || current !== revision) return false;
                state = { enabled: confirmedEnabled, ready: true, saving: false, status: 'save-error' };
                emit();
                return false;
            }
        },
        dispose() {
            disposed = true; revision++;
            unsubscribe?.(); unsubscribe = null;
        }
    };
}
