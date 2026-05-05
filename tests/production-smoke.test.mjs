import test from 'node:test';
import assert from 'node:assert/strict';

async function loadProductionSmokeModule() {
  try {
    return await import('../scripts/production-smoke.mjs');
  } catch (error) {
    assert.fail(`production-smoke.mjs should be importable: ${error.message}`);
  }
}

test('buildVersionedAppUrl applies the requested deployment version', async () => {
  const { buildVersionedAppUrl } = await loadProductionSmokeModule();

  assert.equal(
    buildVersionedAppUrl('https://padureanrazvan.github.io/WPS/', '23f2544'),
    'https://padureanrazvan.github.io/WPS/?v=23f2544'
  );

  assert.equal(
    buildVersionedAppUrl('https://padureanrazvan.github.io/WPS/?debug=1', '23f2544'),
    'https://padureanrazvan.github.io/WPS/?debug=1&v=23f2544'
  );
});

test('selectSherpaPageTarget reuses an existing Sherpa tab before falling back', async () => {
  const { selectSherpaPageTarget } = await loadProductionSmokeModule();
  const targets = [
    { type: 'page', id: 'first', url: 'https://example.test/' },
    { type: 'page', id: 'sherpa', url: 'https://padureanrazvan.github.io/WPS/?v=abc123' }
  ];

  assert.equal(selectSherpaPageTarget(targets).id, 'sherpa');
  assert.equal(selectSherpaPageTarget([targets[0]]).id, 'first');
  assert.equal(selectSherpaPageTarget([{ type: 'worker', id: 'worker', url: 'https://padureanrazvan.github.io/WPS/' }]), null);
});

test('filterRelevantBrowserEvents ignores expected browser noise only', async () => {
  const { filterRelevantBrowserEvents } = await loadProductionSmokeModule();
  const events = [
    { type: 'network-failed', text: 'net::ERR_ABORTED' },
    { type: 'log-error', text: 'favicon.ico 404' },
    { type: 'console-error', text: 'real module error' },
    { type: 'exception', text: 'chrome-extension://abc' }
  ];

  assert.deepEqual(filterRelevantBrowserEvents(events), [
    { type: 'console-error', text: 'real module error' }
  ]);
});

test('parseProductionSmokeArgs keeps the smoke read-only by default', async () => {
  const { parseProductionSmokeArgs } = await loadProductionSmokeModule();
  const options = parseProductionSmokeArgs([
    '--version', '23f2544',
    '--base-url', 'https://padureanrazvan.github.io/WPS/',
    '--cdp', 'http://localhost:9227/json/list'
  ]);

  assert.equal(options.version, '23f2544');
  assert.equal(options.baseUrl, 'https://padureanrazvan.github.io/WPS/');
  assert.equal(options.cdpListUrl, 'http://localhost:9227/json/list');
  assert.equal(options.allowUnauthenticated, false);
  assert.equal(options.openNewTab, false);
});
