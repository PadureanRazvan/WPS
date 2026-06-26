import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const faviconSource = readFileSync(new URL('../assets/sherpa-favicon.svg', import.meta.url), 'utf8');
const faviconIco = readFileSync(new URL('../favicon.ico', import.meta.url));
const faviconPng = readFileSync(new URL('../assets/sherpa-favicon-32.png', import.meta.url));
const appleTouchIcon = readFileSync(new URL('../assets/sherpa-apple-touch-icon.png', import.meta.url));

test('app head exposes the Sherpa favicon for browser tabs', () => {
  assert.match(indexSource, /<meta name="theme-color" content="#111111">/);
  assert.match(
    indexSource,
    /<link rel="icon" href="favicon\.ico\?v=20260626-global-centered-fallback" sizes="any">/
  );
  assert.match(
    indexSource,
    /<link rel="icon" type="image\/png" sizes="32x32" href="assets\/sherpa-favicon-32\.png\?v=20260626-global-centered-fallback">/
  );
  assert.match(
    indexSource,
    /<link rel="icon" type="image\/svg\+xml" href="assets\/sherpa-favicon\.svg\?v=20260626-global-centered-fallback">/
  );
  assert.match(
    indexSource,
    /<link rel="shortcut icon" href="favicon\.ico\?v=20260626-global-centered-fallback">/
  );
  assert.match(
    indexSource,
    /<link rel="apple-touch-icon" sizes="180x180" href="assets\/sherpa-apple-touch-icon\.png\?v=20260626-global-centered-fallback">/
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

test('Sherpa favicon fallbacks are valid browser image files', () => {
  assert.deepEqual([...faviconIco.subarray(0, 6)], [0, 0, 1, 0, 1, 0]);
  assert.equal(faviconIco[6], 32);
  assert.equal(faviconIco[7], 32);
  assert.deepEqual([...faviconIco.subarray(22, 30)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert.deepEqual([...faviconPng.subarray(0, 8)], pngSignature);
  assert.deepEqual([...appleTouchIcon.subarray(0, 8)], pngSignature);
});
