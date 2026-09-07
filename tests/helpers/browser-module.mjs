import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real browser shell with explicit DOM/Firebase adapters and no network.
export function loadBrowserModule(path, dependencies = {}, expose = '') {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?;\s*$/gm, '')
    .replace(/^export /gm, '');
  const context = vm.createContext({ console, ...dependencies });
  vm.runInContext(`${source}\n${expose}`, context, { filename: path });
  return context;
}
