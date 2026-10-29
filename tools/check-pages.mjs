// Page gates:
//  (1) index.html and tests.html load the identical engine script list (the <!-- engine -->
//      block) in the same order; tests.html loads no js/ui/ file;
//  (2) every local script / stylesheet a page references exists, and every tests/*.js on disk
//      is loaded by tests.html (a test file nobody loads is a test that never runs);
//  (3) no external URL in any <script src> (the site is static and self-contained);
//  (4) no silent fallbacks in js/ui (`if (!XS.x)` / `XS.x || {}`): a missing module throws;
//  (5) the AI (M4): index.html and tests.html carry the same <!-- ai --> block, js/ai/worker.js importScripts the engine block
//      followed by the ai block in the same order (a worker that lacks a script is an AI that never loads), and no file under
//      js/ai uses Math.random (decisions are seeded).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const block = (f) => {
  const html = read(f);
  if (!html.includes('<!-- engine -->') || !html.includes('<!-- /engine -->')) { fails.push(`${f}: no <!-- engine --> ... <!-- /engine --> block`); return []; }
  const b = html.split('<!-- engine -->')[1].split('<!-- /engine -->')[0];
  return [...b.matchAll(/<script src="([^"?]+)/g)].map((m) => m[1]);
};
const refs = (f) => [...read(f).matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"?#]+)/g)].map((m) => m[1]);
const external = (u) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u);   // http:, https:, data:, //host

const a = block('index.html'), b = block('tests.html');
if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`engine script lists differ:\n  index: ${a.join(' ')}\n  tests: ${b.join(' ')}`);
if (b.some((u) => u.startsWith('js/ui/'))) fails.push('tests.html: the engine block loads a js/ui/ file');

for (const f of ['index.html', 'tests.html']) {
  for (const u of refs(f)) if (!external(u) && !fs.existsSync(path.join(ROOT, u))) fails.push(`${f}: missing ${u}`);
  for (const m of read(f).matchAll(/<script[^>]+src="([^"]+)"/g)) {
    if (/^(?:https?:)?\/\//i.test(m[1])) fails.push(`${f}: external URL in a script tag: ${m[1]}`);
  }
}

const testsLoaded = new Set(refs('tests.html'));
const testsDir = path.join(ROOT, 'tests');
if (fs.existsSync(testsDir)) for (const f of fs.readdirSync(testsDir)) {
  if (f.endsWith('.js') && !testsLoaded.has('tests/' + f)) fails.push(`tests/${f}: not loaded by tests.html`);
}

const uiDir = path.join(ROOT, 'js/ui');
if (fs.existsSync(uiDir)) for (const f of fs.readdirSync(uiDir)) {
  if (!f.endsWith('.js') || f === 'dev-fixture.js') continue;
  const code = fs.readFileSync(path.join(uiDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  if (/if\s*\(\s*!\s*XS\.[A-Za-z_]+\s*\)/.test(code)) fails.push(`js/ui/${f}: silent-fallback guard "if (!XS.x)"`);
  // A module creating its own namespace (`XS.anim = XS.anim || {}`) is fine; a read that
  // substitutes {} for a missing module is not.
  const reads = code.replace(/(XS\.[A-Za-z_.]+)\s*=\s*\1\s*\|\|\s*\{\s*\}/g, '');
  if (/XS\.[A-Za-z_.]+\s*\|\|\s*\{\s*\}/.test(reads)) fails.push(`js/ui/${f}: silent fallback "XS.x || {}"`);
}

// ---- (5) the AI block and the worker's script list ----
const aiBlock = (f) => {
  const html = read(f);
  if (!html.includes('<!-- ai -->') || !html.includes('<!-- /ai -->')) { fails.push(`${f}: no <!-- ai --> ... <!-- /ai --> block`); return []; }
  return [...html.split('<!-- ai -->')[1].split('<!-- /ai -->')[0].matchAll(/<script src="([^"?]+)/g)].map((m) => m[1]);
};
const aiA = aiBlock('index.html'), aiB = aiBlock('tests.html');
if (JSON.stringify(aiA) !== JSON.stringify(aiB)) fails.push(`ai script lists differ:\n  index: ${aiA.join(' ')}\n  tests: ${aiB.join(' ')}`);
const workerFile = 'js/ai/worker.js';
if (!fs.existsSync(path.join(ROOT, workerFile))) fails.push(`${workerFile} is missing`);
else {
  const w = read(workerFile);
  const m = /const SCRIPTS = \[([\s\S]*?)\];/.exec(w);
  if (m === null) fails.push(`${workerFile}: no "const SCRIPTS = [...]" list`);
  else {
    const listed = [...m[1].matchAll(/'([^']+)'/g)].map((x) => path.posix.normalize(path.posix.join('js/ai', x[1])));
    const want = [...a, ...aiA];
    if (JSON.stringify(listed) !== JSON.stringify(want)) fails.push(`${workerFile} imports differ from the pages' engine + ai blocks:\n  worker: ${listed.join(' ')}\n  pages:  ${want.join(' ')}`);
    for (const u of listed) if (!fs.existsSync(path.join(ROOT, u))) fails.push(`${workerFile}: missing ${u}`);
    if (!/importScripts\(\.\.\.SCRIPTS\.map\(\(u\) => u \+ self\.location\.search\)\)/.test(w)) fails.push(`${workerFile}: importScripts must repeat the worker URL's ?v= query`);
  }
}
const aiDir = path.join(ROOT, 'js/ai');
if (fs.existsSync(aiDir)) for (const f of fs.readdirSync(aiDir)) {
  if (!f.endsWith('.js')) continue;
  const code = fs.readFileSync(path.join(aiDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  if (/Math\.random/.test(code)) fails.push(`js/ai/${f}: Math.random (AI decisions are seeded; use XS.rngNext)`);
}

for (const f of fails) console.log('FAIL ' + f);
console.log(`check-pages: ${fails.length ? fails.length + ' failure(s)' : 'ok'} (${a.length} engine scripts)`);
process.exit(fails.length ? 1 : 0);
