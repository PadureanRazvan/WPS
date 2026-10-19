import test from 'node:test';
import assert from 'node:assert/strict';

async function fixture(label, failFirstChart = false) {
    const saved = Object.fromEntries(['document', 'Chart', 'Litepicker', 'JSZip'].map(name => [name, globalThis[name]]));
    const elements = [], byId = new Map();
    let chartFailed = false;
    delete globalThis.Chart; delete globalThis.Litepicker; delete globalThis.JSZip;
    globalThis.document = {
        getElementById: id => byId.get(id),
        createElement: tag => ({ tag, remove() { this.removed = true; } }),
        head: { append(element) {
            elements.push(element);
            queueMicrotask(() => {
                if (element.tag === 'link') { element.sheet = {}; byId.set(element.id, element); }
                else if (element.src.includes('/chart.js')) {
                    if (failFirstChart && !chartFailed) { chartFailed = true; element.onerror(); return; }
                    globalThis.Chart = class {};
                } else if (element.src.includes('/litepicker/')) globalThis.Litepicker = class {};
                else globalThis.JSZip = class {};
                element.onload();
            });
        } }
    };
    const module = await import(`../js/app-dependencies.js?test=${label}`);
    return { module, elements, restore() { for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; } } };
}

test('workspace resources load only on demand and concurrent sessions share requests', async () => {
    const f = await fixture('coalesced');
    try {
        assert.equal(f.elements.length, 0);
        await Promise.all([f.module.loadWorkspaceLibraries(), f.module.loadWorkspaceLibraries()]);
        assert.equal(f.elements.length, 4);
        await f.module.loadWorkspaceLibraries();
        assert.equal(f.elements.length, 4);
    } finally { f.restore(); }
});

test('a failed library request is removed and can be retried without duplicating successful resources', async () => {
    const f = await fixture('retry', true);
    try {
        await assert.rejects(f.module.loadWorkspaceLibraries(), /Could not load Chart/);
        assert.ok(f.elements[0].removed);
        await f.module.loadWorkspaceLibraries();
        assert.equal(f.elements.length, 5);
    } finally { f.restore(); }
});
