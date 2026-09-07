// Merge only the fields/cells the user changed, inside an optimistic Firestore transaction.
import { getAgentDaysForMonth, getAgentNotesForMonth } from './config.js';
function timestamp(value) {
    if (value instanceof Date || typeof value?.getTime === 'function') return value.getTime();
    if (typeof value?.toMillis === 'function') return value.toMillis();
    return null;
}

export function equalStoredValues(left, right) {
    if (left === right) return true;
    if (left == null || right == null) return false;
    const leftTime = timestamp(left), rightTime = timestamp(right);
    if (leftTime !== null || rightTime !== null) return leftTime === rightTime;
    if (typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length
        && keys.every(key => Object.hasOwn(right, key) && equalStoredValues(left[key], right[key]));
}

function conflict() {
    const error = new Error('Data changed since this edit was prepared. Refresh and try again.');
    error.code = 'data-conflict';
    return error;
}

function getField(value, path) {
    return path.split('.').reduce((result, key) => result?.[key], value);
}

function assertUnchanged(before, current, desired) {
    if (!equalStoredValues(before, current) && !equalStoredValues(current, desired)) throw conflict();
}

export function mergeAgentUpdate(baseline, current, updateData) {
    if (!baseline || !current) throw conflict();
    const merged = {};
    for (const [path, desired] of Object.entries(updateData)) {
        const before = getField(baseline, path), latest = getField(current, path);
        if (/^monthlyDays\.\d{4}-\d{2}$/.test(path)) {
            if (!Array.isArray(desired) || desired.length > 31) throw new TypeError('Invalid month schedule.');
            const monthKey = path.split('.')[1];
            const beforeDays = before || getAgentDaysForMonth(baseline, monthKey);
            const next = [...(latest || getAgentDaysForMonth(current, monthKey))];
            while (next.length < 31) next.push('');
            for (let day = 0; day < 31; day++) {
                const oldValue = beforeDays[day] || '', newValue = desired[day] || '';
                if (oldValue === newValue) continue;
                assertUnchanged(oldValue, next[day] || '', newValue);
                next[day] = newValue;
            }
            if (!equalStoredValues(next, latest)) merged[path] = next;
        } else if (/^monthlyNotes\.\d{4}-\d{2}$/.test(path)) {
            const monthKey = path.split('.')[1];
            const beforeNotes = before || getAgentNotesForMonth(baseline, monthKey);
            const latestNotes = latest || getAgentNotesForMonth(current, monthKey);
            const next = { ...latestNotes };
            for (const day of new Set([...Object.keys(beforeNotes), ...Object.keys(desired || {})])) {
                if (equalStoredValues(beforeNotes[day], desired?.[day])) continue;
                assertUnchanged(beforeNotes[day], latestNotes[day], desired?.[day]);
                if (desired?.[day] === undefined) delete next[day];
                else next[day] = desired[day];
            }
            if (!equalStoredValues(next, latest)) merged[path] = next;
        } else {
            assertUnchanged(before, latest, desired);
            if (!equalStoredValues(latest, desired)) merged[path] = desired;
        }
    }
    return merged;
}

export function createAgentFirestoreStore({ db, firestore }) {
    return {
        async updateMany(updates, baselines, { creates = [], deletes = [], strict = false } = {}) {
            if (!updates.length && !creates.length && !deletes.length) return;
            if (updates.length + creates.length + deletes.length > 400) throw new Error('Select at most 400 agents per edit.');
            const byId = new Map(baselines.map(agent => [agent.id, agent]));
            if (new Set(updates.map(update => update.agentId)).size !== updates.length) {
                throw new Error('Agent updates must be grouped before saving.');
            }
            if (deletes.some(id => updates.some(update => update.agentId === id))) throw new Error('Cannot edit and delete the same agent.');
            const created = creates.map(data => ({ ref: firestore.doc(firestore.collection(db, 'agents')), data }));
            return firestore.runTransaction(db, async transaction => {
                // Every read precedes every write; the entire edit either commits or rejects.
                const reads = await Promise.all(updates.map(async update => {
                    const ref = firestore.doc(db, 'agents', update.agentId);
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists()) throw conflict();
                    if (strict) {
                        const { id, ...expected } = byId.get(update.agentId) || {};
                        const current = Object.fromEntries(Object.entries(snapshot.data()).filter(([key]) => key !== 'id'));
                        if (!equalStoredValues(expected, current)) throw conflict();
                    }
                    return { ref, data: mergeAgentUpdate(byId.get(update.agentId), snapshot.data(), update.updateData) };
                }));
                const removals = await Promise.all(deletes.map(async id => {
                    const ref = firestore.doc(db, 'agents', id);
                    const snapshot = await transaction.get(ref);
                    const { id: _id, ...expected } = byId.get(id) || {};
                    const current = snapshot.exists() ? snapshot.data() : null;
                    if (!current || !equalStoredValues(expected, Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'id')))) throw conflict();
                    return ref;
                }));
                for (const { ref } of created) {
                    if ((await transaction.get(ref)).exists()) throw conflict();
                }
                reads.forEach(({ ref, data }) => {
                    if (Object.keys(data).length) transaction.update(ref, data);
                });
                removals.forEach(ref => transaction.delete(ref));
                created.forEach(({ ref, data }) => transaction.set(ref, data));
            });
        },
        async deleteAgent(agentId, baseline) {
            if (!baseline || baseline.id !== agentId) throw conflict();
            return this.updateMany([], [baseline], { deletes: [agentId] });
        }
    };
}
