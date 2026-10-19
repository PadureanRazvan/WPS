import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHERPA_VERSION } from '../js/version.js';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const faviconSource = readFileSync(new URL('../assets/sherpa-favicon.svg', import.meta.url), 'utf8');
const faviconIco = readFileSync(new URL('../favicon.ico', import.meta.url));
const faviconPng = readFileSync(new URL('../assets/sherpa-favicon-32.png', import.meta.url));
const appleTouchIcon = readFileSync(new URL('../assets/sherpa-apple-touch-icon.png', import.meta.url));

test('app head exposes the Sherpa favicon for browser tabs', () => {
  assert.match(indexSource, /<meta name="theme-color" content="#111111">/);
  assert.match(
    indexSource,
    new RegExp(`<link rel="icon" href="favicon\\.ico\\?v=${SHERPA_VERSION.number.replaceAll('.', '\\.')}" sizes="16x16 32x32 48x48">`)
  );
  assert.match(
    indexSource,
    new RegExp(`<link rel="icon" type="image/png" sizes="32x32" href="assets/sherpa-favicon-32\\.png\\?v=${SHERPA_VERSION.number.replaceAll('.', '\\.')}">`)
  );
  assert.match(
    indexSource,
    new RegExp(`<link rel="icon" type="image/svg\\+xml" sizes="any" href="assets/sherpa-favicon\\.svg\\?v=${SHERPA_VERSION.number.replaceAll('.', '\\.')}">`)
  );
  assert.match(
    indexSource,
    new RegExp(`<link rel="shortcut icon" href="favicon\\.ico\\?v=${SHERPA_VERSION.number.replaceAll('.', '\\.')}">`)
  );
  assert.match(
    indexSource,
    new RegExp(`<link rel="apple-touch-icon" sizes="180x180" href="assets/sherpa-apple-touch-icon\\.png\\?v=${SHERPA_VERSION.number.replaceAll('.', '\\.')}">`)
  );

  assert.doesNotMatch(indexSource, /<link rel="icon"[^>]+href="data:/);
});

test('Sherpa favicon embeds the compact FSP Global 3D artwork', () => {
  assert.match(faviconSource, /<title id="title">Sherpa — FSP Global<\/title>/);
  assert.match(faviconSource, /viewBox="0 0 64 64"/);
  assert.match(faviconSource, /FSP Global 3D green-and-white globe with a cyan compass star/);
  assert.match(faviconSource, /preserveAspectRatio="xMidYMid meet"/);
  const embedded = faviconSource.match(/href="data:image\/png;base64,([^"]+)"/);
  assert.ok(embedded, 'SVG must work without external image requests');
  const artwork = Buffer.from(embedded[1], 'base64');
  assert.equal(artwork.readUInt32BE(16), 256);
  assert.equal(artwork.readUInt32BE(20), 205);
});

test('Sherpa favicon fallbacks are valid browser image files', () => {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert.deepEqual([...faviconIco.subarray(0, 6)], [0, 0, 1, 0, 3, 0]);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(faviconIco[entry], size);
    assert.equal(faviconIco[entry + 1], size);
    const length = faviconIco.readUInt32LE(entry + 8);
    const offset = faviconIco.readUInt32LE(entry + 12);
    const frame = faviconIco.subarray(offset, offset + length);
    assert.equal(frame.length, length);
    assert.deepEqual([...frame.subarray(0, 8)], pngSignature);
    assert.equal(frame.readUInt32BE(16), size);
    assert.equal(frame.readUInt32BE(20), size);
    if (size === 32) assert.deepEqual(frame, faviconPng);
  }
  for (const [png, size] of [[faviconPng, 32], [appleTouchIcon, 180]]) {
    assert.deepEqual([...png.subarray(0, 8)], pngSignature);
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
