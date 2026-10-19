import { parentPort } from 'node:worker_threads';
globalThis.self = {
    postMessage: (data, transfers) => parentPort.postMessage(data, transfers)
};
await import('../../js/logo-prepare.worker.js');
parentPort.on('message', data => self.onmessage({ data }));
parentPort.postMessage({ ready: true });
