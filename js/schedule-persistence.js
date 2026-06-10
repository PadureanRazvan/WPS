// js/schedule-persistence.js
//
// Schedule ("Orar") persistence — Phase 2.
//
// PURE serialization helpers plus an injectable Firestore store that saves one
// schedule document per month. Mirrors the shape and adapter-injection style of
// ./productivity-persistence.js so the two modules read the same way and can be
// unit-tested without a browser or a live Firestore.
//
// Firestore layout:
//   collection: "schedules"
//   doc id:     month key "YYYY-MM"
//   doc shape:  { month, rows: [ stored row, ... ], updatedAt }
//
// A "stored row" is a flat, display-ready shift record:
//   { agentUsername, agentName, date, startTime, endTime,
//     breakMinutes, workedMinutes, status, notes }
// Only clean rows are ever stored (status "ok" or "dayoff"); error rows are
// filtered out by the caller (schedule.js) before saving.

const DEFAULT_SCHEDULE_COLLECTION = 'schedules';

function asString(value) {
    return value === null || value === undefined ? '' : String(value);
}

function asFiniteNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

// Coerce an arbitrary row into the minimal, JSON-safe stored shape. Unknown
// fields are dropped so persisted documents stay small and predictable.
export function normalizeStoredScheduleRow(row) {
    const worked = row?.workedMinutes;
    return {
        agentUsername: asString(row?.agentUsername).trim(),
        agentName: asString(row?.agentName).trim(),
        date: asString(row?.date).trim(),
        startTime: asString(row?.startTime).trim(),
        endTime: asString(row?.endTime).trim(),
        breakMinutes: asFiniteNumber(row?.breakMinutes, 0),
        workedMinutes: worked === null || worked === undefined ? 0 : asFiniteNumber(worked, 0),
        status: asString(row?.status).trim() || 'ok',
        notes: asString(row?.notes)
    };
}

// Build the per-month Firestore document from a list of (clean) rows.
export function buildScheduleMonthDocument(monthKey, rows, { now = () => new Date().toISOString() } = {}) {
    const list = Array.isArray(rows) ? rows : [];
    return {
        month: asString(monthKey).trim(),
        rows: list.map(normalizeStoredScheduleRow),
        updatedAt: now()
    };
}

// Turn a Firestore query snapshot into a Map(monthKey -> { month, rows, updatedAt }).
export function hydrateScheduleSnapshot(snapshot) {
    const dataByMonth = new Map();
    if (!snapshot || typeof snapshot.forEach !== 'function') return dataByMonth;

    snapshot.forEach(docSnap => {
        const data = (typeof docSnap.data === 'function' ? docSnap.data() : null) || {};
        const rows = Array.isArray(data.rows) ? data.rows.map(normalizeStoredScheduleRow) : [];
        dataByMonth.set(docSnap.id, {
            month: asString(data.month).trim() || docSnap.id,
            rows,
            updatedAt: data.updatedAt || null
        });
    });

    return dataByMonth;
}

function getSnapshotSize(snapshot, dataByMonth) {
    return Number.isFinite(snapshot?.size) ? snapshot.size : dataByMonth.size;
}

function requireFirestoreAdapter(firestore) {
    const required = ['collection', 'doc', 'setDoc', 'deleteDoc', 'getDocs', 'onSnapshot'];
    const missing = required.filter(name => typeof firestore?.[name] !== 'function');
    if (missing.length > 0) {
        throw new Error(`Schedule persistence requires Firestore adapter functions: ${missing.join(', ')}`);
    }
}

export function createScheduleFirestoreStore({
    db,
    firestore,
    now = () => new Date().toISOString(),
    collectionName = DEFAULT_SCHEDULE_COLLECTION
}) {
    requireFirestoreAdapter(firestore);

    return {
        async saveMonth(monthKey, rows) {
            const ref = firestore.doc(db, collectionName, monthKey);
            await firestore.setDoc(ref, buildScheduleMonthDocument(monthKey, rows, { now }));
        },

        async deleteMonth(monthKey) {
            const ref = firestore.doc(db, collectionName, monthKey);
            await firestore.deleteDoc(ref);
        },

        async loadAll() {
            const snapshot = await firestore.getDocs(firestore.collection(db, collectionName));
            const dataByMonth = hydrateScheduleSnapshot(snapshot);
            return {
                dataByMonth,
                size: getSnapshotSize(snapshot, dataByMonth),
                snapshot
            };
        },

        subscribe({ onData = () => {}, onError = () => {} } = {}) {
            return firestore.onSnapshot(
                firestore.collection(db, collectionName),
                snapshot => {
                    const dataByMonth = hydrateScheduleSnapshot(snapshot);
                    onData({
                        dataByMonth,
                        size: getSnapshotSize(snapshot, dataByMonth),
                        snapshot
                    });
                },
                onError
            );
        }
    };
}
