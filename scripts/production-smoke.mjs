#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DEFAULT_BASE_URL = 'https://padureanrazvan.github.io/WPS/';
export const DEFAULT_CDP_LIST_URL = 'http://localhost:9227/json/list';
export const DEFAULT_MODULE_CHECKS = [
    'js/app-shell-wiring.js',
    'js/planner-read-model.js',
    'js/planner-table-view.js',
    'js/reports-view.js',
    'js/users-command.js'
];

export function buildVersionedAppUrl(baseUrl = DEFAULT_BASE_URL, version = '') {
    const url = new URL(baseUrl);
    if (version) {
        url.searchParams.set('v', version);
    }
    return url.href;
}

export function selectSherpaPageTarget(targets = []) {
    const pages = targets.filter(target => target.type === 'page');
    return pages.find(target => String(target.url || '').includes('padureanrazvan.github.io/WPS'))
        || pages[0]
        || null;
}

export function filterRelevantBrowserEvents(events = []) {
    return events.filter(event => {
        const text = String(event.text || '');
        return !text.includes('net::ERR_ABORTED')
            && !/favicon/i.test(text)
            && !/chrome-extension/i.test(text);
    });
}

export function parseProductionSmokeArgs(args = []) {
    const options = {
        baseUrl: DEFAULT_BASE_URL,
        cdpListUrl: DEFAULT_CDP_LIST_URL,
        version: '',
        allowUnauthenticated: false,
        openNewTab: false
    };

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--base-url') options.baseUrl = args[++index];
        else if (arg === '--cdp') options.cdpListUrl = args[++index];
        else if (arg === '--version') options.version = args[++index];
        else if (arg === '--allow-unauthenticated') options.allowUnauthenticated = true;
        else if (arg === '--open-new-tab') options.openNewTab = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else throw new Error(`Unknown argument: ${arg}`);
    }

    return options;
}

function getCurrentGitVersion() {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return '';
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createCdpClient(webSocketDebuggerUrl) {
    const pending = new Map();
    const events = [];
    let nextId = 1;
    const ws = new WebSocket(webSocketDebuggerUrl);

    function send(method, params = {}) {
        const id = nextId++;
        ws.send(JSON.stringify({ id, method, params }));

        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject, method });
            setTimeout(() => {
                if (pending.has(id)) {
                    pending.delete(id);
                    reject(new Error(`${method} timed out`));
                }
            }, 30000);
        });
    }

    ws.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const request = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) {
                request.reject(new Error(`${request.method}: ${message.error.message}`));
            } else {
                request.resolve(message.result || {});
            }
            return;
        }

        if (message.method === 'Runtime.exceptionThrown') {
            events.push({
                type: 'exception',
                text: message.params?.exceptionDetails?.text || 'runtime exception'
            });
        }
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
            events.push({
                type: 'console-error',
                text: (message.params.args || []).map(arg => arg.value || arg.description || '').join(' ')
            });
        }
        if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
            events.push({
                type: 'log-error',
                text: message.params.entry.text || message.params.entry.url || 'log error'
            });
        }
        if (message.method === 'Network.loadingFailed') {
            events.push({
                type: 'network-failed',
                text: message.params?.errorText || message.params?.requestId || 'network failed'
            });
        }
    };

    return {
        events,
        close: () => ws.close(),
        ready: () => new Promise((resolve, reject) => {
            ws.onopen = resolve;
            ws.onerror = reject;
        }),
        send,
        evaluate: async (expression, options = {}) => {
            const result = await send('Runtime.evaluate', {
                expression,
                awaitPromise: true,
                returnByValue: true,
                ...options
            });
            if (result.exceptionDetails) {
                throw new Error(result.exceptionDetails.text || 'Runtime.evaluate exception');
            }
            return result.result?.value;
        }
    };
}

async function waitFor(client, expression, timeoutMs = 30000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const value = await client.evaluate(expression).catch(() => false);
        if (value) return value;
        await sleep(500);
    }
    throw new Error(`Timed out waiting for ${expression}`);
}

async function fetchCdpTargets(cdpListUrl) {
    const response = await fetch(cdpListUrl);
    if (!response.ok) {
        throw new Error(`CDP target list failed: ${response.status}`);
    }
    return response.json();
}

async function runProductionSmoke(options) {
    const version = options.version || getCurrentGitVersion();
    const appUrl = buildVersionedAppUrl(options.baseUrl, version);
    const targets = await fetchCdpTargets(options.cdpListUrl);
    const target = selectSherpaPageTarget(targets);

    if (!target) {
        throw new Error(`No reusable Chrome page target found at ${options.cdpListUrl}. Start one external Chrome session with remote debugging instead of opening duplicate tabs.`);
    }
    if (options.openNewTab) {
        throw new Error('This smoke is intentionally single-tab. --open-new-tab is reserved and not supported.');
    }

    const client = createCdpClient(target.webSocketDebuggerUrl);
    await client.ready();

    try {
        await client.send('Runtime.enable');
        await client.send('Page.enable');
        await client.send('Log.enable');
        await client.send('Network.enable');
        await client.send('Page.navigate', { url: appUrl });
        await waitFor(client, 'document.readyState === "complete"', 45000);

        const moduleExports = await client.evaluate(`(async () => {
            const modules = ${JSON.stringify(DEFAULT_MODULE_CHECKS)};
            const result = {};
            for (const modulePath of modules) {
                const mod = await import(new URL(modulePath + '?v=${version}', location.href).href);
                result[modulePath] = Object.keys(mod).sort();
            }
            return result;
        })()`);

        const shellVisible = await waitFor(client, `(() => {
            const app = document.getElementById('appContainer');
            const login = document.getElementById('loginScreen');
            const nav = document.querySelector('.nav-item[data-tooltip="reports"]');
            return app && getComputedStyle(app).display !== 'none' && login && getComputedStyle(login).display === 'none' && nav;
        })()`, options.allowUnauthenticated ? 5000 : 45000).catch(() => false);

        if (!shellVisible && !options.allowUnauthenticated) {
            throw new Error('Production app did not reach the authenticated shell. Log in once in the existing Chrome tab and rerun this smoke.');
        }

        let reportState = null;
        if (shellVisible) {
            await sleep(2000);
            await client.evaluate(`document.querySelector('.nav-item[data-tooltip="reports"]')?.click(); true`);
            await waitFor(client, `document.getElementById('reports')?.classList.contains('active')`, 15000);
            await waitFor(client, `document.getElementById('reportsContent')?.children.length > 0`, 15000);
            await client.evaluate(`document.getElementById('reportsRefreshBtn')?.click(); true`);
            await sleep(600);
            reportState = await client.evaluate(`(() => {
                const content = document.getElementById('reportsContent');
                return {
                    activeNav: document.querySelector('.nav-item.active')?.dataset?.tooltip || null,
                    reportsActive: document.getElementById('reports')?.classList.contains('active') || false,
                    chartCount: content?.querySelectorAll('.chart-container').length || 0,
                    tableCount: content?.querySelectorAll('table').length || 0,
                    cardCount: content?.querySelectorAll('.stat-card').length || 0,
                    refreshLoading: document.getElementById('reportsRefreshBtn')?.classList.contains('is-loading') || false,
                    contentPreview: content?.innerText?.trim().slice(0, 160) || ''
                };
            })()`);
        }

        const relevantEvents = filterRelevantBrowserEvents(client.events);
        const summary = {
            appUrl,
            reusedTarget: {
                id: target.id,
                initialUrl: target.url
            },
            moduleExports,
            shellVisible: Boolean(shellVisible),
            reportState,
            relevantEvents
        };

        if (relevantEvents.length > 0) {
            throw new Error(`Browser errors during smoke: ${JSON.stringify(summary, null, 2)}`);
        }

        return summary;
    } finally {
        client.close();
    }
}

function printHelp() {
    console.log(`Usage: node scripts/production-smoke.mjs [options]

Options:
  --version <sha>       Version query to append to the production URL.
  --base-url <url>      Production base URL. Defaults to ${DEFAULT_BASE_URL}
  --cdp <url>           Chrome CDP /json/list URL. Defaults to ${DEFAULT_CDP_LIST_URL}
  --allow-unauthenticated  Allow module-only checks when the Chrome tab is logged out.

The smoke reuses one existing external Chrome tab and does not perform Save, Add, Delete, Undo, or Firestore write actions.`);
}

async function main() {
    const options = parseProductionSmokeArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    const summary = await runProductionSmoke(options);
    console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
