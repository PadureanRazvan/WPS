import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { CODEX_CATALOG_BASELINE_SHA256, createCodexRunner, resolveCodexBinary } from '../src/codex-runner.js';

const request = { language: 'en', contents: [{ role: 'user', parts: [{ text: 'PROMPT_SECRET: who is working?' }] }] };
const binary = resolve('fake-codex');
const line = value => `${JSON.stringify(value)}\n`;
const answer = text => line({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ parts: [{ text }] }) } });

function fakeSpawn(run) {
  const calls = [];
  const impl = (file, args, options) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', null)); return true; };
    let prompt = '';
    child.stdin.on('data', chunk => { prompt += chunk; });
    const call = { file, args, options, child, get prompt() { return prompt; } };
    calls.push(call);
    child.stdin.on('finish', () => {
      Promise.resolve().then(() => run(call)).catch(error => { call.testError = error; child.emit('error', error); child.emit('close', 1); });
    });
    return child;
  };
  return { calls, impl };
}

async function withHome(fn) {
  const home = await mkdtemp(join(tmpdir(), 'sherpa-runner-test-'));
  try { return await fn(home); } finally { await rm(home, { recursive: true, force: true }); }
}

test('runner supplies isolated no-host-tool configuration and cleans temporary prompts', async () => withHome(async home => {
  await writeFile(join(home, 'auth.json'), 'FAKE_AUTH_MARKER_NOT_READ_BY_FAKE_PROCESS');
  const previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'MUST_NOT_INHERIT';
  const mock = fakeSpawn(async call => {
    assert.equal(call.options.shell, false);
    assert.equal(call.options.windowsHide, true);
    assert.equal(call.options.env.CODEX_HOME, home);
    assert.equal(call.options.env.OPENAI_API_KEY, undefined);
    assert.equal(call.options.env.CODEX_API_KEY, undefined);
    assert.equal(call.options.env.CODEX_ACCESS_TOKEN, undefined);
    assert.doesNotMatch(JSON.stringify(call.args), /PROMPT_SECRET/);
    assert.match(call.prompt, /PROMPT_SECRET/);
    for (const flag of ['--ignore-user-config', '--ignore-rules', '--strict-config', '--ephemeral', '--skip-git-repo-check', '--json']) assert.ok(call.args.includes(flag));
    for (const value of ['model_reasoning_effort="max"', 'cli_auth_credentials_store="file"', 'features.code_mode.enabled=false', 'features.multi_agent_v2.disable_native_tools=true', 'tools.experimental_request_user_input.enabled=false', 'tools.update_plan.enabled=false', 'project_doc_max_bytes=0', 'web_search="disabled"', 'mcp_servers={}']) assert.ok(call.args.includes(value));
    assert.ok(call.args.some(value => value.startsWith('model_catalog_json=')));
    for (const feature of ['shell_tool', 'plugins', 'apps', 'multi_agent', 'memories', 'view_image']) assert.ok(call.args.some((value, index) => value === '--disable' && call.args[index + 1] === feature));
    const schema = JSON.parse(await readFile(call.args[call.args.indexOf('--output-schema') + 1], 'utf8'));
    assert.equal(schema.additionalProperties, false);
    const instructionSetting = call.args.find(value => value.startsWith('model_instructions_file='));
    const instructions = await readFile(JSON.parse(instructionSetting.slice(instructionSetting.indexOf('=') + 1)), 'utf8');
    assert.match(instructions, /Sherpa AI/);
    assert.match(instructions, /respond ONLY in English/);
    call.child.stdout.write(answer('There are four agents working.'));
    call.child.stdout.write(line({ type: 'turn.completed' }));
    call.child.emit('close', 0);
  });
  try {
    const result = await createCodexRunner({ codexPath: binary, spawnImpl: mock.impl })({ chatRequest: request, codexHome: home });
    assert.equal(result.candidates[0].content.parts[0].text, 'There are four agents working.');
    assert.equal(mock.calls[0].testError, undefined);
    await assert.rejects(access(dirname(mock.calls[0].options.cwd)));
    assert.equal(await readFile(join(home, 'auth.json'), 'utf8'), 'FAKE_AUTH_MARKER_NOT_READ_BY_FAKE_PROCESS');
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
}));

test('abort kills the child and cleans temporary files', async () => withHome(async home => {
  const controller = new AbortController();
  const mock = fakeSpawn(() => controller.abort());
  await assert.rejects(createCodexRunner({ codexPath: binary, spawnImpl: mock.impl })({ chatRequest: request, codexHome: home, signal: controller.signal }), { code: 'AI_ABORTED', reason: 'AI_CANCELLED', authStateUncertain: true });
  assert.equal(mock.calls[0].child.killed, true);
  await assert.rejects(access(dirname(mock.calls[0].options.cwd)));
}));

test('timeout kills a stalled request', async () => withHome(async home => {
  const mock = fakeSpawn(() => {});
  // Keep a real handle open: the production child does this; EventEmitter does not.
  const alive = setInterval(() => {}, 100);
  try { await assert.rejects(createCodexRunner({ codexPath: binary, timeoutMs: 20, spawnImpl: mock.impl })({ chatRequest: request, codexHome: home }), { code: 'AI_TIMEOUT', authStateUncertain: true }); }
  finally { clearInterval(alive); }
  assert.equal(mock.calls[0].child.killed, true);
  await assert.rejects(access(dirname(mock.calls[0].options.cwd)));
}));

test('host tool activity fails closed even when subprocess claims success', async () => withHome(async home => {
  const mock = fakeSpawn(call => {
    call.child.stdout.write(line({ type: 'item.started', item: { type: 'command_execution', command: 'HOST_SECRET' } }));
  });
  await assert.rejects(createCodexRunner({ codexPath: binary, spawnImpl: mock.impl })({ chatRequest: request, codexHome: home }), error => error.code === 'AI_UNEXPECTED_TOOL' && !error.message.includes('HOST_SECRET'));
  assert.equal(mock.calls[0].child.killed, true);
}));

test('provider errors never leak tokens, prompts or stderr', async () => withHome(async home => {
  const mock = fakeSpawn(call => {
    call.child.stderr.write('TOKEN_SECRET PRIVATE_PROMPT');
    call.child.stdout.write(line({ type: 'turn.failed', error: { message: '401 unauthorized TOKEN_SECRET PRIVATE_PROMPT' } }));
    call.child.emit('close', 1);
  });
  await assert.rejects(createCodexRunner({ codexPath: binary, spawnImpl: mock.impl })({ chatRequest: request, codexHome: home }), error => error.code === 'AI_AUTH_REQUIRED' && error.reason === 'AI_AUTH_INVALID' && error.authStateUncertain === undefined && !/TOKEN_SECRET|PRIVATE_PROMPT/.test(error.message));
  assert.equal(mock.calls[0].child.killed, false);
}));

test('routine rate-limit error followed by clean failure exit does not quarantine auth', async () => withHome(async home => {
  const mock = fakeSpawn(call => {
    call.child.stdout.write(line({ type: 'error', message: '429 usage limit reached' }));
    call.child.stdout.write(line({ type: 'turn.failed', error: { message: '429 usage limit reached' } }));
    call.child.emit('close', 1);
  });
  await assert.rejects(createCodexRunner({ codexPath: binary, spawnImpl: mock.impl })({ chatRequest: request, codexHome: home }), error => error.reason === 'AI_RATE_LIMITED' && error.authStateUncertain === undefined);
  assert.equal(mock.calls[0].child.killed, false);
}));

test('a failed turn that hangs before exit still times out and quarantines auth', async () => withHome(async home => {
  const mock = fakeSpawn(call => call.child.stdout.write(line({ type: 'turn.failed', error: { message: '429 usage limit reached' } })));
  const alive = setInterval(() => {}, 100);
  try {
    await assert.rejects(createCodexRunner({ codexPath: binary, spawnImpl: mock.impl, timeoutMs: 20 })({ chatRequest: request, codexHome: home }), error => error.reason === 'AI_RATE_LIMITED' && error.authStateUncertain === true);
  } finally { clearInterval(alive); }
  assert.equal(mock.calls[0].child.killed, true);
}));

test('abnormal signal exit marks credential state uncertain without exposing private details', async () => withHome(async home => {
  const mock = fakeSpawn(call => call.child.emit('close', null, 'SIGKILL'));
  await assert.rejects(createCodexRunner({ codexPath: binary, spawnImpl: mock.impl })({ chatRequest: request, codexHome: home }), error => {
    assert.equal(error.code, 'AI_UPSTREAM_ERROR');
    assert.equal(error.authStateUncertain, true);
    assert.equal(Object.keys(error).includes('authStateUncertain'), false);
    return true;
  });
}));

test('spawn failure does not mark untouched credentials uncertain', async () => withHome(async home => {
  const runner = createCodexRunner({ codexPath: binary, spawnImpl: () => { throw new Error('PRIVATE_PATH'); } });
  await assert.rejects(runner({ chatRequest: request, codexHome: home }), error => error.code === 'AI_RUNTIME_UNAVAILABLE' && error.authStateUncertain === undefined && !error.message.includes('PRIVATE_PATH'));
}));

test('output bounds kill verbose or malformed child processes', async () => withHome(async home => {
  const mock = fakeSpawn(call => call.child.stdout.write(Buffer.alloc(2_000_001, 'x')));
  await assert.rejects(createCodexRunner({ codexPath: binary, spawnImpl: mock.impl })({ chatRequest: request, codexHome: home }), { code: 'AI_OUTPUT_TOO_LARGE' });
  assert.equal(mock.calls[0].child.killed, true);
}));

test('valid JSON without a completed turn is not reported as success', async () => withHome(async home => {
  const mock = fakeSpawn(call => { call.child.stdout.write(answer('Incomplete')); call.child.emit('close', 0); });
  await assert.rejects(createCodexRunner({ codexPath: binary, spawnImpl: mock.impl })({ chatRequest: request, codexHome: home }), { code: 'AI_UPSTREAM_ERROR' });
}));

test('invalid inputs and pre-aborted requests do not spawn Codex', async () => withHome(async home => {
  const mock = fakeSpawn(() => {});
  const runner = createCodexRunner({ codexPath: binary, spawnImpl: mock.impl });
  await assert.rejects(runner({ chatRequest: { contents: [] }, codexHome: home }), { code: 'AI_INVALID_REQUEST' });
  await assert.rejects(runner({ chatRequest: request, codexHome: home, signal: AbortSignal.abort() }), error => error.code === 'AI_ABORTED' && error.authStateUncertain === undefined);
  assert.equal(mock.calls.length, 0);
}));

test('runner rejects any Codex home with instructions or configuration', async () => withHome(async home => {
  const mock = fakeSpawn(() => {});
  const runner = createCodexRunner({ codexPath: binary, spawnImpl: mock.impl });
  await writeFile(join(home, 'AGENTS.md'), 'SHERPA_HOST_INSTRUCTIONS_MUST_NOT_LOAD');
  await assert.rejects(runner({ chatRequest: request, codexHome: home }), { code: 'AI_RUNTIME_UNAVAILABLE', reason: 'AI_UNAVAILABLE' });
  assert.equal(mock.calls.length, 0);
}));

test('static catalog changes only five tool fields from the pinned bundled Luna model', async () => withHome(async home => {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { CODEX_HOME: home, HOME: home, USERPROFILE: home, TMP: home, TEMP: home });
  const result = spawnSync(await resolveCodexBinary(), ['debug', 'models', '--bundled'], {
    cwd: home, env, encoding: 'utf8', maxBuffer: 5_000_000, timeout: 10_000, shell: false, windowsHide: true
  });
  assert.equal(result.status, 0, 'Pinned CLI bundled model catalog must be readable offline.');
  const baseline = JSON.parse(result.stdout).models.find(model => model.slug === 'gpt-6-luna');
  assert.ok(baseline, 'Pinned CLI must include Luna.');
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(digest(baseline), CODEX_CATALOG_BASELINE_SHA256, 'Pinned model metadata changed; review tool boundaries before updating.');
  const expected = { ...baseline, tool_mode: 'direct', multi_agent_version: 'disabled', experimental_supported_tools: [], supports_search_tool: false, apply_patch_tool_type: null };
  const catalog = JSON.parse(await readFile(new URL('../src/model-catalog.json', import.meta.url), 'utf8'));
  assert.equal(catalog.models.length, 1);
  assert.equal(digest(catalog.models[0]), digest(expected), 'Static catalog must preserve the other bundled model capabilities.');
}));

test('pinned real Codex sends Luna Max with zero tools to an offline provider', { timeout: 30_000 }, async () => withHome(async home => {
  const captured = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    captured.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
    const item = { id: 'msg_offline', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ parts: [{ text: 'Offline adapter verified.' }] }), annotations: [] }] };
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const event = data => res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
    event({ type: 'response.created', response: { id: 'resp_offline', status: 'in_progress', output: [] } });
    event({ type: 'response.output_item.done', output_index: 0, item });
    event({ type: 'response.completed', response: { id: 'resp_offline', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
    res.end();
  });
  await new Promise(resolveListening => server.listen(0, '127.0.0.1', resolveListening));
  const spawnOffline = (file, args, options) => {
    const overrides = [
      'model_provider="offline"', 'model_providers.offline.name="Sherpa offline test"',
      `model_providers.offline.base_url="http://127.0.0.1:${server.address().port}/v1"`,
      'model_providers.offline.wire_api="responses"', 'model_providers.offline.requires_openai_auth=false',
      'model_providers.offline.request_max_retries=0', 'model_providers.offline.stream_max_retries=0',
      'features.enable_request_compression=false'
    ];
    const offlineArgs = args.slice(0, -1);
    for (const override of overrides) offlineArgs.push('-c', override);
    offlineArgs.push('-');
    return spawn(file, offlineArgs, options);
  };
  try {
    const result = await createCodexRunner({ spawnImpl: spawnOffline, timeoutMs: 20_000 })({ chatRequest: request, codexHome: home });
    assert.equal(result.candidates[0].content.parts[0].text, 'Offline adapter verified.');
    assert.equal(captured.length, 1);
    assert.equal(captured[0].headers.authorization, undefined);
    const actual = captured[0].body;
    assert.equal(actual.model, 'gpt-6-luna');
    assert.equal(actual.reasoning.effort, 'max');
    const advertisedTools = [...(actual.tools || []), ...(actual.input || []).flatMap(item => item.type === 'additional_tools' ? item.tools || [] : [])];
    assert.equal(advertisedTools.length, 0, `Unexpected tool namespaces: ${advertisedTools.map(tool => tool.name || tool.type).join(', ')}`);
    assert.ok(actual.text?.format?.schema || actual.response_format?.json_schema?.schema, 'Structured schema must reach provider.');
    const serialized = JSON.stringify(actual);
    assert.match(serialized, /Sherpa AI/);
    assert.equal(/Caveman Mode|Global user preferences|available_skills|AGENTS\.md instructions|SHERPA_HOST_INSTRUCTIONS_MUST_NOT_LOAD/.test(serialized), false, 'Host instructions leaked into model request.');
  } finally {
    server.closeAllConnections();
    await new Promise(resolveClosed => server.close(resolveClosed));
  }
}));
