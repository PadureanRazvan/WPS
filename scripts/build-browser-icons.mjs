import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Export the approved compact 3D artwork without changing its design.
// Install sharp locally, or point SHERPA_SHARP_MODULE at an existing module.
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHERPA_SHARP_MODULE || 'sharp');
const file = path => new URL(`../${path}`, import.meta.url);
const artwork = await readFile(file('assets/branding/fsp-global-compact-still.webp'));
const embeddedPng = await sharp(artwork).resize({ width: 256 }).png().toBuffer();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title desc">
  <title id="title">Sherpa — FSP Global</title>
  <desc id="desc">FSP Global 3D green-and-white globe with a cyan compass star.</desc>
  <!-- Static export of assets/branding/fsp-global-compact-still.webp. -->
  <image width="64" height="64" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${embeddedPng.toString('base64')}"/>
</svg>
`;
const render = size => sharp(Buffer.from(svg), { density: 384 })
  .resize(size, size).png().toBuffer();
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map(render));

// ICO directory entries let each browser choose an exact native tab size.
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = size;
  directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frames[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frames[index].length;
}

await writeFile(file('assets/sherpa-favicon.svg'), svg);
await writeFile(file('assets/sherpa-favicon-32.png'), frames[1]);
await writeFile(file('favicon.ico'), Buffer.concat([directory, ...frames]));
await writeFile(file('assets/sherpa-apple-touch-icon.png'),
  await sharp(await render(180)).flatten({ background: '#ffffff' }).png().toBuffer());
console.log('Exported FSP Global SVG, 32px PNG, 16/32/48px ICO and 180px touch icon.');
