import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { CODEX_OUTPUT_SCHEMA, buildCodexInstructions, buildCodexPrompt, parseCodexOutput, sanitizeChatRequest } from './protocol.js';

const require = createRequire(import.meta.url);
export const CODEX_VERSION = '0.163.0';
// Generated from `codex debug models --bundled` in 0.163.0. Preserve Luna's
// bundled capabilities, changing only tool_mode, multi_agent_version,
// experimental_supported_tools, supports_search_tool and apply_patch_tool_type.
// Model metadata otherwise forces Code Mode, subagents and editing tools back
// on, regardless of feature flags. The baseline hash covers JSON.stringify of
// the original model object; tests verify all other metadata stays identical.
// In rust-v0.163.0, model-provider/src/provider.rs:388-418 selects this static
// catalog before the OpenAI endpoint for every auth mode; models-manager/src/
// manager.rs:804-813 ignores refresh strategy, including ChatGPT auth refresh.
export const CODEX_CATALOG_BASELINE_SHA256 = '39308d01c0f1b460d931dc223a308a90ca9946702713db1d0f5418d63d3ef7ae';
const MODEL_CATALOG_FILE = fileURLToPath(new URL('./model-catalog.json', import.meta.url));
const MAX_STDOUT_BYTES = 2_000_000;
const MAX_STDERR_BYTES = 64_000;
const SAFE_MESSAGES = {
  AI_INVALID_REQUEST: 'The AI request is invalid.',
  AI_RUNTIME_UNAVAILABLE: 'The AI runtime is unavailable.',
  AI_UPSTREAM_ERROR: 'The AI request could not be completed.',
  AI_AUTH_REQUIRED: 'The AI account needs to sign in again.',
  AI_RATE_LIMITED: 'The AI account usage limit was reached. Try again later.',
  AI_TIMEOUT: 'The AI request timed out.',
  AI_ABORTED: 'The AI request was cancelled.',
  AI_OUTPUT_TOO_LARGE: 'The AI response exceeded the allowed size.',
  AI_UNEXPECTED_TOOL: 'The AI runtime attempted an unsupported operation.'
};

export class CodexRunnerError extends Error {
  constructor(code) {
    super(SAFE_MESSAGES[code] || SAFE_MESSAGES.AI_UPSTREAM_ERROR);
    this.name = 'CodexRunnerError';
    this.code = Object.hasOwn(SAFE_MESSAGES, code) ? code : 'AI_UPSTREAM_ERROR';
    this.reason = ({
      AI_INVALID_REQUEST: 'INVALID_REQUEST',
      AI_AUTH_REQUIRED: 'AI_AUTH_INVALID',
      AI_RATE_LIMITED: 'AI_RATE_LIMITED',
      AI_TIMEOUT: 'AI_TIMEOUT',
      AI_ABORTED: 'AI_CANCELLED'
    })[this.code] || 'AI_UNAVAILABLE';
  }
}

// --strict-config makes renamed or unsupported settings fail closed. The pinned
// runtime integration test also inspects input.additional_tools, not just tools.
export const DISABLED_CODEX_FEATURES = Object.freeze([
  'shell_tool', 'apps', 'plugins', 'remote_plugin', 'memories', 'multi_agent',
  'image_generation', 'sleep_tool', 'tool_suggest', 'view_image', 'skill_search',
  'hooks', 'browser_use', 'computer_use', 'goals', 'shell_snapshot',
  'skill_mcp_dependency_install', 'request_permissions_tool'
]);

export function buildCodexArguments({ workspace, instructionsFile, schemaFile }) {
  const args = [
    'exec', '--ignore-user-config', '--ignore-rules', '--strict-config',
    '--skip-git-repo-check', '--ephemeral', '--json', '--color', 'never',
    '--model', 'gpt-6-luna', '--sandbox', 'read-only', '--cd', workspace,
    '--output-schema', schemaFile
  ];
  for (const feature of DISABLED_CODEX_FEATURES) args.push('--disable', feature);
  for (const override of [
    'model_provider="openai"', 'model_reasoning_effort="max"', 'approval_policy="never"',
    `model_catalog_json=${JSON.stringify(MODEL_CATALOG_FILE)}`,
    'cli_auth_credentials_store="file"',
    'web_search="disabled"', 'project_doc_max_bytes=0', 'project_doc_fallback_filenames=[]',
    'features.code_mode.enabled=false',
    'features.multi_agent_v2.disable_native_tools=true',
    'tools.experimental_request_user_input.enabled=false', 'tools.update_plan.enabled=false',
    'skills.bundled.enabled=false', 'skills.include_instructions=false',
    'memories.generate_memories=false', 'memories.use_memories=false',
    'history.persistence="none"', 'mcp_servers={}', 'developer_instructions=""',
    `model_instructions_file=${JSON.stringify(instructionsFile)}`,
    `log_dir=${JSON.stringify(join(workspace, 'logs'))}`
  ]) args.push('-c', override);
  args.push('-');
  return args;
}

export async function resolveCodexBinary() {
  try {
    const packageFile = require.resolve('@openai/codex/package.json');
    const metadata = JSON.parse(await readFile(packageFile, 'utf8'));
    if (metadata.version !== CODEX_VERSION) throw new Error('version mismatch');
    const architectures = {
      'linux-x64': ['@openai/codex-linux-x64', 'x86_64-unknown-linux-musl'],
      'linux-arm64': ['@openai/codex-linux-arm64', 'aarch64-unknown-linux-musl'],
      'darwin-x64': ['@openai/codex-darwin-x64', 'x86_64-apple-darwin'],
      'darwin-arm64': ['@openai/codex-darwin-arm64', 'aarch64-apple-darwin'],
      'win32-x64': ['@openai/codex-win32-x64', 'x86_64-pc-windows-msvc'],
      'win32-arm64': ['@openai/codex-win32-arm64', 'aarch64-pc-windows-msvc']
    };
    const [platformPackage, target] = architectures[`${process.platform}-${process.arch}`] || [];
    if (!platformPackage) throw new Error('unsupported platform');
    const platformRoot = dirname(require.resolve(`${platformPackage}/package.json`));
    return join(platformRoot, 'vendor', target, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
  } catch {
    throw new CodexRunnerError('AI_RUNTIME_UNAVAILABLE');
  }
}

function childEnvironment(workspace, codexHome) {
  const env = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return Object.assign(env, {
    HOME: workspace, USERPROFILE: workspace, TMPDIR: workspace, TMP: workspace,
    TEMP: workspace, CODEX_HOME: codexHome, LANG: 'C.UTF-8', NO_COLOR: '1'
  });
}

function classifyFailure(message) {
  const text = typeof message === 'string' ? message : '';
  if (/\b429\b|rate.?limit|usage.?limit|quota|credits/i.test(text)) return new CodexRunnerError('AI_RATE_LIMITED');
  if (/\b401\b|unauthori[sz]ed|refresh.token|not.logged.in|sign.in|authentication/i.test(text)) return new CodexRunnerError('AI_AUTH_REQUIRED');
  return new CodexRunnerError('AI_UPSTREAM_ERROR');
}

function markAuthUncertain(error) {
  // A killed child may have rotated a refresh token without saving auth.json.
  // This is internal coordination with auth-state, never response/log content.
  Object.defineProperty(error, 'authStateUncertain', { value: true, configurable: true });
}

export function createCodexRunner({ codexPath, timeoutMs = 240_000, spawnImpl = spawn } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600_000) throw new TypeError('Invalid AI timeout.');
  if (codexPath !== undefined && (typeof codexPath !== 'string' || !isAbsolute(codexPath))) throw new TypeError('Codex path must be absolute.');

  return async function runCodex({ chatRequest, codexHome, signal } = {}) {
    if (signal?.aborted) throw new CodexRunnerError('AI_ABORTED');
    if (typeof codexHome !== 'string' || !isAbsolute(codexHome)) throw new CodexRunnerError('AI_RUNTIME_UNAVAILABLE');
    let request;
    try { request = sanitizeChatRequest(chatRequest); } catch { throw new CodexRunnerError('AI_INVALID_REQUEST'); }
    // Auth-state creates a fresh directory for each request. Do not accept an
    // operator's normal Codex home: AGENTS.md there is loaded independently of
    // project_doc_max_bytes and --ignore-user-config in the pinned CLI.
    try {
      const entries = await readdir(codexHome, { withFileTypes: true });
      if (entries.some(entry => entry.name !== 'auth.json' || !entry.isFile() || entry.isSymbolicLink())) throw new Error('not an isolated auth directory');
    } catch { throw new CodexRunnerError('AI_RUNTIME_UNAVAILABLE'); }
    const binary = codexPath || await resolveCodexBinary();
    const runRoot = await mkdtemp(join(tmpdir(), 'sherpa-codex-run-'));
    const workspace = join(runRoot, 'work');
    const instructionsFile = join(runRoot, 'instructions.md');
    const schemaFile = join(runRoot, 'output.schema.json');
    try {
      await mkdir(workspace, { mode: 0o700 });
      await Promise.all([
        writeFile(instructionsFile, buildCodexInstructions(request.language), { mode: 0o600 }),
        writeFile(schemaFile, JSON.stringify(CODEX_OUTPUT_SCHEMA), { mode: 0o600 })
      ]);
      if (signal?.aborted) throw new CodexRunnerError('AI_ABORTED');
      const text = await new Promise((resolveResult, rejectResult) => {
        let child;
        let failure;
        let finalText;
        let turnComplete = false;
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let stderrTail = '';
        let pending = '';
        let closed = false;
        let terminationRequested = false;
        const decoder = new StringDecoder('utf8');
        const stop = error => {
          failure ||= error;
          if (closed || terminationRequested) return;
          terminationRequested = true;
          if (spawnImpl === spawn && process.platform !== 'win32' && Number.isInteger(child?.pid)) {
            try { process.kill(-child.pid, 'SIGKILL'); markAuthUncertain(failure); return; } catch { /* Child may already have exited. */ }
          }
          try { if (child?.kill('SIGKILL')) markAuthUncertain(failure); } catch { /* The close/error event settles the request. */ }
        };
        const onAbort = () => stop(new CodexRunnerError('AI_ABORTED'));
        const consumeLine = line => {
          if (!line.trim()) return;
          let event;
          try { event = JSON.parse(line); } catch { stop(new CodexRunnerError('AI_UPSTREAM_ERROR')); return; }
          if (event.type === 'turn.failed' || event.type === 'error') {
            // Let normal terminal failures finish their auth writeback. A stuck
            // child still reaches the timeout and is quarantined after killing.
            failure ||= classifyFailure(event.error?.message || event.message);
          } else if (event.type === 'turn.completed') {
            turnComplete = true;
          } else if (event.type?.startsWith('item.')) {
            const item = event.item;
            if (item?.type === 'error') { failure ||= classifyFailure(item.message); return; }
            if (!['agent_message', 'reasoning'].includes(item?.type)) {
              stop(new CodexRunnerError('AI_UNEXPECTED_TOOL'));
            } else if (event.type === 'item.completed' && item.type === 'agent_message') {
              finalText = item.text;
            }
          }
        };
        try {
          child = spawnImpl(binary, buildCodexArguments({ workspace, instructionsFile, schemaFile }), {
            cwd: workspace, env: childEnvironment(workspace, resolve(codexHome)),
            stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true,
            detached: process.platform !== 'win32'
          });
        } catch { rejectResult(new CodexRunnerError('AI_RUNTIME_UNAVAILABLE')); return; }
        const timer = setTimeout(() => stop(new CodexRunnerError('AI_TIMEOUT')), timeoutMs);
        timer.unref?.();
        signal?.addEventListener('abort', onAbort, { once: true });
        child.stdout.on('data', chunk => {
          stdoutBytes += chunk.length;
          if (stdoutBytes > MAX_STDOUT_BYTES) { stop(new CodexRunnerError('AI_OUTPUT_TOO_LARGE')); return; }
          pending += decoder.write(chunk);
          let newline;
          while ((newline = pending.indexOf('\n')) >= 0) {
            consumeLine(pending.slice(0, newline));
            pending = pending.slice(newline + 1);
          }
        });
        child.stderr.on('data', chunk => {
          stderrBytes += chunk.length;
          if (stderrBytes > MAX_STDERR_BYTES) { stop(new CodexRunnerError('AI_OUTPUT_TOO_LARGE')); return; }
          stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4096);
        });
        child.stdin.on('error', () => stop(new CodexRunnerError('AI_UPSTREAM_ERROR')));
        child.on('error', () => { failure ||= new CodexRunnerError('AI_RUNTIME_UNAVAILABLE'); });
        child.on('close', (code, terminationSignal) => {
          closed = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          if (!failure) consumeLine(pending + decoder.end());
          if (terminationSignal) {
            failure ||= new CodexRunnerError('AI_UPSTREAM_ERROR');
            markAuthUncertain(failure);
          }
          if (failure) rejectResult(failure);
          else if (code !== 0) rejectResult(classifyFailure(stderrTail));
          else if (!turnComplete || typeof finalText !== 'string') rejectResult(new CodexRunnerError('AI_UPSTREAM_ERROR'));
          else resolveResult(finalText);
        });
        child.stdin.end(buildCodexPrompt(request));
        if (signal?.aborted) onAbort();
      });
      return parseCodexOutput(text);
    } finally {
      // Delete only the private directory created by mkdtemp, never CODEX_HOME.
      if (dirname(resolve(runRoot)) === resolve(tmpdir()) && basename(runRoot).startsWith('sherpa-codex-run-')) {
        await rm(runRoot, { recursive: true, force: true, maxRetries: 3 });
      }
    }
  };
}
