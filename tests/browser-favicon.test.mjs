import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const faviconSource = readFileSync(new URL('../assets/sherpa-favicon.svg', import.meta.url), 'utf8');

test('app head exposes the Sherpa favicon for browser tabs', () => {
  assert.match(indexSource, /<meta name="theme-color" content="#111111">/);
  assert.match(
    indexSource,
    /<link rel="icon" type="image\/svg\+xml" href="assets\/sherpa-favicon\.svg\?v=20260626-global-centered">/
  );
  assert.match(
    indexSource,
    /<link rel="shortcut icon" href="assets\/sherpa-favicon\.svg\?v=20260626-global-centered">/
  );
});

test('Sherpa favicon is a compact branded SVG mark', () => {
  assert.match(faviconSource, /<title id="title">Sherpa<\/title>/);
  assert.match(faviconSource, /viewBox="0 0 64 64"/);
  assert.match(faviconSource, /green globe mark/);
  assert.match(faviconSource, /#00a85a/);
  assert.match(faviconSource, /#006f9f/);
  assert.match(faviconSource, /<clipPath id="globeClip">/);
  assert.match(faviconSource, /M44\.2 21\.5c-3\.3-4-15\.4-4\.9-18\.6-.3/);
});
