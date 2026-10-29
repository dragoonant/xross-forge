#!/usr/bin/env node
// Fetch the official card pool, FAQ and restriction list from api.xross-stars.com into
// docs/sources/api/ (gitignored: official data never enters the repo; tools/build-cards.mjs
// turns it into data/cards.js in M1). Idempotent: rerunning overwrites with today's copy and
// prints what changed. One request per second; the API is the publisher's, be polite.
//
//   node tools/fetch-cards.mjs           fetch everything
//   node tools/fetch-cards.mjs --quiet   one summary line
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'sources', 'api');
const API = 'https://api.xross-stars.com/v1';
const quiet = process.argv.includes('--quiet');
const log = (...a) => { if (!quiet) console.log(...a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (res.ok) return res.json();
    // 429/5xx back off and retry a few times; anything else is a real failure.
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) { await sleep(2000 * attempt); continue; }
    throw new Error(`${url} -> HTTP ${res.status}`);
  }
}

// Every paged endpoint returns {<listKey>: [...], page_info: {has_next_page}}.
async function fetchAll(path, listKey) {
  const items = [];
  let extra = {};
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const d = await getJson(`${API}/${path}${sep}limit=100&page=${page}`);
    if (!Array.isArray(d[listKey])) throw new Error(`${path}: no "${listKey}" array in response`);
    items.push(...d[listKey]);
    if (page === 1) extra = Object.fromEntries(Object.entries(d).filter(([k]) => k !== listKey && k !== 'page_info'));
    if (!d.page_info?.has_next_page) {
      if (d.page_info && items.length !== d.page_info.total_count) {
        throw new Error(`${path}: got ${items.length}, page_info says ${d.page_info.total_count}`);
      }
      return { items, extra };
    }
    await sleep(1000);
  }
}

function writeIfChanged(name, data) {
  const file = join(outDir, name);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
  const text = JSON.stringify(data, null, 1) + '\n';
  writeFileSync(file, text);
  return before === null ? 'new' : before === text ? 'unchanged' : 'changed';
}

mkdirSync(outDir, { recursive: true });
const fetchedAt = new Date().toISOString();
const cards = await fetchAll('cards', 'cards');
cards.items.sort((a, b) => a.id - b.id);
const faq = await fetchAll('faq', 'faqs');
const restrictions = await fetchAll('cards/restrictions', 'restrictions');

const results = {
  'all-cards.json': writeIfChanged('all-cards.json', cards.items),
  'catalog.json': writeIfChanged('catalog.json', cards.extra), // colours, rarities, tags, products, build rules
  'faq.json': writeIfChanged('faq.json', faq.items),
  'restrictions.json': writeIfChanged('restrictions.json', restrictions.items),
};
writeFileSync(join(outDir, 'FETCHED.txt'), `${fetchedAt}\n${API}\n`);

for (const [f, r] of Object.entries(results)) log(`${f.padEnd(18)} ${r}`);
console.log(`fetch-cards: ${cards.items.length} cards, ${faq.items.length} FAQ, ${restrictions.items.length} restrictions -> docs/sources/api (${fetchedAt})`);
