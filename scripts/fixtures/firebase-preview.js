// Fixture SDK: authentication is simulated; no API call can leave this server.
const state = window.sherpaPreview;
const previewUser = { uid: 'offline-preview', displayName: 'Sherpa Preview', email: 'preview@fspglobal.com', emailVerified: true };
const fixtureAuth = { currentUser: new URLSearchParams(location.search).get('session') === 'ready' ? previewUser : null };
export const initializeApp = config => ({ options: config });
export const getFirestore = () => ({});
export const getFunctions = () => ({});
export const initializeAppCheck = () => ({});
export class ReCaptchaEnterpriseProvider {}
export const getAuth = () => fixtureAuth;
export class GoogleAuthProvider {}
export function onAuthStateChanged(_auth, callback) {
    state.signInReadyAt = performance.now();
    state.authListeners.add(callback);
    queueMicrotask(() => callback(fixtureAuth.currentUser));
    return () => state.authListeners.delete(callback);
}
export async function signInWithPopup() {
    state.events.push({ type: 'popup', at: performance.now() });
    await new Promise(resolve => setTimeout(resolve, 1200));
    if (state.scenario !== 'success') {
        const code = state.scenario === 'network' ? 'auth/network-request-failed' : 'auth/popup-closed-by-user';
        throw Object.assign(new Error(code), { code });
    }
    fixtureAuth.currentUser = previewUser;
    state.authListeners.forEach(callback => callback(fixtureAuth.currentUser));
    return { user: fixtureAuth.currentUser };
}
export async function signOut() {
    fixtureAuth.currentUser = null;
    state.authListeners.forEach(callback => callback(null));
}
export const collection = (_db, path) => ({ path });
export const doc = (_db, path, id) => ({ path, id });
export const query = target => target;
export const where = () => ({}), orderBy = () => ({}), limit = () => ({});
const emptySnapshot = () => ({ docs: [], size: 0, empty: true, forEach() {} });
// Opt-in synthetic data for month navigation, filtering and real CSV downloads.
// This adapter never reads production data or permits business-data writes.
function previewSnapshot(target) {
    if (target.path !== 'agents' || new URLSearchParams(location.search).get('planner-fixture') !== '1') return emptySnapshot();
    const now = new Date(), monthlyDays = {};
    for (const offset of [-1, 0, 1]) {
        const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
        monthlyDays[key] = Array.from({ length: new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate() }, (_, day) =>
            [0, 6].includes(new Date(start.getFullYear(), start.getMonth(), day + 1).getDay()) ? '' : '8RO');
    }
    const data = { fullName: 'Synthetic Planner Agent', username: 'fixture.agent', primaryTeam: 'RO',
        contractType: 'Full-time', contractHours: 8, monthlyDays, monthlyNotes: {}, isActive: true };
    const docs = [{ id: 'synthetic-planner-agent', data: () => structuredClone(data) }];
    return { docs, size: docs.length, empty: false, forEach: callback => docs.forEach(callback) };
}
export const getDocs = async () => emptySnapshot();
export const getDoc = async () => ({ exists: () => false });
export function onSnapshot(target, next) {
    let active = true;
    state.activeSubscriptions++;
    const deliver = () => { if (active) next(previewSnapshot(target)); };
    const timer = target.path === 'productivity' && state.snapshotDelay ? setTimeout(deliver, state.snapshotDelay) : null;
    if (!timer) queueMicrotask(deliver);
    return () => {
        if (active) state.activeSubscriptions--;
        active = false;
        if (timer) clearTimeout(timer);
    };
}
export class Timestamp {
    constructor(date = new Date()) { this.date = date; }
    toDate() { return this.date; }
    static fromDate(date) { return new Timestamp(date); }
    static now() { return new Timestamp(); }
}
export const serverTimestamp = () => new Timestamp();
export const addDoc = async target => {
    if (target.path === 'activity_logs') return { id: 'offline-log' };
    state.writes++;
    throw new Error('Offline preview does not save data');
};
export const setDoc = async () => { state.writes++; throw new Error('Offline preview does not save data'); };
export const deleteDoc = setDoc, updateDoc = setDoc, runTransaction = setDoc;
export const httpsCallable = () => async () => { throw new Error('Offline preview does not call AI'); };
