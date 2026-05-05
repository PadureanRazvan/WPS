const DEFAULT_PRODUCTIVITY_COLLECTION = 'productivity';

export function serializeProductivityAgentMap(map) {
    if (!map) return null;

    const serialized = {};
    map.forEach((value, key) => {
        const teams = {};
        if (value.teams) {
            value.teams.forEach((count, team) => {
                teams[team] = count;
            });
        }
        serialized[key] = { ...value, teams };
    });

    return serialized;
}

export function deserializeProductivityAgentMap(obj) {
    if (!obj) return null;

    const map = new Map();
    for (const [key, value] of Object.entries(obj)) {
        const teams = new Map();
        if (value.teams) {
            for (const [team, count] of Object.entries(value.teams)) {
                teams.set(team, count);
            }
        }
        map.set(key, { ...value, teams });
    }

    return map.size > 0 ? map : null;
}

export function buildProductivityDateDocument(entry, { now = () => new Date().toISOString() } = {}) {
    return {
        ticketsData: serializeProductivityAgentMap(entry?.ticketsData),
        callsData: serializeProductivityAgentMap(entry?.callsData),
        updatedAt: now()
    };
}

export function hydrateProductivitySnapshot(snapshot) {
    const dataByDate = new Map();
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        dataByDate.set(docSnap.id, {
            ticketsData: deserializeProductivityAgentMap(data.ticketsData),
            callsData: deserializeProductivityAgentMap(data.callsData)
        });
    });
    return dataByDate;
}

function getSnapshotSize(snapshot, dataByDate) {
    return Number.isFinite(snapshot?.size) ? snapshot.size : dataByDate.size;
}

function requireFirestoreAdapter(firestore) {
    const required = ['collection', 'doc', 'setDoc', 'deleteDoc', 'getDocs', 'onSnapshot'];
    const missing = required.filter(name => typeof firestore?.[name] !== 'function');
    if (missing.length > 0) {
        throw new Error(`Productivity persistence requires Firestore adapter functions: ${missing.join(', ')}`);
    }
}

export function createProductivityFirestoreStore({
    db,
    firestore,
    now = () => new Date().toISOString(),
    collectionName = DEFAULT_PRODUCTIVITY_COLLECTION
}) {
    requireFirestoreAdapter(firestore);

    return {
        async saveDate(dateKey, entry) {
            const ref = firestore.doc(db, collectionName, dateKey);
            await firestore.setDoc(ref, buildProductivityDateDocument(entry, { now }));
        },

        async deleteDate(dateKey) {
            const ref = firestore.doc(db, collectionName, dateKey);
            await firestore.deleteDoc(ref);
        },

        async loadAll() {
            const snapshot = await firestore.getDocs(firestore.collection(db, collectionName));
            const dataByDate = hydrateProductivitySnapshot(snapshot);
            return {
                dataByDate,
                size: getSnapshotSize(snapshot, dataByDate),
                snapshot
            };
        },

        subscribe({ onData = () => {}, onError = () => {} } = {}) {
            return firestore.onSnapshot(
                firestore.collection(db, collectionName),
                snapshot => {
                    const dataByDate = hydrateProductivitySnapshot(snapshot);
                    onData({
                        dataByDate,
                        size: getSnapshotSize(snapshot, dataByDate),
                        snapshot
                    });
                },
                onError
            );
        }
    };
}
