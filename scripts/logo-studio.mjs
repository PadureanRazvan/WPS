import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { createRequire } from 'node:module';

// Serve without dependencies: node scripts/logo-studio.mjs --serve
// Capture/verify with Playwright installed, or SHERPA_PLAYWRIGHT_MODULE set.
// Set SHERPA_BROWSER_PATH to use an existing Chrome/Chromium executable.
const root = resolve(import.meta.dirname, '..');
const params = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [name, ...value] = arg.replace(/^--/, '').split('=');
  return [name, value.length ? value.join('=') : true];
}));
const flag = name => name in params && params[name] !== 'false';
const themes = ['dark', 'light', 'fsp', 'aurora', 'coral'];
const views = ['grid', 'single', 'login', 'small', 'compact'];
const shapes = ['fsp', 'globe', 'heart', 'summit', 'infinity'];
if (params.theme && !themes.includes(params.theme)) throw new Error('Unknown preview theme');
if (params.view && !views.includes(params.view)) throw new Error('Unknown preview size');
if (params.shape && !shapes.includes(params.shape)) throw new Error('Unknown preview figure');
if (params.app && !['login', 'sidebar', 'compact'].includes(params.app)) throw new Error('Unknown shell view');
if (params.label && !/^[a-zA-Z0-9_-]+$/.test(params.label)) throw new Error('Preview label may contain only letters, numbers, hyphens and underscores');
if (flag('verify') && params.app === 'login') throw new Error('Use --app=sidebar for shell interaction checks');
function numberOption(name, fallback, minimum, maximum) {
  const value = Number(params[name] ?? fallback);
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Invalid --${name}`);
  return value;
}
const elapsed = numberOption('elapsed', 1600, 0, 120000);
const extraTime = numberOption('time', 0, 0, 120000);
const morph = numberOption('morph', 0, 0, 1);
const port = numberOption('port', 8766, 0, 65535);
if (!Number.isInteger(port)) throw new Error('--port must be an integer');
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/app' ? '/index.html' : url.pathname === '/' ? '/scripts/fixtures/logo-studio.html' : url.pathname));
    if (!path.startsWith(root+sep)) throw Error('Invalid path');
    const relative = path.slice(root.length + 1).replaceAll(sep, '/');
    if (!['index.html', 'favicon.ico'].includes(relative) && !['assets/', 'css/', 'js/', 'scripts/fixtures/'].some(prefix => relative.startsWith(prefix))) throw Error('Not a preview asset');
    if (!['.html', '.js', '.css', '.webp', '.png', '.svg', '.ico'].includes(extname(path))) throw Error('Unsupported preview asset');
    let body = await readFile(path);
    if (url.pathname === '/app') body = body.toString()
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, script => script.includes('type="importmap"') ? script : '')
      .replace(/<link\b[^>]*href="https:[^>]*>/gi, '');
    res.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'}[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((done, reject) => { server.once('error', reject); server.listen(flag('serve') ? port : 0, '127.0.0.1', done); });
const origin = `http://127.0.0.1:${server.address().port}`;
if (flag('serve')) { console.log(`Sherpa sculpture studio: ${origin}`); } else {
const out = resolve(root, 'output/logo-studio', params.label || 'current');
await mkdir(out,{recursive:true});
let browser;
try {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.SHERPA_PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({headless:true,...(process.env.SHERPA_BROWSER_PATH ? {executablePath:process.env.SHERPA_BROWSER_PATH} : {}),args:['--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:flag('mobile') ? 390 : params.app ? 1280 : params.view === 'single' ? 1000 : 1720,height:flag('mobile') ? 844 : params.app ? 900 : params.view === 'single' ? 1050 : 600},deviceScaleFactor:2});
  if (flag('reduced')) await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[], warnings=[];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type()==='error') errors.push(m.text()); if(m.type()==='warning') warnings.push(m.text()); });
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.addInitScript(() => {
    let now = 0, next = 1;
    const callbacks = new Map();
    performance.now = () => now;
    window.requestAnimationFrame = cb => { const id = next++; callbacks.set(id,cb); return id; };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    window.stepLogo = (ms=16.667, frameMs=1000/60) => {
      const count = Math.max(1,Math.ceil(ms/frameMs));
      for(let i=0;i<count;i++) { now+=ms/count; const batch=[...callbacks.values()]; callbacks.clear(); batch.forEach(cb=>cb(now)); }
      return now;
    };
  });
  await page.goto(origin+(params.app ? '/app' : '/')+'?'+new URLSearchParams({theme:params.theme || 'dark',view:params.view || 'grid',shape:params.shape || 'fsp'}));
  if (params.app) await page.evaluate(async params => {
    document.documentElement.dataset.theme = params.theme || 'dark';
    const login = params.app === 'login';
    document.getElementById('loginScreen').style.display = login ? '' : 'none';
    document.getElementById('appContainer').style.display = login ? 'none' : '';
    document.querySelector('.sidebar').classList.toggle('collapsed', params.app === 'compact');
    const { initLogoAnimation } = await import('/js/logo-animation.js');
    window.logoStudio = { controllers: [await initLogoAnimation(login ? 'loginLogo' : 'sherpaLogo', 120, {autoCycle:!params.study})], shapeIndices: [['fsp','globe','heart','summit','infinity'].indexOf(params.shape || 'fsp')], ready: true };
  }, {...params, study:flag('study')});
  await page.waitForFunction(() => window.logoStudio?.ready, null, { polling: 50 });
  await page.evaluate(() => { window.stepLogo(); window.logoStudio.controllers.forEach(c => c.pause()); });
  await page.evaluate(elapsed => {
    window.logoStudio.controllers.forEach((c,i) => {for(let n=0;n<(window.logoStudio.shapeIndices?.[i] ?? i);n++) c.next();});
    window.stepLogo();
    window.logoStudio.controllers.forEach(c => c.resume());
    window.stepLogo(elapsed);
    window.logoStudio.controllers.forEach(c => c.pause());
    window.stepLogo();
  }, elapsed);
  if(extraTime) await page.evaluate(ms => {window.logoStudio.controllers.forEach(c=>c.resume()); window.stepLogo(ms); window.logoStudio.controllers.forEach(c=>c.pause());window.stepLogo();},extraTime);
  if('morph' in params) await page.evaluate(progress => {
    window.logoStudio.controllers.forEach(c => { c.resume(); c.next(); });
    window.stepLogo(progress * 1900);
    window.logoStudio.controllers.forEach(c => c.pause());
    window.stepLogo();
  }, morph);
  const shotName=(params.theme || 'dark')+'-'+(params.app || params.view || 'grid')+'-'+(params.shape || 'all')+(params.elapsed ? '-'+params.elapsed : '')+('morph' in params ? '-morph-'+morph : '')+(flag('mobile') ? '-mobile' : '')+(flag('reduced') ? '-reduced' : '');
  await page.screenshot({path:resolve(out,shotName+'.png')});
  const state=await page.locator('[data-fsp-logo][data-logo-renderer]').evaluateAll(items => items.map((el,i)=>({shape:el.dataset.logoShape,renderer:el.dataset.logoRenderer,variant:el.dataset.logoVariant,bounds:el.getBoundingClientRect().toJSON(),diagnostics:window.logoStudio.controllers[i].getDiagnostics?.()})));
  await writeFile(resolve(out,shotName+'-state.json'),JSON.stringify({errors,warnings,state},null,2));
  if (flag('verify')) {
    const { verifyControls } = await import(params.app ? './fixtures/logo-controls.mjs' : './fixtures/logo-studio-controls.mjs');
    const checks = await verifyControls(page);
    await writeFile(resolve(out,'controls-verification.json'), JSON.stringify({checks,errors,warnings},null,2));
    console.log(JSON.stringify({checks,errors}));
  }
  console.log(JSON.stringify({out,errors,warnings:warnings.length,state:state.map(({shape,renderer})=>({shape,renderer}))}));
  const actionableWarnings = warnings.filter(warning => !warning.startsWith('THREE.WebGLProgram: Program Info Log:') || !warning.includes('warning X4122'));
  if (errors.length || actionableWarnings.length) process.exitCode = 1;
} finally { await browser?.close(); await new Promise(done=>server.close(done)); }
}
