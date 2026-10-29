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

function hashOf(rel) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) throw new Error(`${PAGE} references a file that does not exist: ${rel}`);
  return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10);
}

const src = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');
const stale = [];
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
    console.error('FAIL stamp-assets: ' + stale.length + ' asset stamp(s) out of date in ' + PAGE + ':');
    for (const s of stale) console.error('    ' + s);
    console.error('  run: node tools/stamp-assets.mjs');
    process.exit(1);
  }
  console.log('stamp-assets: ' + n + ' assets, every stamp current');
} else {
  if (out !== src) fs.writeFileSync(path.join(ROOT, PAGE), out);
  console.log('stamp-assets: ' + n + ' assets stamped' + (stale.length ? ', ' + stale.length + ' updated' : ', no change'));
}
