import { randomUUID } from 'node:crypto';

function fault(reason, code = 'unavailable') {
  return Object.assign(new Error('Sherpa AI runtime unavailable.'), { reason, code });
}

/** A database lease is required even with Cloud Run max-instances=1. */
export function createFirestoreLease({
  db,
  documentPath = '_server_ai_runtime/codex-account',
  leaseMs = 45_000,
  heartbeatMs = 10_000,
  maxHoldMs = 300_000,
  now = Date.now,
  newOwner = randomUUID,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) {
  if (!db?.runTransaction || !db?.doc || leaseMs <= heartbeatMs * 2 || heartbeatMs < 1 || maxHoldMs < leaseMs) {
    throw new TypeError('Invalid lease configuration.');
  }
  const ref = db.doc(documentPath);

  return {
    async acquire() {
      const owner = newOwner();
      const deadline = now() + maxHoldMs;
      const controller = new AbortController();
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        const current = snapshot.exists ? snapshot.data() : {};
        if (current.recoveryRequired === true) throw fault('AI_AUTH_RECOVERY_REQUIRED', 'failed-precondition');
        if (current.owner && Number(current.expiresAt) > now()) throw fault('AI_BUSY', 'resource-exhausted');
        if (current.authInUse === true) throw fault('AI_AUTH_RECOVERY_REQUIRED', 'failed-precondition');
        tx.set(ref, { owner, expiresAt: Math.min(now() + leaseMs, deadline), deadline, recoveryRequired: false, authInUse: false });
      });

      let stopped = false;
      let renewal;
      const lose = () => {
        if (!controller.signal.aborted) controller.abort(fault('AI_LEASE_LOST'));
      };
      async function check(renew) {
        if (stopped || controller.signal.aborted) throw fault('AI_LEASE_LOST');
        try {
          await db.runTransaction(async tx => {
            const snapshot = await tx.get(ref);
            const current = snapshot.exists ? snapshot.data() : {};
            const time = now();
            if (current.owner !== owner || Number(current.expiresAt) <= time || time >= deadline || current.recoveryRequired) {
              throw fault('AI_LEASE_LOST');
            }
            if (renew) tx.update(ref, { expiresAt: Math.min(time + leaseMs, deadline) });
          });
        } catch {
          lose();
          throw fault('AI_LEASE_LOST');
        }
      }
      const timer = setIntervalFn(() => {
        if (stopped || renewal || controller.signal.aborted) return;
        renewal = check(true).catch(lose).finally(() => { renewal = undefined; });
      }, heartbeatMs);
      timer?.unref?.();

      return {
        signal: controller.signal,
        assertHeld: () => check(false),
        async markAuthInUse() {
          await check(false);
          await db.runTransaction(async tx => {
            const snapshot = await tx.get(ref);
            const current = snapshot.exists ? snapshot.data() : {};
            if (current.owner !== owner || current.expiresAt <= now() || current.recoveryRequired) throw fault('AI_LEASE_LOST');
            tx.update(ref, { authInUse: true });
          });
        },
        async markAuthSettled() {
          await check(false);
          await db.runTransaction(async tx => {
            const snapshot = await tx.get(ref);
            const current = snapshot.exists ? snapshot.data() : {};
            if (current.owner !== owner || current.expiresAt <= now() || current.recoveryRequired) throw fault('AI_LEASE_LOST');
            tx.update(ref, { authInUse: false });
          });
        },
        async quarantine() {
          await db.runTransaction(async tx => {
            const snapshot = await tx.get(ref);
            if (!snapshot.exists || snapshot.data().owner !== owner) throw fault('AI_LEASE_LOST');
            tx.update(ref, { recoveryRequired: true, failureReason: 'AI_AUTH_PERSIST_FAILED' });
          });
          lose();
        },
        async release() {
          if (stopped) return;
          stopped = true;
          clearIntervalFn(timer);
          if (renewal) await renewal;
          await db.runTransaction(async tx => {
            const snapshot = await tx.get(ref);
            if (!snapshot.exists || snapshot.data().owner !== owner) return;
            if (snapshot.data().recoveryRequired || snapshot.data().authInUse) {
              tx.set(ref, { recoveryRequired: true, failureReason: 'AI_AUTH_PERSIST_FAILED', expiresAt: 0 });
            } else {
              tx.delete(ref);
            }
          });
        }
      };
    }
  };
}
