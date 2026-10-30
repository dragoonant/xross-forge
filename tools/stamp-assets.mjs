#!/usr/bin/env node
// Cache busting, without a build step (ported from lorecannae, 9c8016d).
//
// GitHub Pages serves every file with `cache-control: max-age=600` and no way to change it.
// Each asset is fetched and aged independently, so for ten minutes after a deploy a returning
// player can hold a NEW index.html alongside an OLD styles.css. The page was not wrong; the
// stylesheet was ten minutes behind it.
//
// The fix is to make the HTML the only thing that can be stale. Every declared local asset
// carries `?v=<hash of its own contents>`, so:
//   * a file that did not change keeps its URL and stays cached;
//   * a file that DID change has a URL the browser has never seen, so it cannot serve a stale
//     copy of it;
//   * until the new index.html arrives you get the old version, WHOLE. A mixed page is the
//     failure mode this removes.
//
// The AI worker is the same problem one level down (M7, TODO 8): js/ai/worker.js and every script it
// importScripts are fetched by the worker, not by a <script> tag, so they were unstamped. Now
//   * each path in the worker's `const SCRIPTS = [...]` list carries ?v=<hash of the file it names>
//     (the same URL the page's <script> tag uses, so the two share one cache entry);
//   * the UI's `new Worker('js/ai/worker.js?v=...')` (js/ui/bot-ai.js) carries the hash of worker.js itself;
//   * index.html then stamps its own tags, bot-ai.js included, from the stamped bytes.
// The stamps nest (imports -> worker.js -> bot-ai.js -> index.html), so they are computed in that order, in memory,
// and --check compares the same in-memory result with what is on disk.
//
// Hashes are over the file bytes; .gitattributes forces LF so they match on every OS.
// tests.html is deliberately not stamped: it never needs cache busting, and check-pages strips
// the query before comparing the two script lists.
//
//   node tools/stamp-assets.mjs           rewrite index.html with current hashes
//   node tools/stamp-assets.mjs --check   exit 1 if any stamp is stale (the CI gate)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'index.html';
const check = process.argv.includes('--check');

// The declared assets: the script list and the stylesheet. Runtime-loaded files (card art,
// audio) are NOT stamped: they are fetched by id from a manifest that IS stamped. If a
// <video id=".." src=".."> ever lands on the title screen, add its tag here.
const TAGS = [
  { re: /(<script src=")([^"]+)(")/g, what: 'script' },
  { re: /(<link rel="stylesheet" href=")([^"]+)(")/g, what: 'stylesheet' },
];

const bare = (u) => u.split('?')[0];
const isLocal = (u) => !/^[a-z]+:/i.test(u) && !u.startsWith('//');

// ---- the worker: its imports, then its own URL in the UI --------------------------------------------------------
const WORKER = 'js/ai/worker.js';
const WORKER_OWNER = 'js/ui/bot-ai.js';                // the file that does `new Worker('js/ai/worker.js?v=...')`
const stale = [];
const virtual = new Map();                             // rel path -> the content it should have after stamping
const read = (rel) => (virtual.has(rel) ? virtual.get(rel) : fs.readFileSync(path.join(ROOT, rel)));
const hashBuf = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
const diskText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function stampWorker() {
  const text = diskText(WORKER);
  const m = /const SCRIPTS = \[([\s\S]*?)\];/.exec(text);
  if (m === null) throw new Error(`${WORKER}: no "const SCRIPTS = [...]" list to stamp`);
  if (!/importScripts\(\.\.\.SCRIPTS\)/.test(text)) throw new Error(`${WORKER}: the call must be importScripts(...SCRIPTS): the stamps are in the list, nothing is appended`);
  let n = 0;
  const list = m[1].replace(/'([^'?]+)(?:\?v=[0-9a-f]+)?'/g, (whole, u) => {
    n++;
    return "'" + u + '?v=' + hashOf(path.posix.join(path.posix.dirname(WORKER), u)) + "'";
  });
  const out = text.replace(m[0], 'const SCRIPTS = [' + list + '];');
  virtual.set(WORKER, Buffer.from(out));
  if (out !== text) stale.push(WORKER + ' (its import list)');
  return n;
}
function stampWorkerOwner() {
  const text = diskText(WORKER_OWNER);
  const re = /new Worker\('js\/ai\/worker\.js(?:\?v=[0-9a-f]+)?'\)/g;
  const found = text.match(re);
  if (found === null || found.length !== 1) throw new Error(`${WORKER_OWNER}: expected exactly one new Worker('js/ai/worker.js?v=...')`);
  const out = text.replace(re, "new Worker('js/ai/worker.js?v=" + hashBuf(read(WORKER)) + "')");
  virtual.set(WORKER_OWNER, Buffer.from(out));
  if (out !== text) stale.push(WORKER_OWNER + ' (the worker URL)');
}

function hashOf(rel) {
  const f = path.join(ROOT, rel);
  if (!virtual.has(rel) && !fs.existsSync(f)) throw new Error(`${PAGE} references a file that does not exist: ${rel}`);
  return hashBuf(read(rel));
}

const nWorker = stampWorker();
stampWorkerOwner();

const src = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');
let out = src;
let n = 0;
for (const { re } of TAGS) {
  out = out.replace(re, (whole, pre, url, post) => {
    if (!isLocal(url)) return whole;
    const rel = bare(url);
    const want = rel + '?v=' + hashOf(rel);
    n++;
    if (url !== want) stale.push(rel);
    return pre + want + post;
  });
}

if (check) {
  if (stale.length) {
    console.error('FAIL stamp-assets: ' + stale.length + ' asset stamp(s) out of date (' + PAGE + ', the worker and its URL):');
    for (const s of stale) console.error('    ' + s);
    console.error('  run: node tools/stamp-assets.mjs');
    process.exit(1);
  }
  console.log('stamp-assets: ' + n + ' page assets + ' + nWorker + ' worker imports + the worker URL, every stamp current');
} else {
  for (const rel of [WORKER, WORKER_OWNER]) if (!virtual.get(rel).equals(fs.readFileSync(path.join(ROOT, rel)))) fs.writeFileSync(path.join(ROOT, rel), virtual.get(rel));
  if (out !== src) fs.writeFileSync(path.join(ROOT, PAGE), out);
  console.log('stamp-assets: ' + n + ' page assets + ' + nWorker + ' worker imports + the worker URL stamped' + (stale.length ? ', ' + stale.length + ' updated' : ', no change'));
}
