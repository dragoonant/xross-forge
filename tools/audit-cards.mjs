// Printed-vs-compiled auditor (KB lesson: a dropped clause or a wrong amount hides behind green tests).
// For every card in data/cards.js it takes the printed Japanese effect text from docs/sources/api/all-cards.json (gitignored;
// the repo never carries it, PLAN D16), strips reminder text （…）, and checks against the card's entry in data/abilities.js:
//   FAIL  a number printed on the card that appears nowhere in the compiled entry (dropped clause / wrong amount)
//   FAIL  a number in the compiled entry (ignoring structural `unit`) that is not printed (invented amount)
//   FAIL  a timing tag printed on the card (【プレイ時】 ...) with no matching effect, or an effect timing the card does not print
// Prints `pending (no docs/sources)` when the dump is absent (CI). --selftest proves the auditor flags known-bad entries.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPage } from './test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DUMP = path.join(ROOT, 'docs/sources/api/all-cards.json');
const TAG = { onPlay: 'プレイ時', attack: 'アタックする', afterAttack: 'アタック後', boost: 'アタック強化', onAwaken: '覚醒時', round: 'ラウンド中' };

const selftest = process.argv.includes('--selftest');
if (!fs.existsSync(DUMP) && !selftest) {
  console.log('audit-cards: pending (no docs/sources)');
  process.exit(0);
}
const XS = loadPage('tests.html').XS;

const zen = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
function printed(text) {
  const t = zen(text || '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
  const tags = new Set([...t.matchAll(/【([^】]+)】/g)].map((m) => m[1]));
  const numbers = new Set([...t.replace(/【[^】]*】/g, '').matchAll(/\d+/g)].map((m) => +m[0]));
  return { tags, numbers };
}
function compiled(entry) {
  const nums = new Set();
  const walk = (v, key) => {
    if (typeof v === 'number') { if (key !== 'unit') nums.add(v); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], k);
  };
  walk(entry.effects, '');
  const tags = new Set(entry.effects.filter((e) => e.timing !== 'static').map((e) => TAG[e.timing]));
  return { tags, numbers: nums };
}
function audit(text, entry) {
  const fails = [];
  const p = printed(text), c = compiled(entry);
  for (const n of p.numbers) if (!c.numbers.has(n)) fails.push(`printed number ${n} is missing from the compiled entry`);
  for (const n of c.numbers) if (!p.numbers.has(n)) fails.push(`compiled number ${n} is not printed on the card`);
  for (const t of p.tags) if (!c.tags.has(t)) fails.push(`printed tag 【${t}】 has no effect`);
  for (const t of c.tags) if (!p.tags.has(t)) fails.push(`effect for 【${t}】 is not printed on the card`);
  return fails;
}

if (selftest) {
  const base = XS.ABIL['ST01-007'];                      // 【アタック後】 40 damage to 1 other opposing leader
  const text = '【アタックする】\n【アタック後】(effect words) 1 (more words) 40 (words).';   // tags and numbers only: no printed text is kept in the repo (PLAN D16)
  const mut = (f) => { const e = JSON.parse(JSON.stringify(base)); f(e); return e; };
  const cases = [
    ['good entry', base, 0],
    ['wrong amount', mut((e) => { e.effects[1].ops[0].n = 41; }), 2],
    ['dropped tag', mut((e) => { e.effects.pop(); }), 2],
    ['extra tag', mut((e) => { e.effects.push({ timing: 'boost', ops: [] }); }), 1],
    ['dropped clause', mut((e) => { e.effects[1].ops = []; }), 1],
  ];
  let bad = 0;
  for (const [name, entry, min] of cases) {
    const n = audit(text, entry).length;
    const ok = min === 0 ? n === 0 : n >= min;
    if (!ok) { bad++; console.log(`FAIL selftest ${name}: ${n} findings, wanted ${min === 0 ? 0 : '>= ' + min}`); }
  }
  console.log(bad ? 'audit-cards: selftest FAILED' : `audit-cards: selftest ok (${cases.length} cases)`);
  process.exit(bad ? 1 : 0);
}

const rows = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
const byNo = new Map();
for (const r of rows) {
  if (r.is_parallel) continue;
  byNo.set(`${r.card_product.code}-${r.card_number}`, r);
}
let fails = 0, nums = 0, tags = 0;
for (const no of Object.keys(XS.CARDS)) {
  const r = byNo.get(no);
  const entry = XS.ABIL[no];
  if (!r) { console.log(`FAIL ${no}: not in the card dump`); fails++; continue; }
  if (!entry) { console.log(`FAIL ${no}: no entry in data/abilities.js`); fails++; continue; }
  const f = audit(r.effect, entry);
  for (const m of f) { console.log(`FAIL ${no} ${XS.CARDS[no].nameEn}: ${m}`); fails++; }
  const p = printed(r.effect);
  nums += p.numbers.size; tags += p.tags.size;
}
console.log(`audit-cards: ${fails ? fails + ' failure(s)' : 'ok'} (${Object.keys(XS.CARDS).length} cards, ${nums} printed numbers and ${tags} timing tags checked)`);
process.exit(fails ? 1 : 0);
