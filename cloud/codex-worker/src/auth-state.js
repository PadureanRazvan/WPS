import { mkdtemp, chmod, writeFile, readFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const MAX_AUTH_BYTES = 128_000;
const SECRET_RESOURCE = /^projects\/[A-Za-z0-9_-]+\/secrets\/sherpa-codex-auth$/;
function fault(reason) {
  return Object.assign(new Error('Sherpa AI authentication unavailable.'), { reason, code: 'failed-precondition' });
}

function validateAuth(bytes) {
  if (!bytes?.length || bytes.length > MAX_AUTH_BYTES) throw fault('AI_AUTH_INVALID');
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw fault('AI_AUTH_INVALID'); }
  const hasChatGptMode = value?.auth_mode === 'chatgpt';
  const hasApiKey = typeof value?.OPENAI_API_KEY === 'string' && value.OPENAI_API_KEY.trim().length > 0;
  const hasTokenBundle = ['access_token', 'refresh_token', 'id_token', 'account_id']
    .every(key => typeof value?.tokens?.[key] === 'string' && value.tokens[key].trim().length > 0);
  if (!hasChatGptMode || hasApiKey || !hasTokenBundle) throw fault('AI_AUTH_INVALID');
}

/** Never reads the operator's CODEX_HOME; only the dedicated managed secret. */
export function createAuthStateRunner({ secretClient, secretName, tempRoot = tmpdir() } = {}) {
  if (!secretClient?.accessSecretVersion || !secretClient?.addSecretVersion || !SECRET_RESOURCE.test(secretName || '')) {
    throw new TypeError('A dedicated Sherpa Codex authentication secret is required.');
  }
  return {
    async run({ lease, signal, execute }) {
      if (!lease?.assertHeld || !lease?.quarantine || !lease?.markAuthInUse || !lease?.markAuthSettled || typeof execute !== 'function') throw new TypeError('Invalid authentication transaction.');
      let directory;
      let original;
      let updated;
      let result;
      let failure;
      try {
        await lease.assertHeld();
        let version;
        try {
          [version] = await secretClient.accessSecretVersion({ name: `${secretName}/versions/latest` }, { timeout: 10_000 });
          original = Buffer.from(version?.payload?.data || []);
        } catch { throw fault('AI_AUTH_INVALID'); }
        validateAuth(original);
        await lease.assertHeld();
        if (signal?.aborted) throw signal.reason || fault('AI_UNAVAILABLE');
        directory = await mkdtemp(join(tempRoot, 'sherpa-codex-'));
        await chmod(directory, 0o700);
        const authFile = join(directory, 'auth.json');
        await writeFile(authFile, original, { mode: 0o600, flag: 'wx' });
        // Durable marker makes a crash/lease loss fail closed even if quarantine cannot be written.
        await lease.markAuthInUse();
        try { result = await execute(directory); } catch (error) { failure = error; }

        // Codex can rotate credentials even when the model request fails or is cancelled.
        try {
          await lease.assertHeld();
          const stat = await lstat(authFile);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_AUTH_BYTES) throw fault('AI_AUTH_INVALID');
          updated = await readFile(authFile);
          validateAuth(updated);
          const changed = original.length !== updated.length || !timingSafeEqual(original, updated);
          if (changed) {
            await lease.assertHeld();
            const [saved] = await secretClient.addSecretVersion({ parent: secretName, payload: { data: updated } }, { timeout: 10_000 });
            if (!saved?.name?.startsWith(`${secretName}/versions/`)) throw fault('AI_AUTH_PERSIST_FAILED');
            await lease.assertHeld();
          }
          if (failure?.authStateUncertain === true) {
            // A killed child may have rotated the remote token before writing
            // auth.json. Preserve any observed update, but never declare the
            // surviving file authoritative after an unclean termination.
            await lease.quarantine();
            failure = fault('AI_AUTH_RECOVERY_REQUIRED');
          } else {
            await lease.markAuthSettled();
          }
        } catch (error) {
          if (lease.signal?.aborted || error?.reason === 'AI_LEASE_LOST') {
            failure = fault('AI_LEASE_LOST');
          } else {
            // Do not allow another invocation to reuse credentials that may be stale.
            try { await lease.quarantine(); } catch { /* Reply remains fail-closed. */ }
            failure = fault('AI_AUTH_PERSIST_FAILED');
          }
        }
        if (failure) throw failure;
        return result;
      } finally {
        original?.fill(0);
        updated?.fill(0);
        if (directory) await rm(directory, { recursive: true, force: true });
      }
    }
  };
}
